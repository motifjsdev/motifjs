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
        expect(hit.result.ok).toBe(true);
        expect(hit.result.route?.name).toBe('user');
        expect(hit.result.params.id).toBe('5');
        expect(hit.chain).toEqual(['/users/5']);
        expect(app.router.uri).toBe('/');
        expect(window.location.pathname).toBe('/');

        const nested = app.router.resolve('/admin/logs/2026-09-27');
        expect(nested.result.ok).toBe(true);
        expect(nested.result.route?.name).toBe('admin-logs');
        expect(nested.result.params.day).toBe('2026-09-27');
        expect(nested.result.chain.map(r => r.name)).toEqual(['admin', 'admin-logs']);
        expect(nested.chain).toEqual(['/admin', '/logs/2026-09-27']);

        const missing = app.router.resolve('/missing');
        expect(missing.result.ok).toBe(false);
        expect(missing.chain).toEqual([]);
    });

    test('resolve returns the same chain and result shape as a navigation', async () => {
        const preview = app.router.resolve('/admin/logs/2026-09-27');
        const shown = await app.router.navigate('/admin/logs/2026-09-27');

        expect(preview.chain).toEqual(app.router.chain);
        expect(preview.result.uri).toBe(shown.uri);
        expect(preview.result.route).toBe(shown.route);
        expect(preview.result.chain).toEqual(shown.chain);
        expect(preview.result.params).toEqual(shown.params);
        expect(Object.keys(preview.result).sort()).toEqual(Object.keys(shown).sort());
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

    test('router.navigate and navigateByName return the same result as app.navigate', async () => {
        const shown = await app.router.navigate('/admin/logs/2026-09-27');
        expect(shown.ok).toBe(true);
        expect(shown.route?.name).toBe('admin-logs');
        expect(shown.chain.map((r: RouteItem) => r.name)).toEqual(['admin', 'admin-logs']);
        expect(app.router.chain).toEqual(['/admin', '/logs/2026-09-27']);

        const same = await app.router.navigate('/admin/logs/2026-09-27');
        expect(same).toEqual({ ok: true, skipped: true, uri: '/admin/logs/2026-09-27' });

        const named = await app.router.navigateByName('user', { id: 3 });
        expect(named.ok).toBe(true);
        expect(named.params.id).toBe('3');
        expect(named.chain.map((r: RouteItem) => r.name)).toEqual(['user']);

        const missing = await app.router.navigate('/missing');
        expect(missing.ok).toBe(false);

        const viaApp = await app.navigate('/users/4');
        const viaRouter = await app.router.navigate('/users/5');
        expect(Object.keys(viaRouter).sort()).toEqual(Object.keys(viaApp).sort());
    });

    test('a guard cancel is reported by router.navigate', async () => {
        app.useGuard(({ to }, next) => { if (to.path === '/users/1') next(false); else next(); });
        const cancelled = await app.router.navigate('/users/1');
        expect(cancelled).toEqual({ ok: false, cancelled: true, reason: 'guard' });
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
