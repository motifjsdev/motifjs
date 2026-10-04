import { Component, Lazy, MotifError, errorHandler } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

const view = (text: string) => {
    const c = new Component('div');
    (c.element as HTMLElement).textContent = text;
    return c;
};

describe('Lazy load failure reporting', () => {
    let container: HTMLElement;
    let reported: any[];
    let off: () => void;
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        container = createTestContainer();
        reported = [];
        off = errorHandler.addListener(e => { reported.push(e); });
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
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

    test('without a Fallbackview the failure reaches errorHandler listeners as MJX126 with the cause', async () => {
        const cause = new Error('yükleme hatası');
        const onError = jest.fn();
        mount(Lazy({ caller: () => Promise.reject(cause), options: { Placeholderview: view('YÜKLENİYOR') as any, onError } }));
        await wait(20);
        expect(onError).toHaveBeenCalledWith(cause);
        expect(reported).toHaveLength(1);
        expect(reported[0]).toBeInstanceOf(MotifError);
        expect(reported[0].code).toBe('MJX126');
        expect(reported[0].cause).toBe(cause);
        expect(container.textContent).not.toContain('YÜKLENİYOR');
    });

    test('with a Fallbackview the failure is shown, not reported', async () => {
        mount(Lazy({ caller: () => Promise.reject(new Error('x')), options: { Fallbackview: view('HATA') as any } }));
        await wait(20);
        expect(container.textContent).toContain('HATA');
        expect(reported).toHaveLength(0);
    });

    test('an aborted load is not reported', async () => {
        const ctrl = new AbortController();
        const onError = jest.fn();
        mount(Lazy({ caller: () => new Promise(() => { }), options: { signal: ctrl.signal, onError } }));
        ctrl.abort();
        await wait(20);
        expect(onError).toHaveBeenCalled();
        expect(reported).toHaveLength(0);
    });
});
