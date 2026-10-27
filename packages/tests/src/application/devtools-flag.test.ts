import { Application, Component, motifCompiled } from '@motifx/core';

describe('devtools switch', () => {
    const routes = [{ path: '/', control: () => new Component('div') }];
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    const fixedOverlays = () => Array.from(document.body.children).filter(el => (el as HTMLElement).style?.position === 'fixed');
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        warn.mockRestore();
        delete (globalThis as any).__MOTIF_DEVTOOLS__;
        window.history.replaceState(null, '', '/');
        const app = Application.CreateBuilder().build();
        app.useDevelopment(false);
        app.dispose();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    test('useDevelopment(true) puts the devtools object on __MOTIF_DEVTOOLS__ and shows nothing on the page', () => {
        const before = fixedOverlays().length;
        const app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        app.useRouter({ routes });
        expect(hook()?.version).toBe(2);
        expect(typeof hook()?.getWarnings).toBe('function');
        expect(typeof hook()?.on).toBe('function');
        expect(hook()?.isEnabled()).toBe(true);
        expect(fixedOverlays().length).toBe(before);
        app.dispose();
    });

    test('useDevelopment(false) takes the devtools object away', () => {
        const app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        expect(typeof hook()).toBe('object');
        app.useDevelopment(false);
        expect(hook()).toBeUndefined();
        app.dispose();
    });

    test('setting __MOTIF_DEVTOOLS__ by hand does not turn devtools or dev warnings on', () => {
        (globalThis as any).__MOTIF_DEVTOOLS__ = true;
        const before = fixedOverlays().length;
        const app = Application.CreateBuilder().build();
        app.useRouter({ routes });
        app.run(document.createElement('div'));
        motifCompiled(77);
        expect(hook()).toBe(true);
        expect(warn.mock.calls.some(c => String(c[0]).includes('MJX121'))).toBe(false);
        expect(fixedOverlays().length).toBe(before);
        app.dispose();
    });

    test('a devtools=1 query parameter does not turn devtools on', () => {
        window.history.replaceState(null, '', '/?devtools=1');
        const app = Application.CreateBuilder().build();
        app.useRouter({ routes });
        expect(hook()).toBeUndefined();
        app.dispose();
    });

    test('no other devtools global is created', () => {
        const app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        app.useRouter({ routes });
        const g = globalThis as any;
        expect(g.__motifDevBus).toBeUndefined();
        expect(g.__motif_DEVTOOLS).toBeUndefined();
        expect(g.__MOTIF_DEVTOOLS_FLAG).toBeUndefined();
        expect(g.__MOTIF_DEVTOOLS_BUS__).toBeUndefined();
        app.dispose();
    });
});
