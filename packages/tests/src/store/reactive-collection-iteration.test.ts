import { effect, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

async function watch<T>(read: () => T) {
    const seen: T[] = [];
    effect(() => { seen.push(read()); });
    await tick();
    return seen;
}

describe('iterating reactive collections', () => {
    it('reruns Map iteration readers on add, change and delete', async () => {
        const s = reactive({ map: new Map([['a', 1]]) });
        const forEach = await watch(() => { const out: string[] = []; s.map.forEach((v, k) => out.push(`${k}=${v}`)); return out.join(','); });
        const entries = await watch(() => [...s.map.entries()].map(([k, v]) => `${k}=${v}`).join(','));
        const values = await watch(() => [...s.map.values()].join(','));
        const spread = await watch(() => [...s.map].length);
        s.map.set('b', 2);
        await tick();
        s.map.set('a', 10);
        await tick();
        s.map.delete('b');
        await tick();
        expect(forEach).toEqual(['a=1', 'a=1,b=2', 'a=10,b=2', 'a=10']);
        expect(entries).toEqual(['a=1', 'a=1,b=2', 'a=10,b=2', 'a=10']);
        expect(values).toEqual(['1', '1,2', '10,2', '10']);
        expect(spread).toEqual([1, 2, 2, 1]);
    });

    it('reruns Map keys() only when the set of keys changes', async () => {
        const s = reactive({ map: new Map([['a', 1]]) });
        const keys = await watch(() => [...s.map.keys()].join(','));
        s.map.set('a', 2);
        await tick();
        s.map.set('b', 1);
        await tick();
        s.map.delete('a');
        await tick();
        s.map.clear();
        await tick();
        expect(keys).toEqual(['a', 'a,b', 'b', '']);
    });

    it('reruns Set iteration readers on add and delete', async () => {
        const s = reactive({ tags: new Set(['a']) });
        const forOf = await watch(() => { const out: string[] = []; for (const t of s.tags) out.push(t); return out.join(','); });
        const keys = await watch(() => [...s.tags.keys()].join(','));
        const forEach = await watch(() => { let n = 0; s.tags.forEach(() => n++); return n; });
        s.tags.add('b');
        await tick();
        s.tags.add('b');
        await tick();
        s.tags.delete('a');
        await tick();
        expect(forOf).toEqual(['a', 'a,b', 'b']);
        expect(keys).toEqual(['a', 'a,b', 'b']);
        expect(forEach).toEqual([1, 2, 1]);
    });

    it('passes thisArg and the reactive collection to forEach callbacks', () => {
        const s = reactive({ map: new Map([['a', 1]]) });
        const ctx = { tag: 'ctx' };
        let seenThis: unknown;
        let seenCollection: unknown;
        s.map.forEach(function (this: unknown, _v, _k, collection) { seenThis = this; seenCollection = collection; }, ctx);
        expect(seenThis).toBe(ctx);
        expect(seenCollection).toBe(s.map);
    });

    it('does not rerun iteration when a write changes nothing', async () => {
        const s = reactive({ map: new Map([['a', 1]]), tags: new Set(['x']) });
        const seen = await watch(() => `${[...s.map].length}|${[...s.tags].length}`);
        s.map.set('a', 1);
        s.tags.add('x');
        s.map.delete('missing');
        s.tags.delete('missing');
        await tick();
        expect(seen).toEqual(['1|1']);
    });
});
