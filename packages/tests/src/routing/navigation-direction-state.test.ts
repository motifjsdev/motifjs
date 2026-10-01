import { Application, Component } from '@motifx/core';
import { RouteItem } from '@motifx/core';
import { trackModule, trackRouter } from '../helpers/router-traversal';

const control = () => () => new Component('div');

describe('Navigation direction and entry state', () => {
    let app: Application;
    let nav: ReturnType<typeof trackRouter>;

    const routes = (): RouteItem[] => [
        { path: '/', control: control() },
        { path: '/a', control: control() },
        { path: '/b', control: control() },
        { path: '/c', control: control() },
    ];

    const start = (mode: 'history' | 'hash') => {
        app.useRouter({ routes: routes(), mode });
        nav = trackRouter(app);
        app.run(document.createElement('div'));
    };

    const traverse = (fn: () => void) => nav.traverse(fn);

    beforeEach(() => {
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
    });

    describe('direction', () => {
        it('reports initial, push, replace, back and forward', async () => {
            const seen: string[] = [];
            const events: string[] = [];
            app.useGuard(({ to }, next) => { seen.push(`${to.path}:${to.direction}`); next(); });
            app.onRouterChanged(e => { events.push(`${e!.uri}:${e!.direction}`); });
            start('history');
            await nav.idle();
            expect(app.router.direction).toBe('initial');

            await app.navigate('/a');
            expect(app.router.direction).toBe('push');
            await app.navigate('/b', { replace: true });
            expect(app.router.direction).toBe('replace');
            await app.navigate('/c');

            await traverse(() => window.history.back());
            expect(app.router.uri).toBe('/b');
            expect(app.router.direction).toBe('back');

            await traverse(() => window.history.forward());
            expect(app.router.uri).toBe('/c');
            expect(app.router.direction).toBe('forward');

            expect(seen).toEqual(['/:initial', '/a:push', '/b:replace', '/c:push', '/b:back', '/c:forward']);
            expect(events).toEqual(['/:initial', '/a:push', '/b:replace', '/c:push', '/b:back', '/c:forward']);
        });

        it('multi-step traversal reports back', async () => {
            start('history');
            await app.navigate('/a');
            await app.navigate('/b');
            await app.navigate('/c');

            await traverse(() => window.history.go(-2));
            expect(app.router.uri).toBe('/a');
            expect(app.router.direction).toBe('back');
        });

        it('guard redirect reports replace or push, not the traversal', async () => {
            let redirect = false;
            app.useGuard(({ to }, next) => { if (redirect && to.path === '/a') next('/c'); else next(); });
            start('history');
            await app.navigate('/a');
            await app.navigate('/b');

            redirect = true;
            await traverse(() => window.history.back());
            expect(app.router.uri).toBe('/c');
            expect(['replace', 'push']).toContain(app.router.direction);
        });

        it('hash mode reports back and forward', async () => {
            start('hash');
            await app.navigate('/a');
            await app.navigate('/b');

            await traverse(() => window.history.back());
            expect(app.router.uri).toBe('/a');
            expect(app.router.direction).toBe('back');

            await traverse(() => window.history.forward());
            expect(app.router.uri).toBe('/b');
            expect(app.router.direction).toBe('forward');
        });
    });

    describe('entry state', () => {
        it('state comes back on back/forward and is absent where none was given', async () => {
            const guardStates: any[] = [];
            app.useGuard(({ to }, next) => { guardStates.push(to.state); next(); });
            start('history');

            await app.navigate('/a', { state: { from: 'list', page: 3 } });
            expect(app.router.state).toEqual({ from: 'list', page: 3 });
            expect(window.history.state.from).toBe('list');

            await app.navigate('/b');
            expect(app.router.state).toBeUndefined();

            await traverse(() => window.history.back());
            expect(app.router.uri).toBe('/a');
            expect(app.router.state).toEqual({ from: 'list', page: 3 });

            await traverse(() => window.history.forward());
            expect(app.router.uri).toBe('/b');
            expect(app.router.state).toBeUndefined();

            expect(guardStates).toEqual([undefined, { from: 'list', page: 3 }, undefined, { from: 'list', page: 3 }, undefined]);
        });

        it('state reaches onRouterChanged', async () => {
            const states: any[] = [];
            app.onRouterChanged(e => { states.push(e!.state); });
            start('history');
            await app.navigate('/a', { state: { id: 7 } });
            await app.navigate('/b');
            await traverse(() => window.history.back());

            expect(states.slice(1)).toEqual([{ id: 7 }, undefined, { id: 7 }]);
        });

        it('empty object state is kept as given', async () => {
            start('history');
            await app.navigate('/a', { state: {} });
            await app.navigate('/b');
            await traverse(() => window.history.back());

            expect(app.router.state).toEqual({});
        });

        it('non-plain state is returned as stored', async () => {
            start('history');
            await app.navigate('/a', { state: new Date(5) } as any);
            await app.navigate('/b');
            await traverse(() => window.history.back());

            expect(app.router.state instanceof Date).toBe(true);
            expect((app.router.state as Date).getTime()).toBe(5);
        });

        it('hash mode keeps state on push', async () => {
            start('hash');
            await app.navigate('/a', { state: { tab: 2 } });
            expect(window.history.state.tab).toBe(2);
            await app.navigate('/b');

            await traverse(() => window.history.back());
            expect(app.router.uri).toBe('/a');
            expect(app.router.state).toEqual({ tab: 2 });
        });

        it('state survives a restart on the same entry', async () => {
            start('history');
            await app.navigate('/a', { state: { keep: true } });

            const router: any = (app as any).urlRoutingModule;
            router.dispose();
            const again: any = new (router.constructor)({ RouteItems: routes(), mode: 'history', middlewareCollections: () => [] }, app);
            (app as any).urlRoutingModule = again;
            const restarted = trackModule(again);
            again.start((app as any).getAppShell());
            await restarted.idle();

            expect(app.router.uri).toBe('/a');
            expect(app.router.state).toEqual({ keep: true });
            expect(app.router.direction).toBe('initial');
            again.dispose();
        });
    });
});
