import { Application, Component } from '@motifx/core';
import { RouteItem } from '@motifx/core';
import { trackRouter } from '../helpers/router-traversal';

const control = () => () => new Component('div');

const pathNow = () => window.location.pathname;
const hashNow = () => window.location.hash;

describe('History traversal cancel restores the address', () => {
    let app: Application;
    let blocked: Set<string>;
    let nav: ReturnType<typeof trackRouter>;

    beforeEach(() => {
        blocked = new Set();
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
    });

    const blockGuard = ({ to }, next) => {
        if (blocked.has(to.path)) return;
        next();
    };

    const routes = (): RouteItem[] => [
        { path: '/', control: control() },
        { path: '/a', control: control() },
        { path: '/b', control: control() },
        { path: '/c', control: control() },
    ];

    const start = (items: RouteItem[], mode: 'history' | 'hash') => {
        app.useRouter({ routes: items, mode });
        nav = trackRouter(app);
        app.run(document.createElement('div'));
    };

    const back = () => nav.traverse(() => window.history.back());
    const forward = () => nav.traverse(() => window.history.forward());
    const go = (delta: number) => nav.traverse(() => window.history.go(delta));

    describe('history mode', () => {
        beforeEach(() => {
            app.useGuard(blockGuard);
        });

        it('allowed back navigation still works', async () => {
            start(routes(), 'history');
            await app.navigate('/a');
            await app.navigate('/b');

            await back();

            expect(pathNow()).toBe('/a');
            expect(app.router.uri).toBe('/a');
        });

        it('guard-cancelled back keeps the address on the shown page', async () => {
            start(routes(), 'history');
            await app.navigate('/a');
            await app.navigate('/b');

            blocked.add('/a');
            await back();

            expect(app.router.uri).toBe('/b');
            expect(pathNow()).toBe('/b');
        });

        it('history stays intact after a cancelled back', async () => {
            start(routes(), 'history');
            await app.navigate('/a');
            await app.navigate('/b');

            blocked.add('/a');
            await back();
            expect(pathNow()).toBe('/b');

            blocked.clear();
            await back();
            expect(pathNow()).toBe('/a');
            expect(app.router.uri).toBe('/a');

            await forward();
            expect(pathNow()).toBe('/b');
            expect(app.router.uri).toBe('/b');
        });

        it('guard-cancelled forward keeps the address on the shown page', async () => {
            start(routes(), 'history');
            await app.navigate('/a');
            await app.navigate('/b');
            await back();
            expect(pathNow()).toBe('/a');

            blocked.add('/b');
            await forward();

            expect(app.router.uri).toBe('/a');
            expect(pathNow()).toBe('/a');
        });

        it('cancelled multi-step jump returns to the shown entry', async () => {
            start(routes(), 'history');
            await app.navigate('/a');
            await app.navigate('/b');
            await app.navigate('/c');

            blocked.add('/a');
            await go(-2);

            expect(app.router.uri).toBe('/c');
            expect(pathNow()).toBe('/c');

            blocked.clear();
            await back();
            expect(pathNow()).toBe('/b');
            expect(app.router.uri).toBe('/b');
        });

        it('onLeave cancel on back keeps the address', async () => {
            const r = routes();
            r[3] = { path: '/c', control: control(), onLeave: () => false };
            start(r, 'history');
            await app.navigate('/b');
            await app.navigate('/c');

            await back();

            expect(app.router.uri).toBe('/c');
            expect(pathNow()).toBe('/c');
        });

        it('middleware cancel on back keeps the address', async () => {
            let stop = false;
            app.use(async (_ctx, next) => { if (!stop) await next(); });
            start(routes(), 'history');
            await app.navigate('/a');
            await app.navigate('/b');

            stop = true;
            await back();

            expect(app.router.uri).toBe('/b');
            expect(pathNow()).toBe('/b');
        });

        it('user state passed to navigate is preserved in history.state', async () => {
            start(routes(), 'history');
            await app.navigate('/a', { state: { foo: 1 } } as any);

            expect(window.history.state?.foo).toBe(1);
        });

        it('non-plain user state is stored untouched', async () => {
            start(routes(), 'history');
            const when = new Date(0);
            await app.navigate('/a', { state: when } as any);

            expect(window.history.state instanceof Date).toBe(true);
            expect((window.history.state as Date).getTime()).toBe(0);
        });

        it('back into an entry with foreign state still navigates', async () => {
            start(routes(), 'history');
            await app.navigate('/a', { state: new Date(0) } as any);
            await app.navigate('/b');

            await back();

            expect(pathNow()).toBe('/a');
            expect(app.router.uri).toBe('/a');
        });

        it('replace navigation does not add an entry', async () => {
            start(routes(), 'history');
            await app.navigate('/a');
            await app.navigate('/b', { replace: true } as any);
            await app.navigate('/c');

            await back();
            expect(pathNow()).toBe('/b');
            expect(app.router.uri).toBe('/b');

            blocked.add('/');
            await back();
            expect(pathNow()).toBe('/b');
            expect(app.router.uri).toBe('/b');

            blocked.clear();
            await back();
            expect(pathNow()).toBe('/');
            expect(app.router.uri).toBe('/');
        });
    });

    describe('hash mode', () => {
        beforeEach(() => {
            app.useGuard(blockGuard);
        });

        it('allowed back navigation still works', async () => {
            start(routes(), 'hash');
            await app.navigate('/a');
            await app.navigate('/b');

            await back();

            expect(hashNow()).toBe('#/a');
            expect(app.router.uri).toBe('/a');
        });

        it('guard-cancelled back keeps the address on the shown page', async () => {
            start(routes(), 'hash');
            await app.navigate('/a');
            await app.navigate('/b');

            blocked.add('/a');
            await back();

            expect(app.router.uri).toBe('/b');
            expect(hashNow()).toBe('#/b');

            blocked.clear();
            await back();
            expect(hashNow()).toBe('#/a');
            expect(app.router.uri).toBe('/a');
        });
    });
});
