import { Application, Component, RouterView } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const waitFor = async (cond: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

let log: string[] = [];
let fade = false;

class Svc {
    static count = 0;
    id = ++Svc.count;
    disposed = false;
    dispose() { this.disposed = true; log.push(`svc${this.id} disposed`); }
}

class Shell extends Component {
    static count = 0;
    static all: Shell[] = [];
    id = ++Shell.count;
    constructor(public svc?: Svc) {
        super('main');
        (this.element as HTMLElement).id = `shell-${this.id}`;
        if (fade) this.motif.options.transition.classes = { name: 'fade', duration: 60 } as any;
        this.controls.add(new RouterView({ name: 'default' }));
        Shell.all.push(this);
    }
    onBuilt() {
        log.push(`built shell${this.id}`);
        this.context.onRouterChanged(({ uri }: any) => log.push(`shell${this.id} heard ${uri}`));
        this.motif.setDisposable(() => log.push(`disposed shell${this.id}` + (this.svc ? ` svc${this.svc.id} ${this.svc.disposed ? 'dead' : 'alive'}` : '')));
    }
}

class Page extends Component {
    static count = 0;
    static all: Page[] = [];
    id = ++Page.count;
    constructor() {
        super('p');
        (this.element as HTMLElement).id = `page-${this.id}`;
        Page.all.push(this);
    }
}

const connected = (id: string) => !!document.getElementById(id)?.isConnected;
const shellsOnScreen = (host: HTMLElement) => Array.from(host.querySelectorAll('main')).map(m => m.id);

describe('restartRouter releases the old chain like a leaving page', () => {
    let app: Application;
    let host: HTMLElement;
    let errors: string[];
    let originalError: typeof console.error;

    const start = async (control: any, setup?: (builder: any) => void, extra: any[] = []) => {
        const builder = Application.CreateBuilder();
        setup?.(builder);
        app = builder.build();
        app.useRouter({
            mode: 'history',
            routes: [{ path: '/', control, childs: [{ path: '/', control: () => new Page() }] }, ...extra],
        });
        app.onRouterChanged(({ initial }: any) => log.push(`routerChanged initial=${initial}`));
        app.run(host);
        await tick(100);
        log.length = 0;
    };

    beforeEach(() => {
        log = [];
        fade = false;
        Svc.count = 0;
        Shell.count = 0;
        Shell.all = [];
        Page.count = 0;
        Page.all = [];
        errors = [];
        originalError = console.error;
        console.error = (...args: any[]) => { errors.push(String(args[0])); };
        window.history.replaceState(null, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host.remove();
        console.error = originalError;
        window.history.replaceState(null, '', '/');
    });

    for (const withLeave of [false, true]) {
        const label = withLeave ? 'with a leave transition' : 'without a leave transition';

        test(`${label}: the new layout is built and announced before the old layout's cleanups run`, async () => {
            fade = withLeave;
            await start(() => new Shell());
            app.restartRouter();
            expect(log).toEqual([]);
            await waitFor(() => Shell.all[0].isDisposed);
            expect(log).toEqual(['built shell2', 'routerChanged initial=true', 'shell2 heard /', 'disposed shell1']);
            expect(shellsOnScreen(host)).toEqual(['shell-2']);
        });

        test(`${label}: the old layout stops hearing the router at once`, async () => {
            fade = withLeave;
            await start(() => new Shell());
            app.restartRouter();
            await waitFor(() => Shell.all[0].isDisposed);
            expect(log.filter(e => e.startsWith('shell1 heard'))).toEqual([]);
        });

        test(`${label}: the old layout's scoped service stays alive for its cleanups and closes after`, async () => {
            fade = withLeave;
            await start(Shell, builder => {
                builder.services.addScoped(Svc, Svc);
                builder.services.addTransient(Shell, { useClass: Shell, deps: [Svc] } as any);
            });
            app.restartRouter();
            await waitFor(() => Shell.all[0].isDisposed && log.includes('svc1 disposed'));
            expect(log).toContain('disposed shell1 svc1 alive');
            expect(log.indexOf('svc1 disposed')).toBeGreaterThan(log.indexOf('disposed shell1 svc1 alive'));
        });

        test(`${label}: a keepAlive layout on screen is rebuilt and the old one is released after the new one`, async () => {
            fade = withLeave;
            const builder = Application.CreateBuilder();
            app = builder.build();
            app.useRouter({ mode: 'history', routes: [{ path: '/', keepAlive: true, control: () => new Shell(), childs: [{ path: '/', control: () => new Page() }] }] });
            app.onRouterChanged(({ initial }: any) => log.push(`routerChanged initial=${initial}`));
            app.run(host);
            await tick(100);
            log.length = 0;
            app.restartRouter();
            await waitFor(() => Shell.all[0].isDisposed);
            expect(log).toEqual(['built shell2', 'routerChanged initial=true', 'shell2 heard /', 'disposed shell1']);
            expect(shellsOnScreen(host)).toEqual(['shell-2']);
        });

        test(`${label}: a layout given as an instance survives the restart and stays on screen`, async () => {
            fade = withLeave;
            const given = new Shell();
            await start(given);
            app.restartRouter();
            await tick(300);
            expect(given.isDisposed).toBe(false);
            expect(shellsOnScreen(host)).toEqual(['shell-1']);
            expect(Page.all.length).toBe(2);
            expect(Page.all[0].isDisposed).toBe(true);
            expect(connected('page-2')).toBe(true);
            expect(errors).toEqual([]);
        });

        test(`${label}: a singleton layout survives the restart and stays on screen`, async () => {
            fade = withLeave;
            await start(Shell, builder => builder.services.addSingleton(Shell, { useClass: Shell }));
            const singleton = Shell.all[0];
            app.restartRouter();
            await tick(300);
            expect(singleton.isDisposed).toBe(false);
            expect(Shell.all.length).toBe(1);
            expect(shellsOnScreen(host)).toEqual(['shell-1']);
            expect(connected('page-2')).toBe(true);
            expect(errors).toEqual([]);
        });

        test(`${label}: a second restart before the first one finishes leaves one layout and the overtaken router builds nothing`, async () => {
            fade = withLeave;
            await start(() => new Shell());
            app.restartRouter();
            app.restartRouter();
            await waitFor(() => Shell.all[0].isDisposed);
            await tick(100);
            expect(Shell.all.length).toBe(2);
            expect(shellsOnScreen(host)).toEqual(['shell-2']);
            expect(Shell.all[1].isDisposed).toBe(false);
            expect(log).toEqual(['built shell2', 'routerChanged initial=true', 'shell2 heard /', 'disposed shell1']);
        });

        test(`${label}: a restart while the old layout is still leaving keeps one layout on screen`, async () => {
            fade = withLeave;
            await start(() => new Shell());
            app.restartRouter();
            await tick(withLeave ? 20 : 0);
            app.restartRouter();
            await waitFor(() => Shell.all[0].isDisposed);
            await tick(200);
            expect(shellsOnScreen(host).length).toBe(1);
            expect(Shell.all.filter(s => !s.isDisposed).length).toBe(1);
            expect(errors).toEqual([]);
        });

        test(`${label}: app.dispose right after a restart also releases the old layout`, async () => {
            fade = withLeave;
            await start(() => new Shell());
            app.restartRouter();
            await app.dispose();
            expect(Shell.all.every(s => s.isDisposed)).toBe(true);
        });
    }

    test('restartRouter returns a promise of the first navigation that settles before the old layout is cleaned up', async () => {
        await start(() => new Shell());
        const restarted = app.restartRouter();
        expect(log).toEqual([]);
        const result: any = await restarted;
        log.push('restart settled');
        expect(result.ok).toBe(true);
        expect(result.uri).toBe('/');
        await waitFor(() => Shell.all[0].isDisposed);
        expect(log).toEqual(['built shell2', 'routerChanged initial=true', 'shell2 heard /', 'restart settled', 'disposed shell1']);
    });

    test('the promise of an overtaken restart settles with reason restart', async () => {
        await start(() => new Shell());
        const first = app.restartRouter();
        const second = app.restartRouter();
        expect(await first).toEqual({ ok: false, uri: '/', cancelled: true, reason: 'restart' });
        expect((await second as any).ok).toBe(true);
    });

    test('the promise settles when a guard cancels the first navigation, where onRouterChanged never comes', async () => {
        await start(() => new Shell());
        app.useGuard((_context: any, next: any) => next(false));
        const result: any = await app.restartRouter();
        expect(result).toEqual({ ok: false, cancelled: true, reason: 'guard' });
        expect(log.filter(e => e.startsWith('routerChanged'))).toEqual([]);
    });

    test('before run the promise settles at once with nothing', async () => {
        const builder = Application.CreateBuilder();
        app = builder.build();
        app.useRouter({ mode: 'history', routes: [{ path: '/', control: () => new Shell() }] });
        await expect(app.restartRouter()).resolves.toBeUndefined();
    });

    test('a page given as an instance that is not on screen can be shown after a restart', async () => {
        const given = new Page();
        await start(() => new Shell(), undefined, [{ path: '/given', control: given }]);
        await app.navigate('/given');
        await app.navigate('/');
        app.restartRouter();
        await tick(100);
        const result: any = await app.navigate('/given');
        expect(result.ok).toBe(true);
        expect(given.isDisposed).toBe(false);
        expect(connected(`page-${given.id}`)).toBe(true);
        expect(errors).toEqual([]);
    });

    test('the new layout waits for the old layout to finish its leave transition', async () => {
        fade = true;
        await start(() => new Shell());
        app.restartRouter();
        await tick(20);
        expect(connected('shell-1')).toBe(true);
        expect(connected('shell-2')).toBe(false);
        await waitFor(() => connected('shell-2'));
        expect(connected('shell-1')).toBe(false);
        expect(Shell.all[0].isDisposed).toBe(false);
        await waitFor(() => Shell.all[0].isDisposed);
    });

    test('a restart during a navigation leaves one layout on screen and releases the rest', async () => {
        fade = true;
        await start(() => new Shell(), undefined, [{ path: '/x', control: () => new Shell(), childs: [{ path: '/', control: () => new Page() }] }]);
        const navigation = app.navigate('/x');
        await tick(20);
        app.restartRouter();
        const result: any = await navigation;
        expect(result).toEqual({ ok: false, uri: '/x', cancelled: true, reason: 'restart' });
        await tick(600);
        const shown = shellsOnScreen(host);
        expect(shown.length).toBe(1);
        const alive = Shell.all.filter(s => !s.isDisposed);
        expect(alive.length).toBe(1);
        expect(`shell-${alive[0].id}`).toBe(shown[0]);
        expect(app.router.uri).toBe('/x');
    });

    test('a navigation waiting on a guard when the router restarts ends with reason restart and leaves the address alone', async () => {
        await start(() => new Shell(), undefined, [{ path: '/x', control: () => new Shell(), childs: [{ path: '/', control: () => new Page() }] }]);
        app.useGuard(async (_context: any, next: any) => { await tick(50); next(); });
        const navigation = app.navigate('/x');
        app.restartRouter();
        const result: any = await navigation;
        expect(result).toEqual({ ok: false, uri: '/x', cancelled: true, reason: 'restart' });
        await waitFor(() => Shell.all[0].isDisposed);
        await tick(100);
        expect(window.location.pathname).toBe('/');
        expect(app.router.uri).toBe('/');
        expect(shellsOnScreen(host)).toEqual(['shell-2']);
        expect(log.filter(e => e.startsWith('routerChanged'))).toEqual(['routerChanged initial=true']);
    });

    test('a navigation waiting on a guard when the app is disposed ends with reason dispose and builds nothing', async () => {
        await start(() => new Shell(), undefined, [{ path: '/x', control: () => new Shell(), childs: [{ path: '/', control: () => new Page() }] }]);
        app.useGuard(async (_context: any, next: any) => { await tick(50); next(); });
        const navigation = app.navigate('/x');
        await app.dispose();
        const result: any = await navigation;
        expect(result).toEqual({ ok: false, uri: '/x', cancelled: true, reason: 'dispose' });
        await tick(100);
        expect(Shell.all.length).toBe(1);
        expect(Shell.all[0].isDisposed).toBe(true);
        expect(window.location.pathname).toBe('/');
        expect(log).toEqual(['disposed shell1']);
    });
});
