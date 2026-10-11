/**
 * @jest-environment jsdom
 */
import { Application, Component, errorHandler } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

describe('devtools bus', () => {
    let events: { type: string; payload: any }[];
    let host: HTMLElement;
    let app: Application | undefined;

    beforeEach(() => {
        events = [];
        (globalThis as any).__MOTIF_DEVTOOLS_BUS__ = { publish: (type: string, payload: any) => { events.push({ type, payload }); } };
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
        app = undefined;
        host.remove();
        delete (globalThis as any).__MOTIF_DEVTOOLS_BUS__;
        delete (globalThis as any).__MOTIF_DEVTOOLS__;
        const off = Application.CreateBuilder().build();
        off.useDevelopment(false);
        off.dispose();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    const types = () => events.map(e => e.type);

    async function mountAndDispose() {
        const c = new Component('section');
        app!.getAppShell().controls.add(c);
        await tick();
        const id = (c as any).id;
        await c.dispose();
        return id;
    }

    test('with useDevelopment(true) a component publishes mounted and disposed with its id and type', async () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        app.run(host, new Component('div'));
        await tick();
        events.length = 0;
        const id = await mountAndDispose();
        expect(events).toContainEqual({ type: 'component:mounted', payload: { id, type: 'Component' } });
        expect(events).toContainEqual({ type: 'component:disposed', payload: { id, type: 'Component' } });
    });

    test('with the __MOTIF_DEVTOOLS__ global a component publishes mounted and disposed', async () => {
        (globalThis as any).__MOTIF_DEVTOOLS__ = true;
        app = Application.CreateBuilder().build();
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }] });
        app.run(host);
        await tick();
        events.length = 0;
        const id = await mountAndDispose();
        expect(events).toContainEqual({ type: 'component:mounted', payload: { id, type: 'Component' } });
        expect(events).toContainEqual({ type: 'component:disposed', payload: { id, type: 'Component' } });
    });

    test('with useDevelopment(true) a navigation publishes start and end', async () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/next', control: () => new Component('p') }] });
        app.run(host);
        await tick();
        events.length = 0;
        await app.router.navigate('/next');
        await tick();
        expect(events).toContainEqual({ type: 'route:navigation-start', payload: { uri: '/next' } });
        expect(types()).toContain('route:navigation-end');
    });

    test('with useDevelopment(true) a reported error is published', () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        const quiet = console.error;
        const rethrow = errorHandler.getUnexpectedErrorHandler();
        console.error = () => { };
        errorHandler.setUnexpectedErrorHandler(() => { });
        try {
            errorHandler.report(new Error('boom'));
            errorHandler.safeCall(() => { throw new Error('inner'); }, 'devtools-bus.test');
        } finally {
            console.error = quiet;
            errorHandler.setUnexpectedErrorHandler(rethrow);
        }
        expect(types().filter(t => t === 'error:caught').length).toBe(2);
    });

    test('with devtools off nothing is published, even when the bus global exists', async () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(false);
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/next', control: () => new Component('p') }] });
        app.run(host);
        await tick();
        await mountAndDispose();
        await app.router.navigate('/next');
        await tick();
        const quiet = console.error;
        console.error = () => { };
        try {
            errorHandler.report(new Error('boom'));
        } finally {
            console.error = quiet;
        }
        expect(events).toEqual([]);
    });
});
