import { reactive, effect } from '@motifx/core';
import { debugGetDeps } from '@motifx/core/devtools';

const flush = () => new Promise((r) => setTimeout(r, 0));

const indexKeys = (target: object) => [...(debugGetDeps(target)?.keys() ?? [])].filter((key) => typeof key === 'string' && /^\d+$/.test(key));

type Item = { id: number; value: number; extra: number };
const items = (count: number): Item[] => Array.from({ length: count }, (_, id) => ({ id, value: id + 1, extra: 0 }));

describe('scanning a reactive array', () => {
    test('find tracks the list with one key, not index by index', async () => {
        const state = reactive({ list: items(5) });
        let runs = 0;
        effect(() => { runs++; state.list.find((x) => x.id === 2); });
        await flush();
        expect(runs).toBe(1);
        expect(indexKeys(state.list)).toEqual([]);
        expect(debugGetDeps(state.list)!.size).toBeLessThanOrEqual(2);
    });

    test.each([
        ['splice', (list: Item[]) => { list.splice(0, 1); }],
        ['index overwrite', (list: Item[]) => { list[1] = { id: 7, value: 7, extra: 0 }; }],
        ['length truncate', (list: Item[]) => { list.length = 2; }],
        ['sort', (list: Item[]) => { list.sort((a, b) => b.id - a.id); }],
        ['reverse', (list: Item[]) => { list.reverse(); }],
        ['unshift', (list: Item[]) => { list.unshift({ id: -1, value: 0, extra: 0 }); }],
        ['delete', (list: Item[]) => { delete (list as any)[0]; }],
    ])('%s reruns a scanning effect exactly once', async (_name, change) => {
        const state = reactive({ list: items(5) });
        let runs = 0;
        effect(() => { runs++; state.list.find((x) => x.id === 2); });
        await flush();
        change(state.list);
        await flush();
        expect(runs).toBe(2);
    });

    test.each([
        ['push', (list: Item[]) => { list.push({ id: 9, value: 9, extra: 0 }); }],
        ['splice after the match', (list: Item[]) => { list.splice(4, 0, { id: 8, value: 8, extra: 0 }); }],
        ['index overwrite after the match', (list: Item[]) => { list[4] = { id: 7, value: 7, extra: 0 }; }],
        ['pop', (list: Item[]) => { list.pop(); }],
        ['length truncate after the match', (list: Item[]) => { list.length = 3; }],
        ['field change after the match', (list: Item[]) => { list[4].id = 70; }],
    ])('%s beyond the index where find stopped leaves the effect alone', async (_name, change) => {
        const state = reactive({ list: items(5) });
        let runs = 0;
        effect(() => { runs++; state.list.find((x) => x.id === 2); });
        await flush();
        change(state.list);
        await flush();
        expect(runs).toBe(1);
    });

    test('a scan without a match depends on the whole list and sees the pushed match', async () => {
        const state = reactive({ list: items(5) });
        let found: Item | undefined;
        effect(() => { found = state.list.find((x) => x.id === 9); });
        await flush();
        expect(found).toBeUndefined();
        state.list.push({ id: 9, value: 9, extra: 0 });
        await flush();
        expect(found?.id).toBe(9);
    });

    test('some, every, indexOf and includes that stop early follow only the prefix they read', async () => {
        const state = reactive({ list: items(5), tags: ['a', 'b', 'c'] });
        let runs = 0;
        effect(() => { runs++; state.list.some((x) => x.id === 1); state.list.every((x) => x.id < 3); state.tags.indexOf('b'); state.tags.includes('a'); });
        await flush();
        state.list.push({ id: 9, value: 9, extra: 0 });
        state.tags.push('d');
        state.tags[2] = 'z';
        await flush();
        expect(runs).toBe(1);
        state.tags[1] = 'x';
        await flush();
        expect(runs).toBe(2);
        state.list.splice(3, 1);
        await flush();
        expect(runs).toBe(3);
    });

    test('the prefix follows the longest scan of a run and is recomputed on every run', async () => {
        const state = reactive({ list: items(6) });
        let runs = 0;
        effect(() => { runs++; state.list.find((x) => x.id === 1); state.list.some((x) => x.id === 3); });
        await flush();
        state.list[4] = { id: 40, value: 0, extra: 0 };
        await flush();
        expect(runs).toBe(1);
        state.list[2] = { id: 20, value: 0, extra: 0 };
        await flush();
        expect(runs).toBe(2);
        state.list[4] = { id: 41, value: 0, extra: 0 };
        await flush();
        expect(runs).toBe(2);
    });

    test('a match at the last index still leaves a later push alone', async () => {
        const state = reactive({ list: items(3) });
        let runs = 0;
        effect(() => { runs++; state.list.findIndex((x) => x.id === 2); });
        await flush();
        state.list.push({ id: 9, value: 9, extra: 0 });
        await flush();
        expect(runs).toBe(1);
        state.list.unshift({ id: -1, value: 0, extra: 0 });
        await flush();
        expect(runs).toBe(2);
    });

    test('stopping a scanning effect releases its subscription to the list', async () => {
        const state = reactive({ list: items(5) });
        const stop = effect(() => { state.list.find((x) => x.id === 2); });
        await flush();
        expect(debugGetDeps(state.list)!.size).toBeGreaterThan(0);
        stop();
        expect(debugGetDeps(state.list)).toBeUndefined();
    });

    test('a field the scan reads reruns the effect, a field it does not read does not', async () => {
        const state = reactive({ list: items(5) });
        let runs = 0;
        effect(() => { runs++; state.list.findIndex((x) => x.id === 3); });
        await flush();
        state.list[1].extra = 42;
        await flush();
        expect(runs).toBe(1);
        state.list[1].id = 30;
        await flush();
        expect(runs).toBe(2);
    });

    test('find, filter, slice and the iterators give reactive items', async () => {
        const state = reactive({ list: items(3) });
        const found = state.list.find((x) => x.id === 1)!;
        const [filtered] = state.list.filter((x) => x.id === 2);
        const [sliced] = state.list.slice(0, 1);
        const [iterated] = [...state.list];
        const [[, entry]] = [...state.list.entries()];
        let total = 0;
        let runs = 0;
        effect(() => { runs++; total = state.list[0].value + state.list[1].value + state.list[2].value; });
        await flush();
        expect(total).toBe(6);
        found.value = 20;
        filtered.value = 30;
        sliced.value = 100;
        await flush();
        expect(total).toBe(150);
        iterated.value = 1000;
        entry.value = 2000;
        await flush();
        expect(total).toBe(2050);
        expect(runs).toBe(3);
    });

    test('for...of and spread track the list once and follow its changes', async () => {
        const state = reactive({ list: items(4) });
        let sum = 0;
        let runs = 0;
        effect(() => { runs++; sum = 0; for (const item of state.list) sum += item.value; });
        await flush();
        expect(sum).toBe(10);
        expect(indexKeys(state.list)).toEqual([]);
        state.list.push({ id: 4, value: 5, extra: 0 });
        await flush();
        expect(sum).toBe(15);
        state.list[0].value = 11;
        await flush();
        expect(sum).toBe(25);
        expect(runs).toBe(3);
    });

    test('reduce without an initial value starts from the first item and tracks the list once', async () => {
        const state = reactive({ list: items(3) });
        let total = 0;
        effect(() => { total = state.list.reduce((a, b) => ({ id: 0, value: a.value + b.value, extra: 0 })).value; });
        await flush();
        expect(total).toBe(6);
        expect(indexKeys(state.list)).toEqual([]);
        state.list.push({ id: 3, value: 10, extra: 0 });
        await flush();
        expect(total).toBe(16);
        expect(state.list.reduceRight((acc, item) => acc + item.id, '')).toBe('3210');
        expect(reactive({ list: [] as number[] }).list.reduce((a, b) => a + b, 7)).toBe(7);
    });

    test.each(['map', 'forEach', 'flatMap', 'join', 'findLast', 'findLastIndex'] as const)('%s reruns when the list changes and never on its own', async (method) => {
        const state = reactive({ list: items(3) });
        let runs = 0;
        effect(() => { runs++; (state.list as any)[method]((x: Item) => x.value > 1); });
        await flush();
        await flush();
        expect(runs).toBe(1);
        state.list.push({ id: 3, value: 4, extra: 0 });
        await flush();
        expect(runs).toBe(2);
        expect(indexKeys(state.list)).toEqual([]);
    });

    test('includes and indexOf with a start index follow the copy they found, not an earlier one', async () => {
        const state = reactive({ tags: ['a', 'b', 'a'] });
        const seen: boolean[] = [];
        effect(() => { seen.push(state.tags.includes('a', 1)); });
        await flush();
        state.tags[2] = 'c';
        await flush();
        expect(seen).toEqual([true, false]);
        const list = reactive({ tags: ['a', 'b', 'a'] });
        const idx: number[] = [];
        effect(() => { idx.push(list.tags.indexOf('a', 1)); });
        await flush();
        list.tags[2] = 'c';
        await flush();
        expect(idx).toEqual([2, -1]);
    });

    test('includes follows an index overwrite', async () => {
        const state = reactive({ tags: ['a', 'b'] });
        const seen: boolean[] = [];
        effect(() => { seen.push(state.tags.includes('x')); });
        await flush();
        state.tags[0] = 'x';
        await flush();
        expect(seen).toEqual([false, true]);
    });

    test('a structural change on a large list wakes a scanning effect once', async () => {
        const state = reactive({ list: items(500) });
        let runs = 0;
        effect(() => { runs++; state.list.some((x) => x.id === 499); });
        await flush();
        state.list.splice(0, 1);
        await flush();
        expect(runs).toBe(2);
        state.list.unshift({ id: -1, value: 0, extra: 0 });
        await flush();
        expect(runs).toBe(3);
    });

    test('a scan inside a mutator of another array still tracks that array', async () => {
        const state = reactive({ list: items(3), log: [] as number[] });
        let runs = 0;
        effect(() => { runs++; state.log.length; });
        await flush();
        state.list.sort((a, b) => { state.log.push(a.id); return a.id - b.id; });
        await flush();
        expect(runs).toBe(2);
    });
});
