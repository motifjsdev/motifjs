/**
 * @jest-environment jsdom
 */
import { Component, asReadonly, effect, isReadonly, reactive } from '@motifx/core';

const flush = () => new Promise((r) => setTimeout(r, 0));

function rejects(fn: () => unknown, action: string) {
    let caught: any;
    try { fn(); } catch (error) { caught = error; }
    expect(caught?.name).toBe('MotifError');
    expect(caught?.code).toBe('MJX212');
    expect(String(caught?.message)).toContain(action);
}

describe('asReadonly', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('one object has one view, and only views are read-only', () => {
        const raw = { a: 1 };
        const state = reactive(raw);
        const view = asReadonly(state);
        expect(asReadonly(raw)).toBe(view);
        expect(asReadonly(view)).toBe(view);
        expect(reactive(view as any)).toBe(view);
        expect([isReadonly(view), isReadonly(state), isReadonly(raw)]).toEqual([true, false, false]);
    });

    test('reads through the view follow changes made through the reactive object', async () => {
        const state = reactive({ total: 1, items: [1, 2], tags: new Map([['a', 1]]), picked: new Set([1]) });
        const view = asReadonly(state);
        const seen: string[] = [];
        effect(() => { seen.push(`${view.total}|${view.items.join(',')}|${view.tags.get('b') ?? '-'}|${view.picked.has(2)}`); });
        state.total = 2;
        state.items.push(3);
        state.tags.set('b', 2);
        state.picked.add(2);
        await flush();
        expect(seen).toEqual(['1|1,2|-|false', '2|1,2,3|2|true']);
    });

    test('what a view hands out is read-only too', () => {
        const view = asReadonly(reactive({ user: { name: 'a' }, list: [{ id: 1 }], byId: new Map([[1, { id: 1 }]]), set: new Set([{ id: 2 }]) }));
        expect(isReadonly(view.user)).toBe(true);
        expect(isReadonly(view.list)).toBe(true);
        expect(isReadonly(view.list[0])).toBe(true);
        expect(isReadonly(view.byId.get(1))).toBe(true);
        expect(isReadonly([...view.set][0])).toBe(true);
        expect(view.list.filter(() => true).every((item) => isReadonly(item))).toBe(true);
        expect(isReadonly(view.list.find(() => true))).toBe(true);
    });

    test('every way of changing data through a view is refused and the data stays as it was', () => {
        const raw = { total: 1, user: { name: 'a' }, list: [3, 1, 2], byId: new Map([[1, 'x']]), set: new Set([1]) };
        const view: any = asReadonly(reactive(raw));
        rejects(() => { view.total = 2; }, 'write "total"');
        rejects(() => { view.extra = 1; }, 'write "extra"');
        rejects(() => { delete view.total; }, 'delete "total"');
        rejects(() => { view.user.name = 'b'; }, 'write "name"');
        rejects(() => view.list.push(4), 'push()');
        rejects(() => view.list.splice(0, 1), 'splice()');
        rejects(() => view.list.sort(), 'sort()');
        rejects(() => view.list.reverse(), 'reverse()');
        rejects(() => { view.list[0] = 9; }, 'write "0"');
        rejects(() => { view.list.length = 0; }, 'write "length"');
        rejects(() => view.byId.set(2, 'y'), 'set()');
        rejects(() => view.byId.delete(1), 'delete()');
        rejects(() => view.byId.clear(), 'clear()');
        rejects(() => view.set.add(2), 'add()');
        expect(raw).toEqual({ total: 1, user: { name: 'a' }, list: [3, 1, 2], byId: new Map([[1, 'x']]), set: new Set([1]) });
        expect('extra' in raw).toBe(false);
    });

    test('array reading methods work on a view and are followed', async () => {
        const state = reactive({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
        const view = asReadonly(state);
        let ids = '';
        let total = 0;
        effect(() => {
            ids = view.items.map((x) => x.id).join(',');
            total = view.items.reduce((sum, x) => sum + x.id, 0);
        });
        expect(view.items.indexOf(view.items[1])).toBe(1);
        expect(view.items.includes(view.items[2])).toBe(true);
        expect([...view.items].length).toBe(3);
        state.items.splice(0, 1);
        await flush();
        expect(ids).toBe('2,3');
        expect(total).toBe(5);
    });

    test('a list bound to a view keeps the rows of the items it still has', async () => {
        const host = document.body.appendChild(document.createElement('ul'));
        const root = new Component(host as any);
        root.build();
        const state = reactive({ items: [{ id: 1 }, { id: 2 }] });
        const view = asReadonly(state);
        root.bindings.list(() => view.items, (item: any) => {
            const row = new Component('li');
            (row.element as unknown as HTMLElement).textContent = String(item.id);
            return row;
        });
        await flush();
        const first = host.querySelector('li');
        state.items.push({ id: 3 });
        await flush();
        expect(Array.from(host.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['1', '2', '3']);
        expect(host.querySelector('li')).toBe(first);
        root.dispose();
    });

    test('a frozen object is handed back as it is', () => {
        const frozen = Object.freeze({ a: 1 });
        expect(asReadonly(frozen)).toBe(frozen);
        expect(asReadonly(5 as any)).toBe(5);
    });
});
