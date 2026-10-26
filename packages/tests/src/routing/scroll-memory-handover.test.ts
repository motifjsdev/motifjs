import { Application, Component, RouteItem } from '@motifx/core';

const page = () => () => new Component('div');

function installViewport(height = 5000) {
    const state = { top: 0, height };
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => state.top });
    (window as any).scrollTo = (x: any, y?: number) => {
        const target = typeof x === 'object' && x !== null ? Number(x.top ?? 0) : Number(y ?? 0);
        state.top = Math.max(0, Math.min(target, state.height));
    };
    const frames: Array<() => void> = [];
    (window as any).requestAnimationFrame = (run: () => void) => { frames.push(run); return frames.length; };
    (window as any).cancelAnimationFrame = (id: number) => { frames[id - 1] = () => { }; };
    return {
        state,
        tick(times = 3) { for (let i = 0; i < times; i++) for (const run of frames.splice(0)) run(); },
    };
}

const routes = (): RouteItem[] => [
    { path: '/', control: page() },
    { path: '/uzun', control: page() },
    { path: '/kisa', control: page() },
    { path: '/orta', control: page() },
];

describe('scroll memory lives in memory: restart handover and the save/restore API', () => {
    let app: Application;
    let view: ReturnType<typeof installViewport>;
    let errors: string[];
    let originalError: typeof console.error;

    const start = (scrollMemory: any = true) => {
        app.useRouter({ routes: routes(), mode: 'history', scrollMemory });
        app.run(document.createElement('div'));
    };

    beforeEach(() => {
        sessionStorage.clear();
        history.replaceState({}, '', '/');
        view = installViewport();
        app = Application.CreateBuilder().build();
        errors = [];
        originalError = console.error;
        console.error = (...args: any[]) => { errors.push(String(args[0])); };
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        console.error = originalError;
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    test('a restart keeps the positions of the pages visited before it', async () => {
        start();
        await app.router.navigate('/uzun');
        view.state.top = 1200;
        await app.router.navigate('/kisa');
        view.tick();

        await app.restartRouter();
        view.tick();
        await app.router.navigate('/uzun');
        view.tick();

        expect(view.state.top).toBe(1200);
        expect(sessionStorage.length).toBe(0);
    });

    test('a restart at the shown address keeps that page where it was', async () => {
        start();
        await app.router.navigate('/uzun');
        view.state.top = 900;

        await app.restartRouter('/uzun');
        view.tick();

        expect(view.state.top).toBe(900);
    });

    test('scrollPositions() includes the live position of the shown page', async () => {
        start();
        await app.router.navigate('/uzun');
        view.state.top = 700;

        expect(app.router.scrollPositions()).toEqual({ '/uzun': 700 });
    });

    test('restoreScrollPositions before run() is honoured on the first visit and ignores bad values', async () => {
        app.useRouter({ routes: routes(), mode: 'history', scrollMemory: true });
        app.router.restoreScrollPositions({ '/uzun': 900, '/kisa': Number.NaN, '/orta': -5 });
        app.run(document.createElement('div'));

        expect(app.router.scrollPositions()).toEqual({ '/uzun': 900 });
        await app.router.navigate('/uzun');
        view.tick();
        expect(view.state.top).toBe(900);
    });

    test('restoreScrollPositions respects the limit', async () => {
        start({ limit: 2 });
        app.router.restoreScrollPositions({ '/uzun': 100, '/kisa': 200, '/orta': 300 });

        expect(app.router.scrollPositions()).toEqual({ '/kisa': 200, '/orta': 300 });
    });

    test('saveScrollPositions is called when a page is left, with that page included', async () => {
        start();
        const calls: Array<Record<string, number>> = [];
        app.router.saveScrollPositions((positions) => calls.push(positions));

        await app.router.navigate('/uzun');
        view.state.top = 1200;
        await app.router.navigate('/kisa');

        expect(calls[calls.length - 1]).toEqual({ '/uzun': 1200 });
    });

    test('saveScrollPositions is called when the page is hidden and on pagehide', async () => {
        start();
        const calls: Array<Record<string, number>> = [];
        app.router.saveScrollPositions((positions) => calls.push(positions));
        await app.router.navigate('/uzun');
        view.state.top = 450;

        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(calls[calls.length - 1]).toEqual({ '/uzun': 450 });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });

        view.state.top = 460;
        window.dispatchEvent(new Event('pagehide'));
        expect(calls[calls.length - 1]).toEqual({ '/uzun': 460 });
    });

    test('the function returned by saveScrollPositions removes the subscription', async () => {
        start();
        const calls: Array<Record<string, number>> = [];
        const off = app.router.saveScrollPositions((positions) => calls.push(positions));
        await app.router.navigate('/uzun');
        const before = calls.length;
        off();

        view.state.top = 300;
        await app.router.navigate('/kisa');

        expect(calls.length).toBe(before);
    });

    test('the subscription survives a restart', async () => {
        start();
        const calls: Array<Record<string, number>> = [];
        app.router.saveScrollPositions((positions) => calls.push(positions));

        await app.restartRouter();
        await app.router.navigate('/uzun');
        view.state.top = 500;
        await app.router.navigate('/kisa');

        expect(calls[calls.length - 1]).toEqual({ '/uzun': 500 });
    });

    test('app.dispose() saves the positions one last time', async () => {
        start();
        const calls: Array<Record<string, number>> = [];
        app.router.saveScrollPositions((positions) => calls.push(positions));
        await app.router.navigate('/uzun');
        view.state.top = 640;

        await app.dispose();

        expect(calls[calls.length - 1]).toEqual({ '/uzun': 640 });
    });

    test('with scrollMemory off the API is empty and the callback is never called', async () => {
        start(false);
        const calls: Array<Record<string, number>> = [];
        app.router.saveScrollPositions((positions) => calls.push(positions));
        app.router.restoreScrollPositions({ '/uzun': 900 });

        await app.router.navigate('/uzun');
        view.state.top = 300;
        await app.router.navigate('/kisa');

        expect(app.router.scrollPositions()).toEqual({});
        expect(calls).toEqual([]);
        expect(view.state.top).toBe(300);
    });

    test('a save callback that throws is reported and the navigation goes on', async () => {
        start();
        app.router.saveScrollPositions(() => { throw new Error('disk full'); });
        await app.router.navigate('/uzun');

        const result: any = await app.router.navigate('/kisa');

        expect(result.ok).toBe(true);
        expect(app.router.uri).toBe('/kisa');
        expect(errors.some(e => e.includes('MJX306'))).toBe(true);
    });
});
