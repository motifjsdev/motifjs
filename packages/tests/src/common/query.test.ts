import { Query, reactive, createComputed } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

interface Person { name: string; city: string; age: number; }

const people: Person[] = [
    { name: 'Ali', city: 'Ankara', age: 34 },
    { name: 'Ayşe', city: 'İzmir', age: 28 },
    { name: 'Can', city: 'Ankara', age: 28 },
    { name: 'Deniz', city: 'Bursa', age: 41 },
];

describe('Query', () => {
    test('Array.prototype is not extended', () => {
        const keys: string[] = [];
        for (const k in [1, 2]) keys.push(k);
        expect(keys).toEqual(['0', '1']);
        expect((Array.prototype as any).where).toBeUndefined();
        expect((Array.prototype as any).firstOrDefault).toBeUndefined();
    });

    test('from and constructor accept any iterable', () => {
        expect(Query.from([1, 2, 3]).toArray()).toEqual([1, 2, 3]);
        expect(new Query(new Set(['a', 'b'])).toArray()).toEqual(['a', 'b']);
        expect(Query.from(new Map([[1, 'x']]).keys()).toArray()).toEqual([1]);
    });

    test('where and select chain and pass the index', () => {
        const result = Query.from(people)
            .where((p, i) => p.city === 'Ankara' && i >= 0)
            .select((p, i) => `${i}:${p.name}`)
            .toArray();
        expect(result).toEqual(['0:Ali', '1:Can']);
    });

    test('orderBy is stable for equal keys and does not mutate the source', () => {
        const source = [...people];
        const byAge = Query.from(source).orderBy(p => p.age).select(p => p.name).toArray();
        expect(byAge).toEqual(['Ayşe', 'Can', 'Ali', 'Deniz']);
        expect(source).toEqual(people);
    });

    test('orderByDescending is stable for equal keys', () => {
        const byAge = Query.from(people).orderByDescending(p => p.age).select(p => p.name).toArray();
        expect(byAge).toEqual(['Deniz', 'Ali', 'Ayşe', 'Can']);
    });

    test('distinctBy keeps the first occurrence', () => {
        expect(Query.from(people).distinctBy(p => p.age).select(p => p.name).toArray())
            .toEqual(['Ali', 'Ayşe', 'Deniz']);
    });

    test('groupBy preserves key order and is chainable', () => {
        const groups = Query.from(people).groupBy(p => p.city).toArray();
        expect(groups.map(g => g.key)).toEqual(['Ankara', 'İzmir', 'Bursa']);
        expect(groups[0].items.map(p => p.name)).toEqual(['Ali', 'Can']);

        const counts = Query.from(people)
            .groupBy(p => p.city)
            .where(g => g.items.length > 1)
            .select(g => `${g.key}=${g.items.length}`)
            .toArray();
        expect(counts).toEqual(['Ankara=2']);
    });

    test('first throws on empty sequence, firstOrDefault returns undefined', () => {
        expect(Query.from(people).first().name).toBe('Ali');
        expect(() => Query.from<number>([]).first()).toThrow('Sequence contains no elements');
        expect(Query.from<number>([]).firstOrDefault()).toBeUndefined();
    });

    test('any, all and aggregate', () => {
        const q = Query.from(people);
        expect(q.any()).toBe(true);
        expect(Query.from([]).any()).toBe(false);
        expect(q.any(p => p.age > 40)).toBe(true);
        expect(q.all(p => p.age > 20)).toBe(true);
        expect(q.all(p => p.age > 30)).toBe(false);
        expect(q.aggregate(0, (sum, p) => sum + p.age)).toBe(131);
    });

    test('is iterable and toArray returns a copy', () => {
        const source = [1, 2, 3];
        const q = Query.from(source);
        expect([...q]).toEqual([1, 2, 3]);
        const copy = q.toArray();
        copy.push(4);
        expect(source).toEqual([1, 2, 3]);
    });

    test('reads through a reactive array are tracked', async () => {
        const state = reactive({ items: [3, 1, 2] });
        const sorted = createComputed(() => Query.from(state.items).where(n => n > 1).orderBy(n => n).toArray());
        expect(sorted.value).toEqual([2, 3]);
        state.items.push(5);
        await nextTick();
        expect(sorted.value).toEqual([2, 3, 5]);
    });
});
