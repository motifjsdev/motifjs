import { createSignal, createLazyComputed, createComputed, LazyComputed, effect, reactive } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

describe('createLazyComputed', () => {
    test('does not compute until first read, then caches', () => {
        const a = createSignal(1);
        let calls = 0;
        const lazy = createLazyComputed(() => { calls++; return a.value * 2; });
        expect(lazy).toBeInstanceOf(LazyComputed);
        expect(calls).toBe(0);
        expect(lazy.isDirty).toBe(true);

        expect(lazy.value).toBe(2);
        expect(lazy.value).toBe(2);
        expect(calls).toBe(1);
        expect(lazy.isDirty).toBe(false);
    });

    test('a dependency change only marks dirty; recompute happens on the next read', () => {
        const a = createSignal(1);
        let calls = 0;
        const lazy = createLazyComputed(() => { calls++; return a.value * 2; });
        void lazy.value;
        expect(calls).toBe(1);

        a.value = 5;
        expect(calls).toBe(1);
        expect(lazy.isDirty).toBe(true);

        expect(lazy.value).toBe(10);
        expect(calls).toBe(2);
    });

    test('is fresh synchronously right after a write', () => {
        const state = reactive({ n: 1 });
        const lazy = createLazyComputed(() => state.n + 1);
        expect(lazy.value).toBe(2);
        state.n = 41;
        expect(lazy.value).toBe(42);
    });

    test('several dependency changes while dirty cost one recompute', () => {
        const a = createSignal(1);
        const b = createSignal(1);
        let calls = 0;
        const lazy = createLazyComputed(() => { calls++; return a.value + b.value; });
        void lazy.value;
        a.value = 2;
        b.value = 3;
        a.value = 4;
        expect(calls).toBe(1);
        expect(lazy.value).toBe(7);
        expect(calls).toBe(2);
    });

    test('effects that read it re-run after a dependency change and see the fresh value', async () => {
        const a = createSignal(1);
        let calls = 0;
        const lazy = createLazyComputed(() => { calls++; return a.value * 10; });
        const seen: number[] = [];
        effect(() => { seen.push(lazy.value); });
        effect(() => { void lazy.value; });
        await nextTick();
        expect(seen).toEqual([10]);
        expect(calls).toBe(1);

        a.value = 2;
        await nextTick();
        expect(seen).toEqual([10, 20]);
        expect(calls).toBe(2);
    });

    test('the outer effect subscribes to the computed, not to its inner dependencies', async () => {
        const a = createSignal(1);
        const b = createSignal(100);
        const lazy = createLazyComputed(() => a.value);
        let runs = 0;
        effect(() => { runs++; void lazy.value; void b.value; });
        await nextTick();
        expect(runs).toBe(1);

        a.value = 2;
        await nextTick();
        expect(runs).toBe(2);
    });

    test('peek does not subscribe the reading effect', async () => {
        const a = createSignal(1);
        const lazy = createLazyComputed(() => a.value);
        let runs = 0;
        effect(() => { runs++; void lazy.peek(); });
        await nextTick();
        a.value = 2;
        await nextTick();
        expect(runs).toBe(1);
        expect(lazy.peek()).toBe(2);
    });

    test('a chain of lazy computeds over a signal stays synchronously fresh', () => {
        const a = createSignal(2);
        const lazy = createLazyComputed(() => a.value * 3 + 1);
        const lazy2 = createLazyComputed(() => lazy.value * 2);
        expect(lazy2.value).toBe(14);
        a.value = 3;
        expect(lazy2.value).toBe(20);
    });

    test('through an eager createComputed the fresh value arrives after the flush', async () => {
        const a = createSignal(2);
        const eager = createComputed(() => a.value * 3);
        const lazy = createLazyComputed(() => eager.value + 1);
        const lazy2 = createLazyComputed(() => lazy.value * 2);
        expect(lazy2.value).toBe(14);
        a.value = 3;
        expect(lazy2.value).toBe(14);
        await nextTick();
        expect(lazy2.value).toBe(20);
    });

    test('dispose stops tracking; later reads keep the last value', () => {
        const a = createSignal(1);
        let calls = 0;
        const lazy = createLazyComputed(() => { calls++; return a.value; });
        expect(lazy.value).toBe(1);
        lazy.dispose();
        a.value = 2;
        expect(lazy.isDirty).toBe(false);
        expect(lazy.value).toBe(1);
        expect(calls).toBe(1);
    });

    test('a getter that throws does not break later reads', () => {
        const a = createSignal(0);
        const lazy = createLazyComputed(() => {
            if (a.value === 0) throw new Error('boom');
            return a.value;
        });
        expect(lazy.value).toBeUndefined();
        a.value = 3;
        expect(lazy.value).toBe(3);
    });
});
