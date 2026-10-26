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
        window.history.replaceState({}, '', '/');
        try { app?.dispose(); } catch { }
        host.remove();
    });

    test('restarts at the root with the same configuration and replaces the address', async () => {
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'history');
        await app.navigate('/a');
        built = [];
        const entries = window.history.length;

        const e = await restart();

        expect(built).toEqual(['home']);
        expect(shown()).toBe('p-home');
        expect(app.router.uri).toBe('/');
        expect(window.location.pathname).toBe('/');
        expect(window.history.length).toBe(entries);
        expect(e?.initial).toBe(true);
    });

    test('restarts at the given address', async () => {
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'history');
        built = [];
        const entries = window.history.length;

        const done = navigated();
        const result: any = await app.restartRouter('/a');
        const e = await done;

        expect(result.ok).toBe(true);
        expect(built).toEqual(['a']);
        expect(shown()).toBe('p-a');
        expect(app.router.uri).toBe('/a');
        expect(window.location.pathname).toBe('/a');
        expect(window.history.length).toBe(entries);
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

    test('a new useRouter configuration takes over at the root', async () => {
        await start([{ path: '/', control: page('old-home') }, { path: '/a', control: page('old-a') }], 'history');
        await app.navigate('/a');

        app.useRouter({ routes: [{ path: '/', control: page('new-home') }, { path: '/a', control: page('new-a') }, { path: '/b', control: page('new-b') }], mode: 'history' });
        await restart();

        expect(shown()).toBe('p-new-home');
        expect(app.router.uri).toBe('/');
        const result: any = await app.navigate('/b');
        expect(result.ok).toBe(true);
        expect(shown()).toBe('p-new-b');
    });

    test('a new useRouter configuration takes over at the given address and the history stays navigable', async () => {
        await start([{ path: '/', control: page('old-home') }, { path: '/a', control: page('old-a') }], 'history');
        await app.navigate('/a');

        app.useRouter({ routes: [{ path: '/', control: page('new-home') }, { path: '/a', control: page('new-a') }, { path: '/b', control: page('new-b') }], mode: 'history' });
        const done = navigated();
        app.restartRouter('/a');
        await done;

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

    test('a new useRouter configuration waits for restartRouter: the running router keeps the page and navigates with the old table', async () => {
        await start([{ path: '/', control: page('old-home') }, { path: '/a', control: page('old-a') }, { path: '/b', control: page('old-b') }], 'history');
        await app.navigate('/a');

        app.useRouter({ routes: [{ path: '/', control: page('new-home') }, { path: '/a', control: page('new-a') }, { path: '/b', control: page('new-b') }], mode: 'history' });
        await new Promise(r => setTimeout(r, 0));

        expect(shown()).toBe('p-old-a');
        expect(app.router.uri).toBe('/a');
        const result: any = await app.navigate('/b');
        expect(result.ok).toBe(true);
        expect(shown()).toBe('p-old-b');
        expect(app.router.uri).toBe('/b');

        await restart();
        expect(shown()).toBe('p-new-home');
        expect(app.router.uri).toBe('/');
        const after: any = await app.navigate('/a');
        expect(after.ok).toBe(true);
        expect(shown()).toBe('p-new-a');
    });

    test('hash mode restarts at the root and replaces the hash', async () => {
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'hash');
        await app.navigate('/a');
        built = [];
        const entries = window.history.length;

        await restart();

        expect(built).toEqual(['home']);
        expect(app.router.uri).toBe('/');
        expect(window.location.hash).toBe('#/');
        expect(window.history.length).toBe(entries);
    });

    test('hash mode restarts at the given address', async () => {
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'hash');
        built = [];

        const done = navigated();
        app.restartRouter('/a');
        await done;

        expect(built).toEqual(['a']);
        expect(app.router.uri).toBe('/a');
        expect(window.location.hash).toBe('#/a');
    });

    test('shell mode restarts at the root with a new configuration and leaves the document address alone', async () => {
        window.history.replaceState({}, '', '/app/index.html');
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'shell');
        await app.navigate('/a');

        app.useRouter({ routes: [{ path: '/', control: page('home2') }, { path: '/a', control: page('a2') }], mode: 'shell' });
        await restart();

        expect(app.router.uri).toBe('/');
        expect(shown()).toBe('p-home2');
        expect(window.location.pathname).toBe('/app/index.html');
    });

    test('shell mode restarts at the given address', async () => {
        window.history.replaceState({}, '', '/app/index.html');
        await start([{ path: '/', control: page('home') }, { path: '/a', control: page('a') }], 'shell');

        const done = navigated();
        app.restartRouter('/a');
        await done;

        expect(app.router.uri).toBe('/a');
        expect(shown()).toBe('p-a');
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
