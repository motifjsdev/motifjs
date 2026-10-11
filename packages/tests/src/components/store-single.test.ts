import { DisposableStore } from '@motifx/core';

const item = (log: string[], name: string, onDispose?: () => void) => ({ dispose: () => { log.push(name); onDispose?.(); } });

describe('a disposable store', () => {
    test('one item is disposed once on clear and on dispose', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        const a = item(log, 'a');
        s.add(a);
        s.add(a);
        s.clear();
        expect(log).toEqual(['a']);
        s.clear();
        expect(log).toEqual(['a']);
        s.add(a);
        s.dispose();
        expect(log).toEqual(['a', 'a']);
        expect(s.isDisposed).toBe(true);
    });

    test('items are disposed in the order they were added, duplicates once', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        const a = item(log, 'a'), b = item(log, 'b'), c = item(log, 'c');
        s.add(a); s.add(b); s.add(a); s.add(c);
        s.dispose();
        expect(log).toEqual(['a', 'b', 'c']);
    });

    test('delete disposes the item even when it is not in the store', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        const a = item(log, 'a'), b = item(log, 'b');
        s.add(a);
        s.delete(b);
        s.delete(a);
        expect(log).toEqual(['b', 'a']);
        s.dispose();
        expect(log).toEqual(['b', 'a']);
    });

    test('detach takes an item out without disposing it', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        const a = item(log, 'a'), b = item(log, 'b');
        s.add(a);
        s.detach(a);
        s.detach(b);
        s.add(b);
        s.add(a);
        s.detach(b);
        s.dispose();
        expect(log).toEqual(['a']);
    });

    test('an item added while the only item is cleared is disposed in the same clear', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        const late = item(log, 'late');
        s.add(item(log, 'first', () => s.add(late)));
        s.clear();
        expect(log).toEqual(['first', 'late']);
        s.clear();
        expect(log).toEqual(['first', 'late']);
    });

    test('an item added while several items are cleared is disposed in the same clear', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        const late = item(log, 'late');
        s.add(item(log, 'a', () => s.add(late)));
        s.add(item(log, 'b'));
        s.clear();
        expect(log).toEqual(['a', 'b', 'late']);
    });

    test('an item that replaces itself while it is cleared leaves its replacement disposed too', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        const next = item(log, 'next');
        const first: any = { dispose: () => { log.push('first'); s.detach(first); s.add(next); } };
        s.add(first);
        s.clear();
        expect(log).toEqual(['first', 'next']);
        s.clear();
        expect(log).toEqual(['first', 'next']);
    });

    test('adding to a closed store warns and does not keep the item', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        s.dispose();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        try { s.add(item(log, 'x')); } finally { warn.mockRestore(); }
        s.clear();
        expect(log).toEqual([]);
    });

    test('a failing item does not stop the others and its error is thrown after', () => {
        const log: string[] = [];
        const s = new DisposableStore();
        s.add({ dispose: () => { log.push('bad'); throw new Error('boom'); } });
        s.add(item(log, 'good'));
        expect(() => s.clear()).toThrow('boom');
        expect(log).toEqual(['bad', 'good']);
        const one = new DisposableStore();
        one.add({ dispose: () => { throw new Error('alone'); } });
        expect(() => one.clear()).toThrow('alone');
    });
});
