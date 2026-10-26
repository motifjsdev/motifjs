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
const el = (id: string) => document.getElementById(id) as HTMLElement | null;
const connected = (id: string) => !!el(id)?.isConnected;

class Svc {
    static count = 0;
    id = ++Svc.count;
    disposed = false;
    dispose() { this.disposed = true; log.push(`svc${this.id} disposed`); }
}

class Layout extends Component {
    constructor(public name: string, leave = 0) {
        super('div');
        (this.element as HTMLElement).id = `layout-${name}`;
        if (leave) this.motif.options.transition.classes = { name: 'lay', duration: leave } as any;
        this.controls.add(new RouterView({ name: 'default' }));
    }
    onDisposed() { log.push(`layout ${this.name} disposed`); }
}

class Page extends Component {
    static all: Page[] = [];
    constructor(public name: string, leave = 0, public svc?: Svc) {
        super('section');
        (this.element as HTMLElement).id = `page-${name}`;
        if (leave) this.motif.options.transition.classes = { name: 'pg', duration: leave } as any;
        Page.all.push(this);
    }
    onBuilt() {
        this.context.onRouterChanged(({ uri }: any) => log.push(`page ${this.name} heard ${uri}`));
        this.motif.setDisposable(() => log.push(`page ${this.name} cleanup` + (this.svc ? ` svc${this.svc.id} ${this.svc.disposed ? 'dead' : 'alive'}` : '')));
    }
    onActivated() { log.push(`page ${this.name} activated`); }
    onDeactivated() { log.push(`page ${this.name} deactivated`); }
}

class ScopedPage extends Page {
    constructor(svc: Svc) { super('scoped', 0, svc); }
}

describe('a leaving route chain leaves as one piece', () => {
    let app: Application;
    let host: HTMLElement;

    const start = async (routes: any[], setup?: (builder: any) => void) => {
        const builder = Application.CreateBuilder();
        setup?.(builder);
        app = builder.build();
        app.useRouter({ mode: 'history', routes });
        app.run(host);
        await tick(100);
        log.length = 0;
    };

    const twoLayouts = (layoutLeave: number, pageLeave: number) => [
        { path: '/', control: () => new Layout('a', layoutLeave), childs: [{ path: '/', control: () => new Page('a', pageLeave) }] },
        { path: '/x', control: () => new Layout('b'), childs: [{ path: '/', control: () => new Page('b') }] },
    ];

    beforeEach(() => {
        log = [];
        Svc.count = 0;
        Page.all = [];
        window.history.replaceState(null, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host.remove();
        window.history.replaceState(null, '', '/');
    });

    test('a layout with a leave transition leaves with its page still inside', async () => {
        await start(twoLayouts(80, 0));
        const done = app.navigate('/x');
        await tick(20);
        expect(el('layout-a')?.classList.contains('lay-leave-active')).toBe(true);
        expect(connected('page-a')).toBe(true);
        expect(el('page-a')?.parentElement?.closest('#layout-a')).toBeTruthy();
        expect(connected('page-b')).toBe(false);
        await done;
        expect(connected('layout-a')).toBe(false);
        expect(connected('page-a')).toBe(false);
        expect(connected('page-b')).toBe(true);
    });

    test('a page with a leave transition still plays it when its layout has none', async () => {
        await start(twoLayouts(0, 80));
        const done = app.navigate('/x');
        await tick(20);
        expect(el('page-a')?.classList.contains('pg-leave-active')).toBe(true);
        expect(connected('layout-a')).toBe(true);
        await done;
        expect(connected('layout-a')).toBe(false);
        expect(connected('page-b')).toBe(true);
    });

    test('when the page and the layout both have a leave transition they play together', async () => {
        await start(twoLayouts(80, 80));
        const done = app.navigate('/x');
        await tick(20);
        expect(el('layout-a')?.classList.contains('lay-leave-active')).toBe(true);
        expect(el('page-a')?.classList.contains('pg-leave-active')).toBe(true);
        await done;
        expect(connected('page-b')).toBe(true);
    });

    test('a page whose leave ends first stays hidden until the layout has left', async () => {
        await start(twoLayouts(300, 20));
        const done = app.navigate('/x');
        await tick(180);
        expect(connected('page-a')).toBe(true);
        expect(el('page-a')?.classList.contains('pg-leave-active')).toBe(false);
        expect(el('page-a')?.style.visibility).toBe('hidden');
        expect(connected('layout-a')).toBe(true);
        await done;
        expect(connected('layout-a')).toBe(false);
    });

    test('when the layout leaves first the new page does not wait for the page inside it', async () => {
        await start(twoLayouts(20, 400));
        const started = Date.now();
        await app.navigate('/x');
        expect(Date.now() - started).toBeLessThan(250);
        expect(connected('layout-a')).toBe(false);
        expect(connected('page-b')).toBe(true);
    });

    test('the page inside a leaving layout stops hearing the router at once and is cleaned up after the new page arrives', async () => {
        await start(twoLayouts(60, 0));
        const a = Page.all[0];
        await app.navigate('/x');
        await waitFor(() => a.isDisposed);
        expect(log.filter(e => e.startsWith('page a heard'))).toEqual([]);
        expect(log.indexOf('page a cleanup')).toBeGreaterThan(log.indexOf('page b heard /x'));
    });

    test('a page built in a later navigation than its layout keeps its scoped service for its cleanup', async () => {
        await start([
            { path: '/', control: () => new Layout('a', 60), childs: [{ path: '/', control: () => new Page('home') }, { path: '/s', control: ScopedPage }] },
            { path: '/x', control: () => new Layout('b'), childs: [{ path: '/', control: () => new Page('b') }] },
        ], builder => {
            builder.services.addScoped(Svc, Svc);
            builder.services.addTransient(ScopedPage, { useClass: ScopedPage, deps: [Svc] } as any);
        });
        await app.navigate('/s');
        const scoped = Page.all.find(p => p.name === 'scoped')!;
        const svc = scoped.svc!;
        log.length = 0;
        await app.navigate('/x');
        await waitFor(() => scoped.isDisposed && svc.disposed);
        expect(log).toContain(`page scoped cleanup svc${svc.id} alive`);
        expect(log.indexOf(`svc${svc.id} disposed`)).toBeGreaterThan(log.indexOf(`page scoped cleanup svc${svc.id} alive`));
    });

    test('a keepAlive page inside a leaving layout leaves with it, is deactivated at once and comes back as the same page', async () => {
        await start([
            { path: '/', control: () => new Layout('a', 80), childs: [{ path: '/', keepAlive: true, control: () => new Page('k') }] },
            { path: '/x', control: () => new Layout('b'), childs: [{ path: '/', control: () => new Page('b') }] },
        ]);
        const k = Page.all[0];
        const done = app.navigate('/x');
        await tick(20);
        expect(log).toContain('page k deactivated');
        expect(connected('page-k')).toBe(true);
        expect(el('page-k')?.parentElement?.closest('#layout-a')).toBeTruthy();
        await done;
        expect(connected('page-k')).toBe(false);
        await tick(50);
        expect(k.isDisposed).toBe(false);
        await app.navigate('/');
        expect(Page.all.filter(p => p.name === 'k').length).toBe(1);
        expect(connected('page-k')).toBe(true);
        expect(log).toContain('page k activated');
    });

    test('going back to a keepAlive page while its old layout is still leaving shows it once and loses nothing', async () => {
        await start([
            { path: '/', control: () => new Layout('a', 120), childs: [{ path: '/', keepAlive: true, control: () => new Page('k') }] },
            { path: '/x', control: () => new Layout('b'), childs: [{ path: '/', control: () => new Page('b') }] },
        ]);
        const k = Page.all[0];
        void app.navigate('/x');
        await tick(20);
        await app.navigate('/');
        await tick(300);
        expect(k.isDisposed).toBe(false);
        expect(connected('page-k')).toBe(true);
        expect(host.querySelectorAll('[id^=layout-]').length).toBe(1);
        expect(host.querySelectorAll('#page-k').length).toBe(1);
    });

    test('a restart lets the old layout leave with its page inside', async () => {
        await start(twoLayouts(80, 0));
        const oldLayout = el('layout-a')!;
        const oldPage = el('page-a')!;
        app.restartRouter();
        await tick(20);
        expect(oldLayout.classList.contains('lay-leave-active')).toBe(true);
        expect(oldPage.isConnected).toBe(true);
        expect(oldPage.parentElement?.closest('#layout-a')).toBe(oldLayout);
        await waitFor(() => !oldLayout.isConnected);
        await waitFor(() => host.querySelectorAll('#page-a').length === 1);
        expect(oldPage.isConnected).toBe(false);
    });
});
