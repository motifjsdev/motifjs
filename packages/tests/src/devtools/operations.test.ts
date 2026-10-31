/**
 * @jest-environment jsdom
 */
import { Application, reactive, effect, createSignal } from '@motifx/core';
import { runOperation, startOperation, resumeOperation, endOperation, currentOperation, onWrite } from '@motifx/core/devtools';

const settle = () => new Promise(r => setTimeout(r, 0));

class Cart { total = 1; name = 'a'; }

describe('devtools operations', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    const offs: (() => void)[] = [];

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
    });

    afterEach(async () => {
        for (const off of offs.splice(0)) off();
        app.useDevelopment(false);
        await app.dispose();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    const events = (prefix: string) => {
        const list: any[] = [];
        offs.push(hook().on((ev: any) => { if (ev.type.startsWith(prefix)) list.push(ev); }));
        return list;
    };

    const writes = () => {
        const list: any[] = [];
        offs.push(onWrite(w => { list.push(w); }));
        return list;
    };

    test('runOperation is current only while it runs and records the operation it started in', () => {
        let inner: any = null;
        const outer = runOperation({ kind: 'event', name: 'click' }, () => {
            const self = currentOperation()!;
            runOperation({ kind: 'navigation', name: '/settings' }, () => { inner = currentOperation(); });
            expect(currentOperation()).toBe(self);
            return self;
        });
        expect(currentOperation()).toBeNull();
        expect(outer).toEqual({ kind: 'event', name: 'click', data: undefined, id: outer.id });
        expect(inner).toEqual({ kind: 'navigation', name: '/settings', data: undefined, id: inner.id, parent: outer.id });
    });

    test('only kind, name and data are taken from the info', () => {
        const operation = startOperation({ kind: 'action', parent: 99, id: 5, extra: true } as any);
        expect(operation).toEqual({ kind: 'action', name: undefined, data: undefined, id: operation.id });
        expect(operation.id).not.toBe(5);
    });

    test('a throwing operation puts the previous one back, rethrows and ends with its error', () => {
        const list = events('operation:');
        expect(() => runOperation({ kind: 'action', name: 'save' }, () => { throw new Error('nope'); })).toThrow('nope');
        expect(currentOperation()).toBeNull();
        expect(list.map(e => e.type)).toEqual(['operation:started', 'operation:finished']);
        expect(list[1].payload).toMatchObject({ id: list[0].payload.id, error: 'nope' });
    });

    test('an async operation ends when its promise settles and gives the same value', async () => {
        const list = events('operation:finished');
        let release!: (value: number) => void;
        const done = runOperation({ kind: 'action', name: 'load' }, () => new Promise<number>(r => { release = r; }));
        await settle();
        expect(list).toEqual([]);
        release(5);
        expect(await done).toBe(5);
        expect(list.length).toBe(1);
        expect(list[0].payload.error).toBeUndefined();
    });

    test('an async operation that rejects ends with the error and rejects the same way', async () => {
        const list = events('operation:finished');
        const done = runOperation({ kind: 'action', name: 'load' }, async () => { throw new Error('offline'); });
        await expect(done).rejects.toThrow('offline');
        expect(list[0].payload.error).toBe('offline');
    });

    test('a thenable that is not a Promise ends the operation too', () => {
        const list = events('operation:finished');
        runOperation({ kind: 'action' }, () => ({ then(onDone: (v: number) => void) { onDone(3); } }));
        expect(list.length).toBe(1);
    });

    test('while devtools are off the function result is returned as it is and nothing is sent', () => {
        const list = events('operation:');
        const seen = writes();
        const s = reactive(new Cart());
        app.useDevelopment(false);
        const promise = Promise.resolve(1);
        expect(runOperation({ kind: 'action' }, () => promise)).toBe(promise);
        runOperation({ kind: 'action' }, () => { s.total = 2; });
        expect(list).toEqual([]);
        expect(seen).toEqual([]);
    });

    test('a started operation can be resumed several times and ends once', () => {
        const list = events('operation:');
        const seen = writes();
        const s = reactive(new Cart());
        const operation = startOperation({ kind: 'action', name: 'chat/send' });
        expect(currentOperation()).toBeNull();
        resumeOperation(operation, () => { s.total = 2; });
        resumeOperation(operation, () => { s.name = 'b'; });
        endOperation(operation);
        endOperation(operation);
        expect(seen.map(w => w.operationId)).toEqual([operation.id, operation.id]);
        expect(list.map(e => e.type)).toEqual(['operation:started', 'operation:finished']);
    });

    test('resuming an ended operation warns once and keeps recording under it', () => {
        const warnings = events('warning');
        const seen = writes();
        const s = reactive(new Cart());
        const operation = startOperation({ kind: 'action', name: 'late' });
        endOperation(operation);
        resumeOperation(operation, () => { s.total = 2; });
        resumeOperation(operation, () => { s.total = 3; });
        expect(seen.map(w => w.operationId)).toEqual([operation.id, operation.id]);
        expect(warnings.filter(w => w.payload.code === 'MJX211').length).toBe(1);
    });

    test('resumeOperation brings an operation back after await', async () => {
        const seen = writes();
        const s = reactive(new Cart());
        let id = 0;
        await runOperation({ kind: 'action', name: 'load' }, async () => {
            const operation = currentOperation()!;
            id = operation.id;
            await settle();
            resumeOperation(operation, () => { s.total = 5; });
        });
        expect(seen[0].operationId).toBe(id);
    });

    test('a flush has an id and lists the operations whose writes it carried', async () => {
        const flushes = events('reactivity:flush');
        const s = reactive(new Cart());
        const stop = effect(() => s.total + s.name.length);
        const operation = runOperation({ kind: 'action', name: 'add' }, () => { s.total = 2; return currentOperation()!; });
        await settle();
        s.name = 'bb';
        await settle();
        stop();
        const first = flushes.find(f => f.payload.triggers.some((t: any) => t.key === 'total'))!.payload;
        const second = flushes.find(f => f.payload.triggers.some((t: any) => t.key === 'name'))!.payload;
        expect(second.id).toBeGreaterThan(first.id);
        expect(first.operations).toEqual([operation.id]);
        expect(first.triggers.find((t: any) => t.key === 'total').operationId).toBe(operation.id);
        expect(second.operations).toEqual([]);
    });
});

describe('devtools writes', () => {
    let app: Application;
    const offs: (() => void)[] = [];

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
    });

    afterEach(async () => {
        for (const off of offs.splice(0)) off();
        app.useDevelopment(false);
        await app.dispose();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    const writes = () => {
        const list: any[] = [];
        offs.push(onWrite(w => { list.push(w); }));
        return list;
    };

    test('object writes are add, update and delete, a write that changes nothing is skipped', () => {
        const s = reactive<any>(new Cart());
        const seen = writes();
        s.total = 2;
        s.total = 2;
        s.extra = true;
        delete s.extra;
        expect(seen).toEqual([
            { target: expect.any(Cart), kind: 'update', key: 'total', previous: 1, value: 2 },
            { target: expect.any(Cart), kind: 'add', key: 'extra', value: true },
            { target: expect.any(Cart), kind: 'delete', key: 'extra', previous: true }
        ]);
    });

    test('a getter is never called to read the old value of a deleted key', () => {
        let calls = 0;
        const s = reactive<any>({ get total() { calls++; return 1; } });
        const seen = writes();
        delete s.total;
        expect(calls).toBe(0);
        expect(seen[0]).toMatchObject({ kind: 'delete', key: 'total', previous: undefined });
    });

    test('array methods are one splice each, with the index and the items they removed and added', () => {
        const s = reactive({ items: [1, 2, 3, 4, 5] });
        const seen = writes();
        s.items.push(6, 7);
        s.items.pop();
        s.items.shift();
        s.items.unshift(0);
        s.items.splice(-2, 1, 9, 9);
        s.items.splice(1);
        expect(seen.map(w => [w.kind, w.method, w.index, w.removed, w.added])).toEqual([
            ['splice', 'push', 5, [], [6, 7]],
            ['splice', 'pop', 6, [7], []],
            ['splice', 'shift', 0, [1], []],
            ['splice', 'unshift', 0, [], [0]],
            ['splice', 'splice', 4, [5], [9, 9]],
            ['splice', 'splice', 1, [2, 3, 4, 9, 9, 6], []]
        ]);
    });

    test('sort and reverse report the order before and after, and nothing when the order stays', () => {
        const s = reactive({ items: [3, 1, 2] });
        const seen = writes();
        s.items.sort();
        s.items.sort();
        s.items.reverse();
        expect(seen.map(w => [w.method, w.removed, w.added])).toEqual([
            ['sort', [3, 1, 2], [1, 2, 3]],
            ['reverse', [1, 2, 3], [3, 2, 1]]
        ]);
    });

    test('a shorter length reports the cut items, a longer one is an update, an index past the end is an add', () => {
        const s = reactive({ items: [1, 2, 3] });
        const seen = writes();
        s.items.length = 1;
        s.items.length = 2;
        s.items[2] = 8;
        s.items[0] = 7;
        expect(seen.map(w => [w.kind, w.method ?? w.key])).toEqual([['splice', 'length'], ['update', 'length'], ['add', '2'], ['update', '0']]);
        expect(seen[0]).toMatchObject({ index: 1, removed: [2, 3], added: [] });
        expect(seen[1]).toMatchObject({ previous: 1, value: 2 });
    });

    test('Map and Set changes are reported, clear with what it removed', () => {
        const s = reactive({ map: new Map<string, number>([['a', 1]]), set: new Set<string>(['x']) });
        const seen = writes();
        s.map.set('a', 2);
        s.map.set('a', 2);
        s.map.set('b', 3);
        s.map.delete('a');
        s.set.add('y');
        s.set.delete('x');
        s.map.clear();
        expect(seen.map(w => [w.kind, w.key])).toEqual([['update', 'a'], ['add', 'b'], ['delete', 'a'], ['add', 'y'], ['delete', 'x'], ['clear', undefined]]);
        expect(seen[0]).toMatchObject({ previous: 1, value: 2 });
        expect(seen[2].previous).toBe(2);
        expect(seen[5].removed).toEqual([['b', 3]]);
    });

    test('signal writes are an update of value and a mutate', () => {
        const count = createSignal(1);
        const list = createSignal<number[]>([]);
        const seen = writes();
        count.value = 2;
        count.value = 2;
        list.mutate(items => { items.push(1); });
        expect(seen).toEqual([
            { target: count, kind: 'update', key: 'value', previous: 1, value: 2 },
            { target: list, kind: 'mutate' }
        ]);
    });

    test('a listener that throws or writes breaks neither the write nor feeds itself, and can stop', () => {
        const s = reactive(new Cart());
        const log = reactive({ entries: [] as string[] });
        offs.push(onWrite(() => { throw new Error('bad'); }));
        const seen = writes();
        const stop = onWrite(w => { log.entries.push(String((w as any).key)); });
        s.total = 2;
        stop();
        s.total = 3;
        expect(s.total).toBe(3);
        expect(seen.length).toBe(2);
        expect(log.entries).toEqual(['total']);
    });
});
