import { Application, Component, MotifError, RouterView } from '@motifx/core';
import type { RouteItem } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

const page = (name: string) => () => {
    const c = new Component('div');
    (c.element as HTMLElement).id = name;
    return c;
};

const layout = () => {
    const c = new Component('div');
    c.controls.add(new RouterView({}));
    return c;
};

const routes: RouteItem[] = [
    { path: '/', name: 'home', control: page('home'), meta: { title: 'Home' } },
    { path: '/users/{id}', name: 'user', control: page('user'), meta: { title: 'User' }, alias: '/u/{id}' },
    {
        path: '/admin', name: 'admin', control: layout, childs: [
            { path: '/', name: 'admin-home', control: page('admin-home') },
            { path: '/logs/{day}', name: 'admin-logs', control: page('admin-logs'), meta: { title: 'Logs' } },
        ]
    },
];

describe('app.router facade: resolve, href, routes', () => {
    let app: Application;
    let host: HTMLElement;

    beforeEach(async () => {
        window.history.replaceState({}, '', '/');
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes });
        app.run(host);
        await tick();
    });

    afterEach(() => {
        app.dispose();
        host.remove();
    });

    test('resolve matches without navigating', () => {
        const hit = app.router.resolve('/users/5');
        expect(hit.ok).toBe(true);
        expect(hit.route?.name).toBe('user');
        expect(hit.params.id).toBe('5');
        expect(app.router.uri).toBe('/');
        expect(window.location.pathname).toBe('/');

        const nested = app.router.resolve('/admin/logs/2026-09-27');
        expect(nested.ok).toBe(true);
        expect(nested.route?.name).toBe('admin-logs');
        expect(nested.params.day).toBe('2026-09-27');
        expect(nested.chain.map(r => r.name)).toEqual(['admin', 'admin-logs']);

        expect(app.router.resolve('/missing').ok).toBe(false);
    });

    test('href builds the path of a named route', () => {
        expect(app.router.href('home')).toBe('/');
        expect(app.router.href('user', { id: 7 })).toBe('/users/7');
        expect(app.router.href('admin-logs', { day: 'today' })).toBe('/admin/logs/today');
        expect(() => app.router.href('missing')).toThrow(MotifError);
        expect(() => app.router.href('missing')).toThrow('MJX302');
    });

    test('href and navigateByName reach the same address', async () => {
        await app.router.navigateByName('user', { id: 9 });
        expect(app.router.uri).toBe(app.router.href('user', { id: 9 }));
        await app.router.navigateByName('home');
        expect(app.router.uri).toBe('/');
    });

    test('routes lists the route table without aliases', () => {
        const list = app.router.routes;
        expect(list.map(r => r.name)).toEqual(['home', 'user', 'admin', 'admin-home', 'admin-logs']);
        expect(list.map(r => r.fullPath)).toEqual(['/', '/users/{id}', '/admin', '/admin', '/admin/logs/{day}']);
        const user = list.find(r => r.name === 'user')!;
        expect(user.meta).toEqual({ title: 'User' });
        expect(user.route.path).toBe('/users/{id}');
        const logs = list.find(r => r.name === 'admin-logs')!;
        expect(logs.chain.map(r => r.name)).toEqual(['admin', 'admin-logs']);
    });
});
