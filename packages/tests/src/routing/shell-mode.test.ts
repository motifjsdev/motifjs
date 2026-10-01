import { Application, Component, RouteItem } from '@motifx/core';
import { trackRouter } from '../helpers/router-traversal';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

const routes = (): RouteItem[] => [
    { path: '/', control: () => new Component('div') },
    { path: '/b', control: () => new Component('div') },
];

describe("router 'shell' mode", () => {
    let app: Application;
    let host: HTMLElement;

    function start(pageUrl: string) {
        window.history.replaceState({}, '', pageUrl);
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes: routes(), mode: 'shell' });
        app.run(host);
    }

    afterEach(async () => {
        try { app?.dispose(); } catch { }
        host?.remove();
        await tick();
        window.history.replaceState({}, '', '/');
    });

    test('starts at / when the page is served from a sub path', async () => {
        start('/app/index.html');
        await tick();
        expect(app.router.ok).toBe(true);
        expect(app.router.uri).toBe('/');
    });

    test('starts at / regardless of the page query', async () => {
        start('/?x=1');
        await tick();
        expect(app.router.uri).toBe('/');
        expect(app.router.params).toEqual({});
    });

    test('the page query never reaches params', async () => {
        start('/app/index.html?x=1');
        await tick();
        await app.router.navigate('/b');
        await tick();
        expect(app.router.params).toEqual({});
    });

    test("a route's own query is read", async () => {
        start('/app/index.html?x=1');
        await tick();
        await app.router.navigate('/b?y=2');
        await tick();
        expect(app.router.params).toEqual({ y: '2' });
    });

    test('the address bar and history are never touched', async () => {
        start('/app/index.html?x=1');
        await tick();
        const before = window.history.length;
        await app.router.navigate('/b');
        await tick();
        expect(window.location.pathname + window.location.search).toBe('/app/index.html?x=1');
        expect(window.history.length).toBe(before);
    });

    test('a popstate event does not move the router', async () => {
        start('/app/index.html');
        await app.router.navigate('/b');
        const nav = trackRouter(app);
        window.dispatchEvent(new PopStateEvent('popstate'));
        await nav.idle();
        expect(app.router.ok).toBe(true);
        expect(app.router.uri).toBe('/b');
    });

    test('restartRouter stays on the shown page, not the page address', async () => {
        start('/app/index.html');
        await app.router.navigate('/b');
        const restarted = new Promise<void>(resolve => {
            const handler = () => { app.off('motifjs-router-navigated', handler); resolve(); };
            app.onRouterChanged(handler);
        });
        app.restartRouter();
        await restarted;
        expect(app.router.ok).toBe(true);
        expect(app.router.uri).toBe('/b');
        expect(window.location.pathname).toBe('/app/index.html');
    });
});
