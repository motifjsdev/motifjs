import { Application, Component, RouterView, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Page extends Component {
    static created: string[] = [];
    constructor(public name: string) {
        super('section');
        Page.created.push(name);
        (this.element as HTMLElement).id = `page-${name}`;
    }
}

class ErrorPage extends Component {
    constructor() {
        super('div');
        (this.element as HTMLElement).id = 'error-page';
    }
}

const page = (name: string) => () => new Page(name);

describe('RouteItem.redirect', () => {
    let app: Application;
    let host: HTMLElement;

    function start(routes: RouteItem[], url: string, extra?: (app: Application) => void) {
        window.history.replaceState({}, '', url);
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        extra?.(app);
        app.useRouter({ routes, fallbacks: { error: ErrorPage } });
        app.run(host);
    }

    beforeEach(() => { Page.created = []; });

    afterEach(() => {
        try { app?.dispose(); } catch { }
        host?.remove();
        (globalThis as any).__MOTIF_DEV__ = false;
    });

    test('string redirect navigates to the target and never creates the source component', async () => {
        start([
            { path: '/home', control: page('home') },
            { path: '/old', control: page('old'), redirect: '/new' },
            { path: '/new', control: page('new') },
        ], '/home');
        await tick();
        await app.router.navigate('/old');
        await tick();
        expect(app.router.uri).toBe('/new');
        expect(window.location.pathname).toBe('/new');
        expect(host.querySelector('#page-new')).not.toBeNull();
        expect(Page.created).not.toContain('old');
    });

    test('a redirect-only route needs no control', async () => {
        const routes: RouteItem[] = [
            { path: '/home', control: page('home') },
            { path: '/old', redirect: '/new' },
            { path: '/new', control: page('new') },
        ];
        start(routes, '/home');
        await tick();
        await app.router.navigate('/old');
        await tick();
        expect(app.router.uri).toBe('/new');
    });

    test('{param} placeholders are filled from the matched params', async () => {
        start([
            { path: '/home', control: page('home') },
            { path: '/p/{id}', redirect: '/users/{id}' },
            { path: '/users/{id}', control: page('user') },
        ], '/home');
        await tick();
        await app.router.navigate('/p/7');
        await tick();
        expect(app.router.uri).toBe('/users/7');
        expect(app.router.params.id).toBe('7');
    });

    test('query string and hash are carried over to a string target', async () => {
        start([
            { path: '/home', control: page('home') },
            { path: '/old', redirect: '/new' },
            { path: '/new', control: page('new') },
        ], '/home');
        await tick();
        await app.router.navigate('/old?x=1#h');
        await tick();
        expect(app.router.uri).toBe('/new?x=1#h');
    });

    test("a target's own query and hash are kept", async () => {
        start([
            { path: '/home', control: page('home') },
            { path: '/old', redirect: '/new?y=2#own' },
            { path: '/new', control: page('new') },
        ], '/home');
        await tick();
        await app.router.navigate('/old?x=1#h');
        await tick();
        expect(app.router.uri).toBe('/new?y=2#own');
    });

    test('a function redirect receives { path, params, meta } and its result is used as is', async () => {
        const seen: any[] = [];
        start([
            { path: '/home', control: page('home') },
            {
                path: '/ara/{q}', meta: { kind: 'search' },
                redirect: (to) => { seen.push(to); return '/search?q=' + to.params.q; }
            },
            { path: '/search', control: page('search') },
        ], '/home');
        await tick();
        await app.router.navigate('/ara/abc#frag');
        await tick();
        expect(app.router.uri).toBe('/search?q=abc');
        expect(seen[0].path).toBe('/ara/abc#frag');
        expect(seen[0].params.q).toBe('abc');
        expect(seen[0].meta.kind).toBe('search');
    });

    test('redirect chains are followed', async () => {
        start([
            { path: '/home', control: page('home') },
            { path: '/a', redirect: '/b' },
            { path: '/b', redirect: '/c' },
            { path: '/c', control: page('c') },
        ], '/home');
        await tick();
        const events: any[] = [];
        app.onRouterChanged((e) => { events.push(e); });
        await app.router.navigate('/a');
        await tick();
        expect(app.router.uri).toBe('/c');
        expect(events[events.length - 1].redirectedFrom).toBe('/a');
    });

    test('a redirect loop shows the error page at the requested address and warns in development', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        start([
            { path: '/home', control: page('home') },
            { path: '/a', redirect: '/b' },
            { path: '/b', redirect: '/a' },
        ], '/home', a => a.useDevelopment());
        await tick();
        await app.router.navigate('/a');
        await tick();
        expect(app.router.ok).toBe(false);
        expect(app.router.uri).toBe('/a');
        expect(window.location.pathname).toBe('/a');
        expect(host.querySelector('#error-page')).not.toBeNull();
        expect(app.router.params.error).toBeInstanceOf(Error);
        expect(warn.mock.calls.some(c => String(c[0]).startsWith('[motifjs] MJX303: Redirect loop'))).toBe(true);
        expect(app.router.params.error.code).toBe('MJX303');
        warn.mockRestore();
        app.useDevelopment(false);
    });

    test('more than 10 redirects stop with the error page', async () => {
        const routes: RouteItem[] = [{ path: '/home', control: page('home') }];
        for (let i = 0; i < 12; i++) routes.push({ path: `/r${i}`, redirect: `/r${i + 1}` });
        routes.push({ path: '/r12', control: page('end') });
        start(routes, '/home');
        await tick();
        await app.router.navigate('/r0');
        await tick();
        expect(app.router.ok).toBe(false);
        expect(host.querySelector('#error-page')).not.toBeNull();
        expect(Page.created).not.toContain('end');
    });

    test('exactly 10 redirects are allowed', async () => {
        const routes: RouteItem[] = [{ path: '/home', control: page('home') }];
        for (let i = 0; i < 10; i++) routes.push({ path: `/r${i}`, redirect: `/r${i + 1}` });
        routes.push({ path: '/r10', control: page('end') });
        start(routes, '/home');
        await tick();
        await app.router.navigate('/r0');
        await tick();
        expect(app.router.uri).toBe('/r10');
        expect(Page.created).toContain('end');
    });

    test('guards run only for the target and see redirectedFrom', async () => {
        const guarded: any[] = [];
        start([
            { path: '/home', control: page('home') },
            { path: '/old', redirect: '/new' },
            { path: '/new', control: page('new') },
        ], '/home', a => a.useGuard((ctx, next) => { guarded.push(ctx.to); next(); }));
        await tick();
        guarded.length = 0;
        await app.router.navigate('/old');
        await tick();
        expect(guarded.map(t => t.path)).toEqual(['/new']);
        expect(guarded[0].redirectedFrom).toBe('/old');
    });

    test("the previous route's onLeave sees the target and redirectedFrom", async () => {
        const leaves: any[] = [];
        start([
            { path: '/home', control: page('home'), onLeave: (ctx) => { leaves.push(ctx.to); } },
            { path: '/old', redirect: '/new' },
            { path: '/new', control: page('new') },
        ], '/home');
        await tick();
        await app.router.navigate('/old');
        await tick();
        expect(leaves.length).toBe(1);
        expect(leaves[0].path).toBe('/new');
        expect(leaves[0].redirectedFrom).toBe('/old');
    });

    test('a plain navigation has no redirectedFrom', async () => {
        start([
            { path: '/home', control: page('home') },
            { path: '/new', control: page('new') },
        ], '/home');
        await tick();
        const events: any[] = [];
        app.onRouterChanged((e) => { events.push(e); });
        await app.router.navigate('/new');
        await tick();
        expect(events[0].redirectedFrom).toBeUndefined();
    });

    test('redirecting to the current address is skipped', async () => {
        start([
            { path: '/new', control: page('new') },
            { path: '/old', redirect: '/new' },
        ], '/new');
        await tick();
        const created = Page.created.length;
        const result = await app.router.navigate('/old');
        await tick();
        expect(Page.created.length).toBe(created);
        expect(app.router.uri).toBe('/new');
    });

    test('only the matched leaf redirects: a layout with a default child is not redirected', async () => {
        class Layout extends Component {
            constructor() { super('div'); this.controls.add(new RouterView({ name: 'default' })); }
        }
        start([
            { path: '/home', control: page('home') },
            {
                path: '/docs', control: Layout, redirect: '/home', childs: [
                    { path: '/', control: page('docs-index') },
                ]
            },
        ], '/home');
        await tick();
        await app.router.navigate('/docs');
        await tick();
        expect(app.router.uri).toBe('/docs');
        expect(host.querySelector('#page-docs-index')).not.toBeNull();
    });

    test('a redirect on the default child works', async () => {
        class Layout extends Component {
            constructor() { super('div'); this.controls.add(new RouterView({ name: 'default' })); }
        }
        start([
            { path: '/home', control: page('home') },
            {
                path: '/docs', control: Layout, childs: [
                    { path: '/', redirect: '/docs/intro' },
                    { path: '/intro', control: page('intro') },
                ]
            },
        ], '/home');
        await tick();
        await app.router.navigate('/docs');
        await tick();
        expect(app.router.uri).toBe('/docs/intro');
        expect(host.querySelector('#page-intro')).not.toBeNull();
    });
});

describe('redirect and guard history handling', () => {
    let app: Application;
    let host: HTMLElement;

    function start(routes: RouteItem[], url: string, mode?: 'history' | 'hash', extra?: (app: Application) => void) {
        window.history.replaceState({}, '', url);
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        extra?.(app);
        app.useRouter({ routes, mode });
        app.run(host);
    }

    afterEach(() => {
        try { app?.dispose(); } catch { }
        host?.remove();
        window.history.replaceState({}, '', '/');
    });

    const routes = (): RouteItem[] => [
        { path: '/home', control: () => new Component('div') },
        { path: '/old', redirect: '/new' },
        { path: '/new', control: () => new Component('div') },
        { path: '/admin', control: () => new Component('div') },
        { path: '/login', control: () => new Component('div') },
    ];

    test('initial load on a redirecting address replaces the history entry', async () => {
        const before = window.history.length;
        start(routes(), '/old');
        await tick();
        expect(window.location.pathname).toBe('/new');
        expect(window.history.length).toBe(before);
    });

    test('a programmatic redirect pushes only the target', async () => {
        start(routes(), '/home');
        await tick();
        const before = window.history.length;
        await app.router.navigate('/old');
        await tick();
        expect(window.location.pathname).toBe('/new');
        expect(window.history.length).toBe(before + 1);
    });

    test('hash mode: initial load on a redirecting address replaces the entry', async () => {
        const before = window.history.length;
        start(routes(), '/#/old', 'hash');
        await tick();
        expect(window.location.hash).toBe('#/new');
        expect(window.history.length).toBe(before);
    });

    test('guard redirect on initial load replaces the blocked address', async () => {
        const before = window.history.length;
        start(routes(), '/admin', 'history', a => a.useGuard((ctx, next) => {
            if (ctx.to.path === '/admin') next('/login'); else next();
        }));
        await tick();
        expect(window.location.pathname).toBe('/login');
        expect(window.history.length).toBe(before);
    });

    test('guard redirect from another page pushes the target', async () => {
        start(routes(), '/home', 'history', a => a.useGuard((ctx, next) => {
            if (ctx.to.path === '/admin') next('/login'); else next();
        }));
        await tick();
        const before = window.history.length;
        await app.router.navigate('/admin');
        await tick();
        expect(window.location.pathname).toBe('/login');
        expect(window.history.length).toBe(before + 1);
    });

    test('hash mode honours replace for navigate()', async () => {
        start(routes(), '/#/home', 'hash');
        await tick();
        const before = window.history.length;
        await app.router.navigate('/new', { replace: true });
        await tick();
        expect(window.location.hash).toBe('#/new');
        expect(window.history.length).toBe(before);
    });
});
