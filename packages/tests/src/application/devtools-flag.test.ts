import { Application, Component } from '@motifx/core';

describe('devtools flag', () => {
    const routes = [{ path: '/', control: () => new Component('div') }];
    const bus = () => (window as any).__motifDevBus;
    const fixedOverlays = () => Array.from(document.body.children).filter(el => (el as HTMLElement).style?.position === 'fixed');

    afterEach(() => {
        delete (globalThis as any).__MOTIF_DEVTOOLS__;
        window.history.replaceState(null, '', '/');
        const app = Application.CreateBuilder().build();
        app.useDevelopment(false);
        app.dispose();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    test('a devtools=1 query parameter does not turn devtools on', () => {
        window.history.replaceState(null, '', '/?devtools=1');
        const app = Application.CreateBuilder().build();
        app.useRouter({ routes });
        expect(bus()).toBeUndefined();
        app.dispose();
    });

    test('useDevelopment(true) turns devtools on without showing an overlay', () => {
        const before = fixedOverlays().length;
        const app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        app.useRouter({ routes });
        expect(typeof bus()?.getWarnings).toBe('function');
        expect(bus().isEnabled()).toBe(true);
        expect(fixedOverlays().length).toBe(before);
        app.dispose();
    });

    test('useDevelopment(false) turns devtools off again', () => {
        const app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        expect(bus()).toBeDefined();
        app.useDevelopment(false);
        expect(bus()).toBeUndefined();
        app.dispose();
    });

    test('useDevelopment(false) keeps devtools on while the __MOTIF_DEVTOOLS__ global is set', () => {
        (globalThis as any).__MOTIF_DEVTOOLS__ = true;
        const app = Application.CreateBuilder().build();
        app.useDevelopment(false);
        expect(bus()?.isEnabled()).toBe(true);
        app.dispose();
    });

    test('the __MOTIF_DEVTOOLS__ global still turns devtools on', () => {
        (globalThis as any).__MOTIF_DEVTOOLS__ = true;
        const app = Application.CreateBuilder().build();
        app.useRouter({ routes });
        expect(typeof bus()?.getWarnings).toBe('function');
        app.dispose();
    });
});
