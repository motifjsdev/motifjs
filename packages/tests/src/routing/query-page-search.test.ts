import { Scanner } from '@motifx/core/internal';
import { Application, Component, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

const routes = (): RouteItem[] => [
    { path: '/a', control: () => new Component('div') },
    { path: '/b', control: () => new Component('div') },
];

describe('query parameters come only from the matched address', () => {
    let app: Application;
    let host: HTMLElement;

    function start(url: string, mode?: 'history' | 'hash') {
        window.history.replaceState({}, '', url);
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes: routes(), mode });
        app.run(host);
    }

    afterEach(() => {
        try { app?.dispose(); } catch { }
        host?.remove();
        window.history.replaceState({}, '', '/');
    });

    test("history: the previous page's query does not leak into the next route", async () => {
        start('/a?x=1');
        await tick();
        expect(app.router.params).toEqual({ x: '1' });
        await app.router.navigate('/b');
        await tick();
        expect(window.location.pathname).toBe('/b');
        expect(app.router.params).toEqual({});
    });

    test('history: a query on the target address is read', async () => {
        start('/a?x=1');
        await tick();
        await app.router.navigate('/b?y=2');
        await tick();
        expect(app.router.params).toEqual({ y: '2' });
    });

    test('hash: the page query before # stays available to every route', async () => {
        start('/?x=1#/a', 'hash');
        await tick();
        expect(app.router.params).toEqual({ x: '1' });
        await app.router.navigate('/b');
        await tick();
        expect(app.router.params).toEqual({ x: '1' });
    });

    test("hash: a route's own query replaces the page query", async () => {
        start('/?x=1#/a', 'hash');
        await tick();
        await app.router.navigate('/b?z=3');
        await tick();
        expect(app.router.params).toEqual({ z: '3' });
    });
});

describe('Scanner.exist page search argument', () => {
    afterEach(() => { window.history.replaceState({}, '', '/'); });

    test('without the argument the browser query is not read', () => {
        window.history.replaceState({}, '', '/?x=1');
        const s = new (Scanner as any)('/b');
        expect(s.exist('/b')).toBe(true);
        expect(s.parameters).toEqual({});
    });

    test('with the argument the given query is used when the address has none', () => {
        const s = new (Scanner as any)('/b');
        expect(s.exist('/b', '?x=1')).toBe(true);
        expect(s.parameters).toEqual({ x: '1' });
    });

    test("the address's own query wins over the argument", () => {
        const s = new (Scanner as any)('/b');
        expect(s.exist('/b?y=2', '?x=1')).toBe(true);
        expect(s.parameters).toEqual({ y: '2' });
    });
});
