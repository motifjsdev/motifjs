import { types } from 'node:util';
import { effect, reactive } from '@motifx/core';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('a write that leaves the value unchanged wakes nobody', () => {
    test('assigning an object field to itself keeps the raw object raw and runs no effect', async () => {
        const raw = { child: { n: 1 } };
        const rawChild = raw.child;
        const state = reactive(raw);
        let runs = 0;
        effect(() => { runs++; state.child; });
        state.child = state.child;
        await flush();
        expect(runs).toBe(1);
        expect(raw.child).toBe(rawChild);
        expect(types.isProxy(raw.child)).toBe(false);
    });

    test('a reactive object assigned into another is stored raw and read back reactive', async () => {
        const other = { n: 2 };
        const raw = { child: { n: 1 } as { n: number } };
        const state = reactive(raw);
        const reactiveOther = reactive(other);
        let runs = 0;
        let seen = 0;
        effect(() => { runs++; seen = state.child.n; });
        state.child = reactiveOther;
        await flush();
        expect(runs).toBe(2);
        expect(raw.child).toBe(other);
        expect(state.child).toBe(reactiveOther);
        reactiveOther.n = 3;
        await flush();
        expect(seen).toBe(3);
        state.child = reactiveOther;
        await flush();
        expect(runs).toBe(3);
    });

    test('array index, length and plain property writes of the same value run no effect', async () => {
        const list = reactive([1, 2, 3] as number[] & { note?: string });
        list.note = 'a';
        let iterations = 0;
        let index = 0;
        let length = 0;
        let note = 0;
        effect(() => { iterations++; list.map((x) => x); });
        effect(() => { index++; list[0]; });
        effect(() => { length++; list.length; });
        effect(() => { note++; list.note; });
        list[0] = list[0];
        list.length = list.length;
        list.note = 'a';
        await flush();
        expect([iterations, index, length, note]).toEqual([1, 1, 1, 1]);
        list[0] = 10;
        await flush();
        expect([iterations, index, length]).toEqual([2, 2, 1]);
        list.length = 2;
        await flush();
        expect([iterations, length]).toEqual([3, 2]);
    });

    test('a reactive item pushed into a reactive array is stored raw and read back reactive', async () => {
        const rawItem = { n: 1 };
        const rawList: Array<{ n: number }> = [];
        const list = reactive(rawList);
        const item = reactive(rawItem);
        let runs = 0;
        effect(() => { runs++; list.length; });
        list.push(item);
        await flush();
        expect(runs).toBe(2);
        expect(rawList[0]).toBe(rawItem);
        expect(list[0]).toBe(item);
    });

    test('filling a hole with undefined is a change, writing undefined over it again is not', async () => {
        const list = reactive([1, , 3] as (number | undefined)[]);
        let runs = 0;
        let owned = 0;
        effect(() => { runs++; owned = 0; list.forEach(() => { owned++; }); });
        expect(owned).toBe(2);
        list[1] = undefined;
        await flush();
        expect(runs).toBe(2);
        expect(owned).toBe(3);
        list[1] = undefined;
        await flush();
        expect(runs).toBe(2);
    });

    test('an in-place sort that changes nothing wakes no index or prefix reader', async () => {
        const list = reactive([1, 2, 3]);
        let index = 0;
        let found = 0;
        effect(() => { index++; list[0]; });
        effect(() => { found++; list.indexOf(2); });
        list.sort((a, b) => a - b);
        await flush();
        expect([index, found]).toEqual([1, 1]);
        list.sort((a, b) => b - a);
        await flush();
        expect([index, found]).toEqual([2, 2]);
    });

    test('a map keeps behaving the same way', async () => {
        const map = reactive(new Map<string, { n: number }>());
        const item = reactive({ n: 1 });
        let runs = 0;
        effect(() => { runs++; map.get('a'); });
        map.set('a', item);
        await flush();
        expect(runs).toBe(2);
        map.set('a', item);
        await flush();
        expect(runs).toBe(2);
    });
});
