/**
 * @jest-environment jsdom
 */
import { Application, Component, RouteItem } from '@motifx/core';
import { trackRouter } from '../helpers/router-traversal';

describe('hash mode: the router does not navigate again to the address it wrote', () => {
    let app: Application;
    let nav: ReturnType<typeof trackRouter>;
    let calls: string[];
    let built: string[];

    const page = (name: string) => () => {
        built.push(name);
        return new Component('div');
    };

    const routes = (): RouteItem[] => [
        { path: '/', control: page('/') },
        { path: '/a', control: page('/a') },
        { path: '/b', control: page('/b') },
        { path: '/c', control: page('/c') },
        { path: '/old', redirect: '/b' },
        { path: '/çay', control: page('/çay') },
    ];

    const start = (mode: 'hash' | 'file' = 'hash') => {
        app.useRouter({ routes: routes(), mode });
        const module = (app as any).urlRoutingModule;
        const navigate = module.navigate;
        module.navigate = function (this: any, uri: string, ...rest: any[]) {
            calls.push(uri);
            return navigate.call(this, uri, ...rest);
        };
        nav = trackRouter(app);
        app.run(document.createElement('div'));
    };

    beforeEach(async () => {
        window.history.replaceState({}, '', '/');
        window.location.hash = '';
        await new Promise(r => setTimeout(r, 0));
        calls = [];
        built = [];
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
    });

    it('navigates once per link, including the first navigation', async () => {
        start();
        await nav.idle();
        await app.navigate('/a');
        await nav.idle();
        expect(window.location.hash).toBe('#/a');
        expect(calls).toEqual(['/', '/a']);
        expect(built).toEqual(['/', '/a']);
    });

    it('recognises both writes of two quick navigations', async () => {
        start();
        await nav.idle();
        const first = app.navigate('/a');
        const second = app.navigate('/b');
        await Promise.all([first, second]);
        await nav.idle();
        expect(app.router.uri).toBe('/b');
        expect(calls).toEqual(['/', '/a', '/b']);
    });

    it('navigates once when a redirect writes the target address', async () => {
        start();
        await nav.idle();
        await app.navigate('/old');
        await nav.idle();
        expect(window.location.hash).toBe('#/b');
        expect(calls).toEqual(['/', '/old']);
    });

    it('recognises an address the browser stores percent-encoded', async () => {
        start();
        await nav.idle();
        await app.navigate('/çay');
        await nav.idle();
        expect(window.location.hash).toBe('#/%C3%A7ay');
        expect(calls).toEqual(['/', '/çay']);
        expect(built).toEqual(['/', '/çay']);
    });

    it('still follows back and forward', async () => {
        start();
        await app.navigate('/a');
        await app.navigate('/b');
        await nav.traverse(() => window.history.back());
        expect(app.router.uri).toBe('/a');
        await nav.traverse(() => window.history.forward());
        expect(app.router.uri).toBe('/b');
        expect(calls).toEqual(['/', '/a', '/b', '/a', '/b']);
    });

    it('still follows a hash the page changes itself', async () => {
        start();
        await app.navigate('/a');
        await nav.traverse(() => { window.location.hash = '#/c'; });
        expect(app.router.uri).toBe('/c');
        expect(calls).toEqual(['/', '/a', '/c']);
    });

    it('navigates once per link in file mode', async () => {
        start('file');
        await nav.idle();
        await app.navigate('/a');
        await nav.idle();
        expect(calls).toEqual(['/', '/a']);
    });
});

describe('hash mode: devtools records one navigation per link', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;

    beforeEach(async () => {
        window.history.replaceState({}, '', '/');
        window.location.hash = '';
        await new Promise(r => setTimeout(r, 0));
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    it('does not record a skipped navigation after each link', async () => {
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/a', control: () => new Component('div') }], mode: 'hash' });
        const nav = trackRouter(app);
        app.run(document.createElement('div'));
        await nav.idle();
        const before = hook().getNavigations().length;
        await app.navigate('/a');
        await nav.idle();
        const recorded = hook().getNavigations().slice(before).map((n: any) => `${n.requested} ${n.outcome}`);
        expect(recorded).toEqual(['/a done']);
    });
});
