import { effect, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

async function watch<T>(read: () => T) {
    const seen: T[] = [];
    effect(() => { seen.push(read()); });
    await tick();
    return seen;
}

describe('reactive Set', () => {
    it('reruns has and size readers when a value is added', async () => {
        const s = reactive({ tags: new Set<string>() });
        const has = await watch(() => s.tags.has('x'));
        const size = await watch(() => s.tags.size);
        s.tags.add('x');
        await tick();
        expect(has).toEqual([false, true]);
        expect(size).toEqual([0, 1]);
    });

    it('does not rerun when an existing value is added again', async () => {
        const s = reactive({ tags: new Set(['x']) });
        const size = await watch(() => s.tags.size);
        s.tags.add('x');
        await tick();
        expect(size).toEqual([1]);
    });

    it('reruns a has reader only for its own value', async () => {
        const s = reactive({ tags: new Set<string>() });
        const seen = await watch(() => s.tags.has('a'));
        s.tags.add('b');
        await tick();
        s.tags.add('a');
        await tick();
        expect(seen).toEqual([false, true]);
    });

    it('reruns on delete and clear only when something was removed', async () => {
        const s = reactive({ tags: new Set(['a', 'b']) });
        const size = await watch(() => s.tags.size);
        expect(s.tags.delete('missing')).toBe(false);
        await tick();
        expect(s.tags.delete('a')).toBe(true);
        await tick();
        s.tags.clear();
        await tick();
        s.tags.clear();
        await tick();
        expect(size).toEqual([2, 1, 0]);
    });

    it('makes a top-level Set reactive and keeps identity', async () => {
        const raw = new Set([1]);
        const set = reactive(raw);
        expect(reactive(raw)).toBe(set);
        expect(set instanceof Set).toBe(true);
        expect(set.add(2).add(3)).toBe(set);
        const seen = await watch(() => set.has(4));
        set.add(4);
        await tick();
        expect(seen).toEqual([false, true]);
        expect(raw.has(4)).toBe(true);
    });

    it('keeps working when the whole Set is replaced', async () => {
        const s = reactive({ selection: new Set<string>() as ReadonlySet<string> });
        const seen = await watch(() => s.selection.has('row1'));
        s.selection = new Set([...s.selection, 'row1']);
        await tick();
        s.selection = new Set();
        await tick();
        expect(seen).toEqual([false, true, false]);
    });

    it('still supports the methods it does not track yet', () => {
        const s = reactive({ tags: new Set(['a', 'b']) });
        const out: string[] = [];
        s.tags.forEach(v => out.push(v));
        expect(out).toEqual(['a', 'b']);
        expect([...s.tags]).toEqual(['a', 'b']);
        expect([...s.tags.values()]).toEqual(['a', 'b']);
    });
});
