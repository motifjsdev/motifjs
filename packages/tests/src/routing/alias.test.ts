import { Application, Component, RouterView, RouterLink, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Page extends Component {
    static created: string[] = [];
    constructor(public name: string) {
        super('section');
        Page.created.push(name);
        (this.element as HTMLElement).id = `page-${name}`;
    }
}

class UsersLayout extends Component {
    constructor() {
        super('div');
        (this.element as HTMLElement).id = 'users-layout';
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

const page = (name: string) => () => new Page(name);

describe('RouteItem.alias', () => {
    let app: Application;
    let host: HTMLElement;

    function start(routes: RouteItem[], url: string) {
        window.history.replaceState({}, '', url);
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes });
        app.run(host);
    }

    beforeEach(() => { Page.created = []; });

    afterEach(() => {
        try { app?.dispose(); } catch { }
        host?.remove();
    });

    const usersRoutes = (onUpdate?: (ctx: any) => void): RouteItem[] => [
        { path: '/home', control: page('home') },
        {
            path: '/users', control: UsersLayout, alias: '/people', childs: [
                { path: '/', control: page('list') },
                { path: '/{id}', name: 'user', control: page('detail'), alias: '/profile/{id}', onUpdate },
            ]
        },
    ];

    test('an alias opens the same route and keeps its own address', async () => {
        start(usersRoutes(), '/home');
        await tick();
        await app.router.navigate('/people');
        await tick();
        expect(app.router.ok).toBe(true);
        expect(app.router.uri).toBe('/people');
        expect(window.location.pathname).toBe('/people');
        expect(host.querySelector('#page-list')).not.toBeNull();
    });

    test('children open under a layout alias with params from the alias pattern', async () => {
        start(usersRoutes(), '/home');
        await tick();
        await app.router.navigate('/people/5');
        await tick();
        expect(host.querySelector('#page-detail')).not.toBeNull();
        expect(app.router.params.id).toBe('5');
    });

    test('a child alias is joined to the parent path like path', async () => {
        start(usersRoutes(), '/home');
        await tick();
        await app.router.navigate('/users/profile/9');
        await tick();
        expect(host.querySelector('#page-detail')).not.toBeNull();
        expect(app.router.params.id).toBe('9');
        await app.router.navigate('/profile/9');
        await tick();
        expect(app.router.ok).toBe(false);
    });

    test('fullPath is the matched pattern and aliasOf the canonical one', async () => {
        start(usersRoutes(), '/home');
        await tick();
        await app.router.navigate('/people/5');
        await tick();
        expect(app.router.fullPath).toBe('/people/{id}');
        expect(app.router.aliasOf).toBe('/users/{id}');
        await app.router.navigate('/users/5');
        await tick();
        expect(app.router.fullPath).toBe('/users/{id}');
        expect(app.router.aliasOf).toBeNull();
    });

    test('switching between canonical path and alias keeps the component', async () => {
        const updates: any[] = [];
        start(usersRoutes(ctx => updates.push(ctx)), '/home');
        await tick();
        await app.router.navigate('/users/5');
        await tick();
        const first = host.querySelector('#page-detail');
        await app.router.navigate('/people/5');
        await tick();
        expect(host.querySelector('#page-detail')).toBe(first);
        expect(Page.created.filter(n => n === 'detail').length).toBe(1);
        expect(updates.length).toBe(0);
        await app.router.navigate('/users/profile/6');
        await tick();
        expect(updates.length).toBe(1);
        expect(updates[0].to.params.id).toBe('6');
    });

    test('the layout is kept when moving between canonical and alias children', async () => {
        start(usersRoutes(), '/home');
        await tick();
        await app.router.navigate('/users');
        await tick();
        const layout = host.querySelector('#users-layout');
        await app.router.navigate('/people/3');
        await tick();
        expect(host.querySelector('#users-layout')).toBe(layout);
    });

    test('keepAlive cache is shared by canonical path and alias', async () => {
        start([
            { path: '/home', control: page('home') },
            { path: '/k', control: page('k'), keepAlive: true, alias: '/kk' },
        ], '/home');
        await tick();
        await app.router.navigate('/k');
        await tick();
        const first = host.querySelector('#page-k');
        await app.router.navigate('/home');
        await tick();
        await app.router.navigate('/kk');
        await tick();
        expect(host.querySelector('#page-k')).toBe(first);
        expect(Page.created.filter(n => n === 'k').length).toBe(1);
    });

    test("a canonical path wins over another route's alias", async () => {
        start([
            { path: '/home', control: page('home') },
            { path: '/a', control: page('a') },
            { path: '/b', control: page('b'), alias: '/a' },
        ], '/home');
        await tick();
        await app.router.navigate('/a');
        await tick();
        expect(host.querySelector('#page-a')).not.toBeNull();
        expect(host.querySelector('#page-b')).toBeNull();
    });

    test('navigateByName always produces the canonical path', async () => {
        start(usersRoutes(), '/people/1');
        await tick();
        await app.router.navigateByName('user', { id: '4' });
        await tick();
        expect(app.router.uri).toBe('/users/4');
    });

    test('RouterLink classes follow the URL, not the route record', async () => {
        let link!: RouterLink;
        class Shell extends Component {
            constructor() {
                super('div');
                link = new RouterLink({ to: '/users', el: 'a', activeClass: 'on' });
                this.controls.add(link, new RouterView({ name: 'default' }));
            }
        }
        start([
            {
                path: '/', control: Shell, childs: [
                    { path: '/home', control: page('home') },
                    { path: '/users', control: page('users'), alias: '/people' },
                ]
            },
        ], '/people');
        await tick();
        expect((link.element as HTMLElement).classList.contains('on')).toBe(false);
        await app.router.navigate('/users');
        await tick();
        expect((link.element as HTMLElement).classList.contains('on')).toBe(true);
    });
});

describe('route linter alias warnings', () => {
    let warn: jest.SpyInstance;
    let app: Application;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        app = Application.CreateBuilder().build();
        app.useDevelopment();
    });

    afterEach(() => {
        warn.mockRestore();
        app.useDevelopment(false);
        try { app.dispose(); } catch { }
    });

    const codes = () => warn.mock.calls.map(c => String(c[0])).filter(s => s.startsWith('[motifjs] MJX31'));

    test('alias equal to its own path', () => {
        app.useRouter({ routes: [{ path: '/a', control: () => new Component('div'), alias: '/a' }] });
        expect(codes().some(c => c.includes('MJX315'))).toBe(true);
    });

    test('two routes with the same alias', () => {
        app.useRouter({
            routes: [
                { path: '/a', control: () => new Component('div'), alias: '/x' },
                { path: '/b', control: () => new Component('div'), alias: '/x' },
            ]
        });
        expect(codes().some(c => c.includes('MJX316'))).toBe(true);
    });

    test('child alias without a leading slash', () => {
        app.useRouter({
            routes: [{
                path: '/p', control: () => new Component('div'), childs: [
                    { path: '/c', control: () => new Component('div'), alias: 'd' },
                ]
            }]
        });
        expect(codes().some(c => c.includes('MJX314'))).toBe(true);
    });

    test('valid aliases produce no alias warnings', () => {
        app.useRouter({
            routes: [{
                path: '/p', control: () => new Component('div'), alias: '/q', childs: [
                    { path: '/c', control: () => new Component('div'), alias: '/d' },
                ]
            }]
        });
        expect(codes().filter(c => c.includes('ALIAS'))).toEqual([]);
    });
});
