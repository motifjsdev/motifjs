/**
 * @jest-environment jsdom
 */
import { Application, Component, DisposableStore, disposableCore, errorHandler, motifCompiled, safeCallSilent } from '@motifx/core';

describe('a __MOTIF_DEV__ flag written by hand', () => {
    const g = globalThis as any;
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;
    let app: Application;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        error = jest.spyOn(console, 'error').mockImplementation(() => { });
        g.__MOTIF_DEV__ = true;
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        app.useDevelopment(false);
        app.dispose();
        delete g.__MOTIF_DEV__;
        warn.mockRestore();
        error.mockRestore();
    });

    const warned = (code: string) => warn.mock.calls.some(c => String(c[0]).includes(code));
    const leakedStore = () => {
        const store = new DisposableStore();
        store.dispose();
        store.add(disposableCore.toDisposable(() => { }));
    };

    test('turns on no dev work: devtools, warnings, quiet error logs and route checks stay off', () => {
        leakedStore();
        safeCallSilent(() => { throw new Error('quiet'); }, 'by-hand');
        motifCompiled(77);
        app.useRouter({ routes: [{ path: '', control: () => new Component('div') }] });

        expect(g.__MOTIF_DEVTOOLS__).toBeUndefined();
        expect(errorHandler.isDevelopment()).toBe(false);
        expect(warned('MJX504')).toBe(false);
        expect(warned('MJX121')).toBe(false);
        expect(warned('MJX310')).toBe(false);
        expect(error.mock.calls.some(c => String(c[0]).includes('by-hand'))).toBe(false);
    });

    test('useDevelopment(true) turns the same work on', () => {
        app.useDevelopment(true);
        leakedStore();
        safeCallSilent(() => { throw new Error('quiet'); }, 'by-use');
        app.useRouter({ routes: [{ path: '', control: () => new Component('div') }] });

        expect(g.__MOTIF_DEVTOOLS__).toBeDefined();
        expect(errorHandler.isDevelopment()).toBe(true);
        expect(warned('MJX504')).toBe(true);
        expect(warned('MJX310')).toBe(true);
        expect(error.mock.calls.some(c => String(c[0]).includes('by-use'))).toBe(true);
    });
});
