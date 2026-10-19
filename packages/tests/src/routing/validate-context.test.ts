import { Application, Component, RouteItem, RouterValidateEventArgs } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

describe('validate(e) context: key and routes', () => {
    let app: Application;
    let host: HTMLElement;
    let seen: Array<{ tag: string; e: RouterValidateEventArgs }>;

    const record = (tag: string) => (e: RouterValidateEventArgs) => { seen.push({ tag, e }); return true; };

    const child: RouteItem = { path: '/{id}', control: () => new Component('div'), validate: record('child'), alias: '/profile/{id}' };
    const layout: RouteItem = { path: '/users', control: () => new Component('div'), validate: record('layout'), childs: [child] };
    const home: RouteItem = { path: '/home', name: 'home', control: () => new Component('div'), validate: record('home') };
    const routes: RouteItem[] = [home, layout];

    function start(url: string) {
        window.history.replaceState({}, '', url);
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes, mode: 'history' });
        app.run(host);
    }

    beforeEach(() => { seen = []; });
    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host?.remove();
        window.history.replaceState({}, '', '/');
    });

    const entry = (tag: string) => seen.find(s => s.tag === tag)!.e;

    test('routes holds every route under the same key rule as key, so routes.get(e.key) is the validated route', async () => {
        start('/users/5');
        await tick();
        expect(seen.map(s => s.tag)).toEqual(['layout', 'child']);
        const l = entry('layout');
        const c = entry('child');
        expect(l.key).toBe('/users');
        expect(c.key).toBe('/users/{id}');
        expect(l.routes.get(l.key)).toBe(layout);
        expect(c.routes.get(c.key)).toBe(child);
        expect(l.routes.size).toBe(3);
        expect(l.routes.get('home')).toBe(home);
        expect(l.routes.get('/users/{id}')).toBe(child);
        expect(c.routes).toBe(l.routes);
        expect(l.uri).toBe('/users/5');
        expect(c.params).toEqual({ id: '5' });
    });

    test('a named route is keyed by its name', async () => {
        start('/home');
        await tick();
        const h = entry('home');
        expect(h.key).toBe('home');
        expect(h.routes.get(h.key)).toBe(home);
        expect(h.routes.get('/home')).toBeUndefined();
    });

    test('an alias match still identifies the routes by their own full path', async () => {
        start('/users/profile/7');
        await tick();
        expect(seen.map(s => s.tag)).toEqual(['layout', 'child']);
        const l = entry('layout');
        const c = entry('child');
        expect(l.key).toBe('/users');
        expect(c.key).toBe('/users/{id}');
        expect(l.routes.get(l.key)).toBe(layout);
        expect(c.routes.get(c.key)).toBe(child);
        expect(c.routes.has('/users/profile/{id}')).toBe(false);
        expect(c.uri).toBe('/users/profile/7');
        expect(c.params).toEqual({ id: '7' });
    });
});
