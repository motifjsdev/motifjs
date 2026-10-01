import { Application, Component, RouteItem, RouterNavigatedEventArgs } from '@motifx/core';
import { trackRouter } from '../helpers/router-traversal';

describe('restartRouter', () => {
    let app: Application;
    let host: HTMLElement;
    let built: string[];

    const page = (name: string) => () => {
        built.push(name);
        const c = new Component('div');
        (c.element as HTMLElement).id = `p-${name}`;
        return c;
    };
    const shown = () => host.querySelector('[id^=p-]')?.id;

    const navigated = () => new Promise<RouterNavigatedEventArgs | undefined>(resolve => {
        const handler = (e?: RouterNavigatedEventArgs) => {
            app.off('motifjs-router-navigated', handler);
            resolve(e);
        };
        app.onRouterChanged(handler);
    });

    const restart = async () => {
        const done = navigated();
        app.restartRouter();
        return done;
    };

    const start = async (routes: RouteItem[], mode: 'history' | 'hash' | 'shell') => {
        const done = navigated();
        app.useRouter({ routes, mode });
        app.run(host);
        await done;
    };

    beforeEach(() => {
        built = [];
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
        host.remove();
    });

    test('rebuilds the page at the same address with the same configuration', async () => {
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'history');
        await app.navigate('/a');
        built = [];

        const e = await restart();

        expect(built).toEqual(['a']);
        expect(shown()).toBe('p-a');
        expect(app.router.uri).toBe('/a');
        expect(window.location.pathname).toBe('/a');
        expect(e?.initial).toBe(true);
    });

    test('empties the keepAlive cache', async () => {
        await start([{ path: '/', control: page('home') }, { path: '/k', control: page('k'), keepAlive: true }], 'history');
        await app.navigate('/k');
        await app.navigate('/');
        built = [];
        await app.navigate('/k');
        expect(built).toEqual([]);

        await app.navigate('/');
        await restart();
        built = [];
        await app.navigate('/k');

        expect(built).toEqual(['k']);
    });

    test('a new useRouter configuration takes over at the current address', async () => {
        await start([{ path: '/', control: page('old-home') }, { path: '/a', control: page('old-a') }], 'history');
        await app.navigate('/a');

        app.useRouter({ routes: [{ path: '/', control: page('new-home') }, { path: '/a', control: page('new-a') }, { path: '/b', control: page('new-b') }], mode: 'history' });
        await restart();

        expect(shown()).toBe('p-new-a');
        const result: any = await app.navigate('/b');
        expect(result.ok).toBe(true);
        expect(shown()).toBe('p-new-b');

        const nav = trackRouter(app);
        let guardRuns = 0;
        app.useGuard((_c, next) => { guardRuns++; next(); });
        await nav.traverse(() => window.history.back());
        expect(app.router.uri).toBe('/a');
        expect(shown()).toBe('p-new-a');
        expect(guardRuns).toBe(1);
    });

    test('hash mode restarts at the address', async () => {
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'hash');
        await app.navigate('/a');
        built = [];

        await restart();

        expect(built).toEqual(['a']);
        expect(app.router.uri).toBe('/a');
        expect(window.location.hash).toBe('#/a');
    });

    test('shell mode restarts at the shown page with a new configuration', async () => {
        window.history.replaceState({}, '', '/app/index.html');
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'shell');
        await app.navigate('/a');

        app.useRouter({ routes: [{ path: '/', control: page('home2') }, { path: '/a', control: page('a2') }], mode: 'shell' });
        await restart();

        expect(app.router.uri).toBe('/a');
        expect(shown()).toBe('p-a2');
        expect(window.location.pathname).toBe('/app/index.html');
    });

    test('before run it does nothing and run still starts the router', async () => {
        app.useRouter({ routes: [{ path: '/', control: page('home') }], mode: 'history' });
        expect(() => app.restartRouter()).not.toThrow();
        const done = navigated();
        app.run(host);
        await done;
        expect(shown()).toBe('p-home');
    });
});
