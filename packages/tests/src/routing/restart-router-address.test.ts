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
let fade = 0;

class Shell extends Component {
    static count = 0;
    static all: Shell[] = [];
    id = ++Shell.count;
    constructor() {
        super('main');
        (this.element as HTMLElement).id = `shell-${this.id}`;
        if (fade) this.motif.options.transition.classes = { name: 'fade', duration: fade } as any;
        this.controls.add(new RouterView({ name: 'default' }));
        Shell.all.push(this);
    }
    onBuilt() {
        log.push(`built shell${this.id}`);
    }
}

class Layout extends Component {
    constructor() {
        super('main');
        (this.element as HTMLElement).id = 'layout';
        this.controls.add(new RouterView({ name: 'default' }));
        this.bindings.method(() => {
            log.push(`layout sees ${JSON.stringify(Application.main.router.uri)}`);
            return '';
        });
    }
    onActivated() { log.push('layout activated'); }
    onDeactivated() { log.push('layout deactivated'); }
}

class Page extends Component {
    static count = 0;
    id = ++Page.count;
    constructor() {
        super('p');
        (this.element as HTMLElement).id = `page-${this.id}`;
        const id = this.id;
        this.bindings.method(() => {
            log.push(`page${id} sees ${JSON.stringify(Application.main.router.uri)}`);
            return '';
        });
    }
}

const shellsOnScreen = (host: HTMLElement) => Array.from(host.querySelectorAll('main')).map(m => m.id);
const page = () => new Page();

describe('restartRouter starts at the root or at the given address', () => {
    let app: Application;
    let host: HTMLElement;
    let errors: string[];
    let originalError: typeof console.error;

    const routesWith = (shell: any) => [
        { path: '/', control: shell, childs: [{ path: '/', control: page }] },
        { path: '/u/{name}', control: shell, childs: [{ path: '/', control: page }] },
        { path: '/x', control: shell, childs: [{ path: '/', control: page }] },
        { path: '/login', control: shell, childs: [{ path: '/', control: page }] },
    ];

    const start = async (at: string, shell: () => any = () => () => new Shell(), mode: 'history' | 'hash' = 'history') => {
        window.history.replaceState(null, '', mode === 'hash' ? '/#' + at : at);
        app = Application.CreateBuilder().build();
        app.useRouter({ mode, routes: routesWith(shell()) });
        app.onRouterChanged(({ uri, initial }: any) => log.push(`routerChanged ${uri} initial=${initial}`));
        app.run(host);
        await tick(100);
        log.length = 0;
    };

    beforeEach(() => {
        log = [];
        fade = 0;
        Shell.count = 0;
        Shell.all = [];
        Page.count = 0;
        errors = [];
        originalError = console.error;
        console.error = (...args: any[]) => { errors.push(String(args[0])); };
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host.remove();
        console.error = originalError;
        window.history.replaceState(null, '', '/');
    });

    test('the old page never sees an empty route while the restart runs', async () => {
        await start('/u/ali');
        await app.restartRouter();
        await tick(100);
        expect(log.filter(e => e.startsWith('page1 sees'))).toEqual([]);
        const fresh = log.filter(e => e.startsWith('page2 sees'));
        expect(fresh.length).toBeGreaterThan(0);
        expect(fresh.every(e => e === 'page2 sees "/"')).toBe(true);
        expect(app.router.uri).toBe('/');
    });

    test('with a leave transition the old page never sees an empty route either', async () => {
        fade = 60;
        await start('/u/ali');
        await app.restartRouter();
        await tick(300);
        expect(log.filter(e => e.startsWith('page1 sees'))).toEqual([]);
        expect(app.router.uri).toBe('/');
        expect(shellsOnScreen(host)).toEqual(['shell-2']);
    });

    test('a layout given as an instance stays in place and sees the route change in one step', async () => {
        let layout!: Layout;
        await start('/u/ali', () => (layout = new Layout()));
        expect(log).toEqual([]);
        await app.restartRouter();
        await tick(100);
        const seen = log.filter(e => e.startsWith('layout sees'));
        expect(seen).not.toContain('layout sees ""');
        expect(seen[seen.length - 1]).toBe('layout sees "/"');
        expect(log.filter(e => e.includes('activated'))).toEqual([]);
        expect(host.querySelector('#layout')).toBe(layout.element);
        expect(host.querySelectorAll('#layout p').length).toBe(1);
        expect(app.router.uri).toBe('/');
    });

    test('a guard redirect during the restart replaces the address and adds no history entry', async () => {
        await start('/u/ali');
        app.useGuard((context: any, next: any) => next(context.to.path === '/' ? '/login' : undefined));
        const entries = window.history.length;
        const result: any = await app.restartRouter();
        expect(result.ok).toBe(true);
        expect(app.router.uri).toBe('/login');
        expect(window.location.pathname).toBe('/login');
        expect(window.history.length).toBe(entries);
        expect(log.filter(e => e.startsWith('routerChanged'))).toEqual(['routerChanged /login initial=true']);
    });

    test('a guard cancel still restarts: the old layout leaves with its transition, then the route empties and the address stays', async () => {
        fade = 60;
        await start('/u/ali');
        app.useGuard((context: any, next: any) => next(context.to.path !== '/'));
        const oldShell = Shell.all[0];
        const result: any = await app.restartRouter();
        expect(result).toEqual({ ok: false, cancelled: true, reason: 'guard' });
        expect(oldShell.element!.isConnected).toBe(true);
        expect((oldShell.element as HTMLElement).classList.contains('fade-leave-active')).toBe(true);
        expect(app.router.uri).toBe('/u/ali');
        await waitFor(() => !oldShell.element!.isConnected);
        await tick(50);
        expect(app.router.uri).toBe('');
        expect(app.router.ok).toBe(false);
        expect(window.location.pathname).toBe('/u/ali');
        expect(shellsOnScreen(host)).toEqual([]);
        expect(log.filter(e => e.startsWith('page1 sees'))).toEqual([]);
        expect(log.filter(e => e.startsWith('routerChanged'))).toEqual([]);
        expect(app.router.routes.length).toBeGreaterThan(0);
        await waitFor(() => oldShell.isDisposed);
        expect(errors).toEqual([]);
    });

    test('a navigation right after a cancelled restart waits for the old layout to leave', async () => {
        fade = 200;
        await start('/u/ali');
        app.useGuard((context: any, next: any) => next(context.to.path !== '/'));
        const oldShell = Shell.all[0];
        await app.restartRouter();
        const navigation = app.navigate('/x');
        await tick(100);
        expect(shellsOnScreen(host)).toEqual(['shell-1']);
        expect((oldShell.element as HTMLElement).classList.contains('fade-leave-active')).toBe(true);
        const result: any = await navigation;
        expect(result.ok).toBe(true);
        await tick(50);
        expect(shellsOnScreen(host)).toEqual(['shell-2']);
        expect(app.router.uri).toBe('/x');
        await waitFor(() => oldShell.isDisposed);
        expect(Shell.all.filter(s => !s.isDisposed).length).toBe(1);
        expect(errors).toEqual([]);
    });

    test('a second restart while the first one waits on a guard lets the second one take the old layout', async () => {
        await start('/u/ali');
        app.useGuard(async (_context: any, next: any) => { await tick(50); next(); });
        const first = app.restartRouter();
        const second = app.restartRouter();
        const results: any[] = await Promise.all([first, second]);
        expect(results[0]).toEqual({ ok: false, uri: '/', cancelled: true, reason: 'restart' });
        expect(results[1].ok).toBe(true);
        await tick(100);
        expect(shellsOnScreen(host)).toEqual(['shell-2']);
        expect(Shell.all.filter(s => !s.isDisposed).map(s => s.id)).toEqual([2]);
        expect(log.filter(e => e.startsWith('routerChanged'))).toEqual(['routerChanged / initial=true']);
    });

    test('app.dispose while the old layout leaves after a cancelled restart releases everything', async () => {
        fade = 200;
        await start('/u/ali');
        app.useGuard((context: any, next: any) => next(context.to.path !== '/'));
        await app.restartRouter();
        await tick(20);
        await app.dispose();
        expect(Shell.all.every(s => s.isDisposed)).toBe(true);
        expect(host.querySelectorAll('main').length).toBe(0);
        expect(errors).toEqual([]);
    });

    test('restarting at the same address keeps the entry state, restarting elsewhere drops it', async () => {
        await start('/');
        await app.navigate('/x', { state: { from: 'list' } });
        expect(app.router.state).toEqual({ from: 'list' });

        await app.restartRouter('/x');
        expect(app.router.uri).toBe('/x');
        expect(app.router.state).toEqual({ from: 'list' });
        expect(window.history.state.from).toBe('list');

        await app.restartRouter();
        expect(app.router.uri).toBe('/');
        expect(app.router.state).toBeUndefined();
        expect(window.history.state.from).toBeUndefined();
        expect(window.location.pathname).toBe('/');
    });

    test('an address missing from the table shows the not-found page inside the root layout', async () => {
        await start('/u/ali');
        const oldShell = Shell.all[0];
        const result: any = await app.restartRouter('/gone');
        expect(result.ok).toBe(false);
        expect(app.router.ok).toBe(false);
        expect(app.router.uri).toBe('/gone');
        expect(window.location.pathname).toBe('/gone');
        await waitFor(() => oldShell.isDisposed);
        expect(shellsOnScreen(host)).toEqual(['shell-2']);
        expect(host.querySelector('#shell-2 h2')?.textContent).toContain('404');
    });

    test('hash mode: a guard redirect during the restart replaces the hash', async () => {
        await start('/u/ali', undefined, 'hash');
        app.useGuard((context: any, next: any) => next(context.to.path === '/' ? '/login' : undefined));
        const entries = window.history.length;
        const result: any = await app.restartRouter();
        expect(result.ok).toBe(true);
        expect(window.location.hash).toBe('#/login');
        expect(window.history.length).toBe(entries);
    });
});
