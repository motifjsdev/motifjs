import { Component } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

const storeSize = (c: Component) => ((c as any)._disposables._items?.size ?? 0) as number;

describe("off('x:mounted')", () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    test('removing before the element is attached prevents the call', async () => {
        const c = new Component('div');
        const cb = jest.fn();
        c.motif.on('x:mounted' as any, cb);
        await c.motif.off('x:mounted' as any, cb);
        c.build();
        container.appendChild(c.element as Node);
        await wait(20);
        expect(cb).not.toHaveBeenCalled();
    });

    test('removes every subscription of the same handler', async () => {
        const c = new Component('div');
        const cb = jest.fn();
        c.motif.on('x:mounted' as any, cb);
        c.motif.on('x:mounted' as any, cb);
        await c.motif.off('x:mounted' as any, cb);
        c.build();
        container.appendChild(c.element as Node);
        await wait(20);
        expect(cb).not.toHaveBeenCalled();
    });

    test('other handlers stay subscribed', async () => {
        const c = new Component('div');
        const removed = jest.fn();
        const kept = jest.fn();
        c.motif.on('x:mounted' as any, removed);
        c.motif.on('x:mounted' as any, kept);
        await c.motif.off('x:mounted' as any, removed);
        c.build();
        container.appendChild(c.element as Node);
        await wait(20);
        expect(removed).not.toHaveBeenCalled();
        expect(kept).toHaveBeenCalledTimes(1);
    });

    test('off after the handler ran is a no-op', async () => {
        const c = new Component('div');
        const cb = jest.fn();
        c.motif.on('x:mounted' as any, cb);
        c.build();
        container.appendChild(c.element as Node);
        await wait(20);
        await c.motif.off('x:mounted' as any, cb);
        expect(cb).toHaveBeenCalledTimes(1);
    });

    test('repeated on/off does not accumulate disposables', async () => {
        const c = new Component('div');
        const before = storeSize(c);
        for (let i = 0; i < 50; i++) {
            const cb = () => { };
            c.motif.on('x:mounted' as any, cb);
            await c.motif.off('x:mounted' as any, cb);
        }
        expect(storeSize(c)).toBe(before);
    });

    test('a fired subscription releases its disposable', async () => {
        const c = new Component('div');
        c.build();
        const before = storeSize(c);
        c.motif.on('x:mounted' as any, () => { });
        expect(storeSize(c)).toBe(before + 1);
        container.appendChild(c.element as Node);
        await wait(20);
        expect(storeSize(c)).toBe(before);
    });

    test('does not fire again when the element is re-attached', async () => {
        const c = new Component('div');
        const cb = jest.fn();
        c.motif.on('x:mounted' as any, cb);
        c.build();
        container.appendChild(c.element as Node);
        await wait(20);
        container.removeChild(c.element as Node);
        await wait(20);
        container.appendChild(c.element as Node);
        await wait(20);
        expect(cb).toHaveBeenCalledTimes(1);
    });
});

describe('off() on emitter-backed x: events removes every subscription of the handler', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    test('x:visibilityChanged subscribed twice', async () => {
        const root = new Component(container);
        root.build();
        const c = new Component('div');
        root.controls.add(c);
        const cb = jest.fn();
        c.motif.on('x:visibilityChanged' as any, cb);
        c.motif.on('x:visibilityChanged' as any, cb);
        await c.motif.off('x:visibilityChanged' as any, cb);
        await c.motif.hide();
        await c.motif.show();
        expect(cb).not.toHaveBeenCalled();
    });
});
