/**
 * @jest-environment jsdom
 */
import { Component, Lazy, errorHandler } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

const view = (text: string) => {
    const c = new Component('div');
    (c.element as HTMLElement).textContent = text;
    return c;
};

class Page extends Component {
    static built = 0;
    constructor() { super('p'); Page.built++; }
}

class SlowLoader extends Component {
    constructor() { super('div'); }
    override async dispose(options?: any): Promise<void> { await wait(80); return super.dispose(options); }
    override async disposeAsync(options?: any): Promise<void> { await wait(80); return super.disposeAsync(options); }
}

const deferred = () => {
    let resolve!: (v: any) => void;
    let reject!: (e: any) => void;
    const promise = new Promise<any>((r, j) => { resolve = r; reject = j; });
    return { promise, resolve, reject };
};

describe('Lazy: cancellation and disposal are not failures', () => {
    let container: HTMLElement;
    let reported: any[];
    let off: () => void;
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        container = createTestContainer();
        reported = [];
        off = errorHandler.addListener(e => { reported.push(e); });
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
        Page.built = 0;
    });
    afterEach(() => {
        off();
        consoleError.mockRestore();
        cleanupTestContainer(container);
    });

    const mount = (frame: any) => {
        const root = new Component(container as any, {});
        root.controls.add(frame);
        root.build();
        return root;
    };
    const codes = () => reported.map(e => e.code);

    test.each([
        ['frame.dispose()', true, (f: any, _r: any) => f.dispose()],
        ['frame.dispose()', false, (f: any, _r: any) => f.dispose()],
        ['root.dispose()', true, (_f: any, r: any) => r.dispose()],
        ['root.dispose()', false, (_f: any, r: any) => r.dispose()],
    ])('%s during the retry wait (Fallbackview: %s): no callback, no report, nothing built', async (_n, withFallback, disposeWith) => {
        const caller = jest.fn(() => Promise.reject(new Error('boom')));
        const onError = jest.fn();
        const onRetry = jest.fn();
        const fallback = view('HATA');
        const frame: any = Lazy({ caller, options: { retry: { count: 3, delayMs: 30 }, onError, onRetry, ...(withFallback ? { Fallbackview: fallback } : {}) } });
        const root = mount(frame);
        await wait(10);
        expect(onRetry).toHaveBeenCalledTimes(1);
        await disposeWith(frame, root);
        await wait(120);
        expect(caller).toHaveBeenCalledTimes(1);
        expect(onError).not.toHaveBeenCalled();
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(codes()).toEqual([]);
        expect(fallback.isBuilt).toBe(false);
    });

    test('disposing while an attempt is pending ignores a later rejection', async () => {
        const d = deferred();
        const onError = jest.fn();
        const frame: any = Lazy({ caller: () => d.promise, options: { retry: 2, onError } });
        mount(frame);
        await wait(5);
        await frame.dispose();
        d.reject(new Error('boom'));
        await wait(30);
        expect(onError).not.toHaveBeenCalled();
        expect(codes()).toEqual([]);
    });

    test('disposing while an attempt is pending ignores a later resolution and builds nothing', async () => {
        const d = deferred();
        const onError = jest.fn();
        const frame: any = Lazy({ caller: () => d.promise, options: { onError } });
        mount(frame);
        await wait(5);
        await frame.dispose();
        d.resolve({ default: Page });
        await wait(30);
        expect(Page.built).toBe(0);
        expect(onError).not.toHaveBeenCalled();
    });

    test('disposing while minDelayMs is waiting does not build the page', async () => {
        const frame: any = Lazy({ caller: () => Promise.resolve({ default: Page }), options: { minDelayMs: 80 } });
        mount(frame);
        await wait(10);
        await frame.dispose();
        await wait(120);
        expect(Page.built).toBe(0);
    });

    test('a direct frame.dispose() that first waits for the loading view stops the retry due in that window', async () => {
        const caller = jest.fn(() => Promise.reject(new Error('boom')));
        const frame: any = Lazy({ caller, options: { retry: { count: 3, delayMs: 30 }, Loaderview: new SlowLoader() } });
        mount(frame);
        await wait(10);
        const disposing = frame.dispose();
        await wait(60);
        await disposing;
        await wait(60);
        expect(caller).toHaveBeenCalledTimes(1);
        expect(codes()).toEqual([]);
    });

    test('aborting during the retry wait calls onError once with MJX111 and nothing else', async () => {
        const ctrl = new AbortController();
        const caller = jest.fn(() => Promise.reject(new Error('boom')));
        const onError = jest.fn();
        const onRetry = jest.fn();
        const fallback = view('HATA');
        const frame: any = Lazy({ caller, options: { signal: ctrl.signal, retry: { count: 3, delayMs: 40 }, onError, onRetry, Fallbackview: fallback } });
        mount(frame);
        await wait(10);
        expect(onRetry).toHaveBeenCalledTimes(1);
        ctrl.abort();
        await wait(100);
        expect(caller).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect((onError.mock.calls[0][0] as any).code).toBe('MJX111');
        expect(fallback.isBuilt).toBe(false);
        expect(codes()).toEqual([]);
    });

    test('aborting during an attempt calls onError once with MJX111', async () => {
        const ctrl = new AbortController();
        const d = deferred();
        const onError = jest.fn();
        const onRetry = jest.fn();
        const frame: any = Lazy({ caller: () => d.promise, options: { signal: ctrl.signal, retry: 3, onError, onRetry } });
        mount(frame);
        await wait(5);
        ctrl.abort();
        await wait(20);
        expect(onError).toHaveBeenCalledTimes(1);
        expect((onError.mock.calls[0][0] as any).code).toBe('MJX111');
        expect(onRetry).not.toHaveBeenCalled();
        expect(codes()).toEqual([]);
    });

    test('signal listeners added per attempt are removed when the attempt settles', async () => {
        const ctrl = new AbortController();
        const add = jest.spyOn(ctrl.signal, 'addEventListener');
        const remove = jest.spyOn(ctrl.signal, 'removeEventListener');
        const caller = jest.fn(() => Promise.reject(new Error('boom')));
        const frame: any = Lazy({ caller, options: { signal: ctrl.signal, retry: { count: 2, delayMs: 10 }, onError: () => { } } });
        mount(frame);
        await wait(100);
        expect(caller).toHaveBeenCalledTimes(3);
        expect(add.mock.calls.length).toBeGreaterThan(0);
        expect(remove.mock.calls.length).toBe(add.mock.calls.length);
    });

    test('exhausting the retries is still a failure: onError once with the last error, then MJX126 without a Fallbackview', async () => {
        const caller = jest.fn(() => Promise.reject(new Error('boom')));
        const onError = jest.fn();
        const frame: any = Lazy({ caller, options: { retry: { count: 1, delayMs: 10 }, onError } });
        mount(frame);
        await wait(80);
        expect(caller).toHaveBeenCalledTimes(2);
        expect(onError).toHaveBeenCalledTimes(1);
        expect((onError.mock.calls[0][0] as Error).message).toBe('boom');
        expect(codes()).toEqual(['MJX126']);
    });
});
