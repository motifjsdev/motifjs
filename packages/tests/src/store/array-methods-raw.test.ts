import { types } from 'node:util';
import { effect, reactive } from '@motifx/core';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('structural array methods run on the raw array', () => {
    test('return values are the same as before: reactive items, the proxy itself, the new length', () => {
        const raw = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        const list = reactive(raw);
        const last = list.pop()!;
        expect(types.isProxy(last)).toBe(true);
        expect(last.id).toBe(4);
        const first = list.shift()!;
        expect(types.isProxy(first)).toBe(true);
        expect(first.id).toBe(1);
        const removed = list.splice(0, 1);
        expect(removed.map((x) => types.isProxy(x))).toEqual([true]);
        expect(list.push({ id: 5 })).toBe(2);
        expect(list.unshift({ id: 0 })).toBe(3);
        expect(list.reverse()).toBe(list);
        expect(list.sort((a, b) => a.id - b.id)).toBe(list);
    });

    test('items added through push, unshift and splice are stored raw', () => {
        const raw: Array<{ id: number }> = [];
        const list = reactive(raw);
        const a = reactive({ id: 1 });
        const b = reactive({ id: 2 });
        const c = reactive({ id: 3 });
        list.push(a);
        list.unshift(b);
        list.splice(1, 0, c);
        expect(raw.map((x) => types.isProxy(x))).toEqual([false, false, false]);
        expect(list[0]).toBe(b);
        expect(list[1]).toBe(c);
        expect(list[2]).toBe(a);
    });

    test('the sort comparator receives the same reactive items the list hands out', () => {
        const list = reactive([{ id: 2 }, { id: 1 }, { id: 3 }]);
        const handed = new Set([list[0], list[1], list[2]]);
        let foreign = 0;
        list.sort((x, y) => { if (!handed.has(x) || !handed.has(y)) foreign++; return x.id - y.id; });
        expect(foreign).toBe(0);
        expect(list.map((x) => x.id)).toEqual([1, 2, 3]);
    });

    test('only the readers of indices that changed run again', async () => {
        const list = reactive([10, 20, 30, 40]);
        const runs = [0, 0, 0, 0];
        let length = 0;
        [0, 1, 2, 3].forEach((i) => effect(() => { runs[i]++; list[i]; }));
        effect(() => { length++; list.length; });
        list.splice(3, 1);
        await flush();
        expect(runs).toEqual([1, 1, 1, 2]);
        expect(length).toBe(2);
        list.splice(1, 1, 20);
        await flush();
        expect(runs).toEqual([1, 1, 1, 2]);
        expect(length).toBe(2);
        list.shift();
        await flush();
        expect(runs).toEqual([2, 2, 2, 2]);
        expect(length).toBe(3);
    });

    test('a hole moved by reverse reaches the reader of that index, and length readers stay quiet', async () => {
        const raw = [1, , 3] as (number | undefined)[];
        raw.length = 4;
        const list = reactive(raw);
        let seen: unknown = 'none';
        let present = false;
        let lengthRuns = 0;
        effect(() => { seen = list[2]; present = 2 in list; });
        effect(() => { lengthRuns++; list.length; });
        list.reverse();
        await flush();
        expect(2 in raw).toBe(false);
        expect(present).toBe(false);
        expect(seen).toBe(undefined);
        expect(lengthRuns).toBe(1);
    });

    test('an array subclass that overrides push keeps its own push', async () => {
        class Log<T> extends Array<T> {
            pushes = 0;
            push(...items: T[]): number { this.pushes++; return super.push(...items); }
        }
        const raw = new Log<number>();
        const list = reactive(raw);
        let length = 0;
        effect(() => { length = list.length; });
        list.push(1);
        await flush();
        expect(raw.pushes).toBe(1);
        expect(length).toBe(1);
    });

    test('a comparator that throws leaves readers in step with the array', async () => {
        const raw = [3, 1, 2];
        const list = reactive(raw);
        const seen: unknown[] = [];
        [0, 1, 2].forEach((i) => effect(() => { seen[i] = list[i]; }));
        expect(() => list.sort(() => { throw new Error('stop'); })).toThrow('stop');
        await flush();
        expect(seen).toEqual(raw.slice());
    });
});
