import { effect, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

async function watch<T>(read: () => T) {
    const seen: T[] = [];
    effect(() => { seen.push(read()); });
    await tick();
    return seen;
}

describe('reactive Map', () => {
    it('reruns a get reader when that key changes', async () => {
        const s = reactive({ map: new Map([['a', 1], ['b', 2]]) });
        const seen = await watch(() => s.map.get('a'));
        s.map.set('a', 10);
        await tick();
        s.map.set('b', 20);
        await tick();
        expect(seen).toEqual([1, 10]);
    });

    it('does not rerun when the same value is written', async () => {
        const s = reactive({ map: new Map([['a', 1]]) });
        const seen = await watch(() => s.map.get('a'));
        s.map.set('a', 1);
        await tick();
        expect(seen).toEqual([1]);
    });

    it('reruns has and size readers when a key is added', async () => {
        const s = reactive({ map: new Map<string, number>() });
        const has = await watch(() => s.map.has('x'));
        const size = await watch(() => s.map.size);
        s.map.set('x', 1);
        await tick();
        expect(has).toEqual([false, true]);
        expect(size).toEqual([0, 1]);
    });

    it('reruns on delete only when the key existed', async () => {
        const s = reactive({ map: new Map([['a', 1]]) });
        const seen = await watch(() => s.map.has('a'));
        expect(s.map.delete('missing')).toBe(false);
        await tick();
        expect(s.map.delete('a')).toBe(true);
        await tick();
        expect(seen).toEqual([true, false]);
    });

    it('reruns readers on clear, and not when already empty', async () => {
        const s = reactive({ map: new Map([['a', 1]]) });
        const value = await watch(() => s.map.get('a'));
        const size = await watch(() => s.map.size);
        s.map.clear();
        await tick();
        s.map.clear();
        await tick();
        expect(value).toEqual([1, undefined]);
        expect(size).toEqual([1, 0]);
    });

    it('tracks object and number keys by identity', async () => {
        const key = { id: 1 };
        const s = reactive({ map: new Map<unknown, string>([[key, 'obj'], [1, 'one'], ['1', 'string']]) });
        const seen = await watch(() => `${s.map.get(key)}|${s.map.get(1)}`);
        s.map.set('1', 'changed');
        await tick();
        s.map.set(1, 'ONE');
        await tick();
        expect(seen).toEqual(['obj|one', 'obj|ONE']);
    });

    it('makes a top-level Map reactive', async () => {
        const map = reactive(new Map([['a', 1]]));
        const seen = await watch(() => map.get('a'));
        map.set('a', 2);
        await tick();
        expect(seen).toEqual([1, 2]);
    });

    it('keeps identity, instanceof and chaining', () => {
        const raw = new Map([['a', 1]]);
        const s = reactive({ map: raw });
        expect(s.map).toBe(s.map);
        expect(reactive(raw)).toBe(s.map);
        expect(s.map instanceof Map).toBe(true);
        expect(s.map.set('b', 2).set('c', 3)).toBe(s.map);
        expect(raw.get('c')).toBe(3);
    });

    it('returns the same results as a plain Map from forEach, entries and spread', () => {
        const s = reactive({ map: new Map([['a', 1], ['b', 2]]) });
        const keys: string[] = [];
        s.map.forEach((_v, k) => keys.push(k));
        expect(keys).toEqual(['a', 'b']);
        expect([...s.map.entries()]).toEqual([['a', 1], ['b', 2]]);
        expect([...s.map]).toEqual([['a', 1], ['b', 2]]);
        expect(Object.prototype.toString.call(s.map)).toBe('[object Map]');
    });
});
