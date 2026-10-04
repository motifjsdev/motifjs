import { Dictionary, List } from '@motifx/core';

describe('List', () => {
    test('remove of an item that is not in the list leaves the list unchanged', () => {
        const list = new List<string>();
        list.Add('a');
        list.Add('b');
        list.Add('c');
        expect(list.remove('zzz')).toEqual([]);
        expect(list.items).toEqual(['a', 'b', 'c']);
        expect(list.count).toBe(3);
    });

    test('remove returns the removed item and forgets it', () => {
        const list = new List<string>();
        list.Add('a');
        list.Add('b');
        expect(list.remove('a')).toEqual(['a']);
        expect(list.items).toEqual(['b']);
        expect(list.has('a')).toBe(false);
        expect(list.has('b')).toBe(true);
    });

    test('ReverseClone returns a reversed copy and keeps the list order', () => {
        const list = new List<number>();
        list.Add(1);
        list.Add(2);
        list.Add(3);
        const reversed = list.ReverseClone();
        expect(reversed).toEqual([3, 2, 1]);
        expect(list.items).toEqual([1, 2, 3]);
        reversed.push(9);
        expect(list.count).toBe(3);
    });
});

describe('Dictionary', () => {
    test('removeIndex is zero based', () => {
        const dict = new Dictionary<string, number>();
        dict.Add('a', 1);
        dict.Add('b', 2);
        dict.Add('c', 3);
        const removed = dict.removeIndex(0);
        expect(removed.map(p => p.Key)).toEqual(['a']);
        expect(dict.has('a')).toBe(false);
        expect(dict.values.items.map(p => p.Key)).toEqual(['b', 'c']);
        expect(dict.removeIndex(1).map(p => p.Key)).toEqual(['c']);
        expect(dict.values.items.map(p => p.Key)).toEqual(['b']);
    });

    test('remove of a missing key leaves the entries unchanged', () => {
        const dict = new Dictionary<string, number>();
        dict.Add('a', 1);
        dict.Add('b', 2);
        dict.remove('zzz');
        expect(dict.values.items.map(p => p.Key)).toEqual(['a', 'b']);
    });
});
