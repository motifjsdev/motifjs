/**
 * @jest-environment jsdom
 */
import { Application, Component, errorHandler } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

describe('devtools events', () => {
    let events: { type: string; payload: any }[];
    let host: HTMLElement;
    let app: Application | undefined;
    let off: (() => void) | undefined;

    const listen = () => {
        off = (globalThis as any).__MOTIF_DEVTOOLS__.on((ev: { type: string; payload: any }) => { events.push(ev); });
    };

    beforeEach(() => {
        events = [];
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        off?.();
        off = undefined;
        try { app?.dispose(); } catch { }
        app = undefined;
        host.remove();
        const closer = Application.CreateBuilder().build();
        closer.useDevelopment(false);
        closer.dispose();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    const types = () => events.map(e => e.type);

    async function mountAndDispose() {
        const c = new Component('section');
        app!.getAppShell().controls.add(c);
        await tick();
        const index = app!.getAppShell().controls.items.indexOf(c);
        await c.dispose();
        return index;
    }

    test('a component publishes disposed with its path, type and tag, and no mounted', async () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        listen();
        app.run(host, new Component('div'));
        await tick();
        events.length = 0;
        const index = await mountAndDispose();
        expect(types()).not.toContain('component:mounted');
        expect(events).toContainEqual({ type: 'component:disposed', payload: expect.objectContaining({ path: [0, index], type: 'Component', tag: 'section' }) });
    });

    test('a navigation publishes start and end', async () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        listen();
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/next', control: () => new Component('p') }] });
        app.run(host);
        await tick();
        events.length = 0;
        await app.router.navigate('/next');
        await tick();
        expect(events).toContainEqual({ type: 'route:navigation-start', payload: { uri: '/next' } });
        expect(types()).toContain('route:navigation-end');
    });

    test('a reported error is published', () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        listen();
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

    test('a dev warning is published', () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        listen();
        const quiet = console.warn;
        console.warn = () => { };
        try {
            app.useRouter({ routes: [{ path: '/a' } as any, { path: '/a', control: () => new Component('div') }] });
        } finally {
            console.warn = quiet;
        }
        expect(types()).toContain('warning');
    });

    test('after useDevelopment(false) nothing is published to an earlier listener', async () => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        listen();
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
