import { Component, ComponentBase, reactive, effect } from '@motifx/core';
import { debugGetDeps } from '@motifx/core/devtools';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function host() {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    return { root, el };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('lists that start empty and get their first entry', () => {
    test('the children list keeps its identity, order and array behaviour', () => {
        const { root, el } = host();
        const box = new Component('div');
        root.controls.add(box);
        const items = box.controls.items;
        const a = new Component('i'), b = new Component('b'), c = new Component('u');
        box.controls.add(a);
        expect(box.controls.items).toBe(items);
        expect(items.length).toBe(1);
        expect(Array.isArray(items)).toBe(true);
        expect(0 in items).toBe(true);
        box.controls.add(b);
        box.controls.insert(0, c);
        expect(box.controls.items).toBe(items);
        expect(items.map(x => (x.element as Element).tagName)).toEqual(['U', 'I', 'B']);
        expect(items.indexOf(a)).toBe(1);
        expect([...items].length).toBe(3);
        expect(Object.keys(items)).toEqual(['0', '1', '2']);
        expect(el.innerHTML).toBe('<div><u></u><i></i><b></b></div>');
        root.dispose();
    });

    test('emptying the children list and adding again works the same', () => {
        const { root, el } = host();
        const box = new Component('div');
        root.controls.add(box);
        const items = box.controls.items;
        const a = new Component('i');
        box.controls.add(a);
        box.controls.silentUnlink(a);
        expect(items.length).toBe(0);
        const b = new Component('b');
        box.controls.add(b);
        expect(box.controls.items).toBe(items);
        expect(items).toEqual([b]);
        expect(el.querySelector('b')).not.toBeNull();
        root.dispose();
    });

    test('the bindings list keeps its identity and order', async () => {
        const state = reactive({ t: 'x', on: true });
        const { root, el } = host();
        const c = new Component('p');
        root.controls.add(c);
        const list = (c.bindings as any)._items;
        c.bindings.html(() => state.t);
        c.bindings.display(() => state.on);
        expect(c.bindings.items.length).toBe(2);
        expect(c.bindings.items[0].propertyName).not.toBe(c.bindings.items[1].propertyName);
        expect((c as any)._bindings._items).toBe(list);
        expect(c.bindings.items.map(b => b.propertyName)).toEqual(['innerHTML', 'isWait']);
        state.t = 'y';
        await settle();
        expect(el.textContent).toBe('y');
        root.dispose();
    });

    test('an effect with one dependency tracks it and lets it go', async () => {
        const state = reactive({ v: 1 });
        const seen: number[] = [];
        const stop = effect(() => { seen.push(state.v); });
        expect(debugGetDeps(state)!.get('v')!.size).toBe(1);
        state.v = 2;
        await settle();
        expect(seen).toEqual([1, 2]);
        stop();
        expect(debugGetDeps(state)).toBeUndefined();
    });
});
