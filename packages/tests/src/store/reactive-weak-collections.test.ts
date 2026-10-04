import { effect, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

async function watch<T>(read: () => T) {
    const seen: T[] = [];
    effect(() => { seen.push(read()); });
    await tick();
    return seen;
}

describe('reactive WeakMap and WeakSet', () => {
    it('reruns WeakMap readers on set and delete', async () => {
        const key = {};
        const s = reactive({ cache: new WeakMap<object, number>() });
        const value = await watch(() => s.cache.get(key));
        const has = await watch(() => s.cache.has(key));
        s.cache.set(key, 1);
        await tick();
        s.cache.set(key, 1);
        await tick();
        expect(s.cache.delete(key)).toBe(true);
        await tick();
        expect(value).toEqual([undefined, 1, undefined]);
        expect(has).toEqual([false, true, false]);
    });

    it('reruns WeakSet readers on add and delete only when it changes', async () => {
        const item = {};
        const s = reactive({ seen: new WeakSet<object>() });
        const has = await watch(() => s.seen.has(item));
        s.seen.add(item);
        await tick();
        s.seen.add(item);
        await tick();
        expect(s.seen.delete({})).toBe(false);
        await tick();
        s.seen.delete(item);
        await tick();
        expect(has).toEqual([false, true, false]);
    });

    it('makes objects read from a WeakMap reactive', async () => {
        const key = {};
        const s = reactive({ meta: new WeakMap([[key, { n: 1 }]]) });
        const seen = await watch(() => s.meta.get(key)!.n);
        s.meta.get(key)!.n = 2;
        await tick();
        expect(seen).toEqual([1, 2]);
    });

    it('stores raw keys and finds them given as raw or reactive', () => {
        const rawMap = new WeakMap<object, string>();
        const rawSet = new WeakSet<object>();
        const rawKey = { id: 1 };
        const s = reactive({ map: rawMap, set: rawSet, key: rawKey });
        const proxyKey = s.key;
        s.map.set(proxyKey, 'v');
        s.set.add(proxyKey);
        expect(rawMap.has(rawKey)).toBe(true);
        expect(rawSet.has(rawKey)).toBe(true);
        expect(s.map.get(proxyKey)).toBe('v');
        expect(s.map.get(rawKey)).toBe('v');
        expect(s.set.has(proxyKey)).toBe(true);
    });

    it('keeps identity, instanceof, chaining and native errors', () => {
        const raw = new WeakMap<object, number>();
        const map = reactive(raw);
        expect(reactive(raw)).toBe(map);
        expect(map instanceof WeakMap).toBe(true);
        expect(Object.prototype.toString.call(map)).toBe('[object WeakMap]');
        expect(map.set({}, 1).set({}, 2)).toBe(map);
        expect(() => map.set(1 as any, 1)).toThrow(TypeError);
        expect((map as any).size).toBeUndefined();
        expect((map as any).forEach).toBeUndefined();
    });
});
