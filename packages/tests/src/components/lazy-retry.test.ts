import { Component, Lazy } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

const view = (text: string) => {
    const c = new Component('div');
    (c.element as HTMLElement).textContent = text;
    return c;
};

const setOnline = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
};

describe('Lazy retry', () => {
    let container: HTMLElement;

    beforeEach(() => { container = createTestContainer(); setOnline(true); });
    afterEach(() => { cleanupTestContainer(container); setOnline(true); });

    const mount = (frame: any) => {
        const root = new Component(container as any, {});
        root.controls.add(frame);
        root.build();
        return root;
    };

    test('without retry the caller runs once, as before', async () => {
        const caller = jest.fn(() => Promise.reject(new Error('x')));
        const onError = jest.fn();
        mount(Lazy({ caller, options: { Fallbackview: view('HATA') as any, onError } }));
        await wait(40);

        expect(caller).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain('HATA');
    });

    test('retries and shows the page when a later attempt succeeds', async () => {
        let calls = 0;
        const caller = jest.fn(() => ++calls < 3 ? Promise.reject(new Error('ağ')) : Promise.resolve(view('SAYFA')));
        const onError = jest.fn();
        const onRetry = jest.fn();
        mount(Lazy({ caller, options: { Loaderview: view('YÜKLENİYOR') as any, Fallbackview: view('HATA') as any, retry: { count: 3, delayMs: 5 }, onError, onRetry } }));
        await wait(10);
        expect(container.textContent).toContain('YÜKLENİYOR');
        await wait(80);

        expect(caller).toHaveBeenCalledTimes(3);
        expect(onRetry.mock.calls.map(c => c[0])).toEqual([1, 2]);
        expect(onError).not.toHaveBeenCalled();
        expect(container.textContent).toContain('SAYFA');
        expect(container.textContent).not.toContain('YÜKLENİYOR');
    });

    test('gives up after count attempts and shows the fallback once', async () => {
        const caller = jest.fn(() => Promise.reject(new Error('ağ')));
        const onError = jest.fn();
        mount(Lazy({ caller, options: { Fallbackview: view('HATA') as any, retry: { count: 2, delayMs: 5 }, onError } }));
        await wait(80);

        expect(caller).toHaveBeenCalledTimes(3);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain('HATA');
    });

    test('numeric retry uses the defaults', async () => {
        const caller = jest.fn(() => Promise.reject(new Error('ağ')));
        mount(Lazy({ caller, options: { Fallbackview: view('HATA') as any, retry: 1 } }));
        await wait(100);
        expect(caller).toHaveBeenCalledTimes(1);
        await wait(550);
        expect(caller).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain('HATA');
    });

    test('waits for the connection when offline', async () => {
        setOnline(false);
        let calls = 0;
        const caller = jest.fn(() => ++calls < 2 ? Promise.reject(new Error('ağ')) : Promise.resolve(view('SAYFA')));
        mount(Lazy({ caller, options: { retry: { count: 2, delayMs: 5 } } }));
        await wait(60);
        expect(caller).toHaveBeenCalledTimes(1);

        setOnline(true);
        window.dispatchEvent(new Event('online'));
        await wait(40);

        expect(caller).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain('SAYFA');
    });

    test('whenOnline: false retries without waiting for the connection', async () => {
        setOnline(false);
        const caller = jest.fn(() => Promise.reject(new Error('ağ')));
        mount(Lazy({ caller, options: { retry: { count: 1, delayMs: 5, whenOnline: false } } }));
        await wait(60);

        expect(caller).toHaveBeenCalledTimes(2);
    });

    test('disposing during the wait stops retrying and removes the online listener', async () => {
        setOnline(false);
        const remove = jest.spyOn(window, 'removeEventListener');
        const caller = jest.fn(() => Promise.reject(new Error('ağ')));
        const onError = jest.fn();
        const frame: any = Lazy({ caller, options: { retry: { count: 3, delayMs: 5 }, onError } });
        mount(frame);
        await wait(30);
        await frame.dispose();
        const removedOnline = remove.mock.calls.some(c => c[0] === 'online');
        remove.mockRestore();

        setOnline(true);
        window.dispatchEvent(new Event('online'));
        await wait(40);

        expect(removedOnline).toBe(true);
        expect(caller).toHaveBeenCalledTimes(1);
    });

    test('abort during the wait stops retrying', async () => {
        const ctrl = new AbortController();
        const caller = jest.fn(() => Promise.reject(new Error('ağ')));
        mount(Lazy({ caller, options: { retry: { count: 3, delayMs: 30 }, signal: ctrl.signal } }));
        await wait(10);
        ctrl.abort();
        await wait(120);

        expect(caller).toHaveBeenCalledTimes(1);
    });
});
