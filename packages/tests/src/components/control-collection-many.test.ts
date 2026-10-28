/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';

const li = (id: string) => {
    const c = new Component('li');
    (c.element as unknown as HTMLElement).id = id;
    return c;
};
const ids = (list: ComponentBase[]) => list.map((x) => (x.element as unknown as HTMLElement).id).join(',');
const domIds = (owner: ComponentBase) => Array.from((owner.element as unknown as HTMLElement).children).map((e) => e.id).join(',');

function built(tag = 'ul') {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    const owner = new Component(tag);
    root.controls.add(owner);
    return owner;
}

describe('controls.add and insert with many children', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a hundred thousand children given as one array are added in order', () => {
        const owner = built();
        const kids = Array.from({ length: 100000 }, (_, i) => li('k' + i));
        const added = owner.controls.add(kids as any);
        expect(added.length).toBe(100000);
        expect(owner.controls.length).toBe(100000);
        const el = owner.element as unknown as HTMLElement;
        expect(el.children.length).toBe(100000);
        expect(el.children[0].id).toBe('k0');
        expect(el.children[99999].id).toBe('k99999');
    });

    test('sixty thousand children spread into add are added in order', () => {
        const owner = built();
        const kids = Array.from({ length: 60000 }, (_, i) => li('k' + i));
        const added = owner.controls.add(...kids);
        expect(added.length).toBe(60000);
        expect((owner.element as unknown as HTMLElement).children[59999].id).toBe('k59999');
    });

    test('nesting is opened the same way: add two levels, insert one level', () => {
        const owner = built();
        const a = li('a'), b = li('b'), c = li('c'), d = li('d'), e = li('e');
        const added = owner.controls.add([a, [b]] as any, c);
        expect(ids(added)).toBe('a,b,c');
        const atIndex = owner.controls.add(1, [d] as any, [[e]] as any);
        expect(ids(atIndex)).toBe('d,e');
        expect(domIds(owner)).toBe('a,d,e,b,c');
        const f = li('f'), g = li('g');
        const inserted = owner.controls.insert(0, f, [g] as any);
        expect(ids(inserted)).toBe('f,g');
        expect(domIds(owner)).toBe('f,g,a,d,e,b,c');
    });

    test('empty, null and disposed entries are skipped as before', async () => {
        const owner = built();
        const gone = li('gone');
        await gone.dispose();
        expect(gone.isDisposed).toBe(true);
        const a = li('a');
        const added = owner.controls.add([null, a, undefined] as any, gone, [] as any);
        expect(ids(added)).toBe('a');
        expect(domIds(owner)).toBe('a');
    });
});
