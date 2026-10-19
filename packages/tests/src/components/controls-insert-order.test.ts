/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';

function mount(host: ComponentBase = new Component<HTMLDivElement>('div')) {
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    return host;
}

const item = (name: string) => {
    const c = new Component('li');
    (c.element as unknown as HTMLElement).id = name;
    return c;
};

const ids = (list: ComponentBase[]) => list.map(x => (x.element as unknown as HTMLElement).id).join(',');
const listOrder = (c: ComponentBase) => ids(c.controls.items);
const domOrder = (c: ComponentBase) => Array.from((c.element as unknown as HTMLElement).children).map(e => e.id).join(',');

function setup(names: string, built = true) {
    const host = new Component<HTMLDivElement>('div');
    host.controls.add(...names.split('').map(item));
    return built ? mount(host) : host;
}

describe('controls.insert with several children', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('places the children at the index in the order they are given', () => {
        const host = setup('cab');
        const d = item('d'), e = item('e');
        const added = host.controls.insert(2, d, e);
        expect(listOrder(host)).toBe('c,a,d,e,b');
        expect(domOrder(host)).toBe('c,a,d,e,b');
        expect(added.length).toBe(2);
        expect(added[0]).toBe(d);
        expect(added[1]).toBe(e);
    });

    it('add(index, ...) places them the same way', () => {
        const host = setup('cab');
        host.controls.add(0, item('d'), item('e'), item('f'));
        expect(listOrder(host)).toBe('d,e,f,c,a,b');
        expect(domOrder(host)).toBe('d,e,f,c,a,b');
    });

    it('keeps the order of a flattened array', () => {
        const host = setup('cab');
        host.controls.insert(1, [item('d'), item('e')] as any);
        expect(listOrder(host)).toBe('c,d,e,a,b');
        expect(domOrder(host)).toBe('c,d,e,a,b');
    });

    it('keeps the order when the index is past the end', () => {
        const host = setup('cab');
        host.controls.insert(4, item('d'), item('e'), item('f'));
        expect(listOrder(host)).toBe('c,a,b,d,e,f');
        expect(domOrder(host)).toBe('c,a,b,d,e,f');
    });

    it('keeps the order when the parent is built afterwards', () => {
        const host = setup('cab', false);
        host.controls.insert(2, item('d'), item('e'));
        mount(host);
        expect(listOrder(host)).toBe('c,a,d,e,b');
        expect(domOrder(host)).toBe('c,a,d,e,b');
    });

    it('moves children from another parent in the order they are given', () => {
        const host = setup('cab');
        const other = setup('de');
        const [d, e] = other.controls.items;
        host.controls.insert(1, d, e);
        expect(listOrder(host)).toBe('c,d,e,a,b');
        expect(domOrder(host)).toBe('c,d,e,a,b');
        expect(other.controls.length).toBe(0);
        expect(domOrder(other)).toBe('');
    });

    it('moves children of the same parent forward as a group in the order given', () => {
        const host = setup('abcde');
        const [, , , d, e] = host.controls.items;
        host.controls.insert(1, d, e);
        expect(listOrder(host)).toBe('a,d,e,b,c');
        expect(domOrder(host)).toBe('a,d,e,b,c');
    });

    it('moves children of the same parent back as a group in the order given', () => {
        const host = setup('abcdef');
        const [a, b, c] = host.controls.items;
        host.controls.insert(4, a, b, c);
        expect(listOrder(host)).toBe('d,e,a,b,c,f');
        expect(domOrder(host)).toBe('d,e,a,b,c,f');
    });

    it('keeps the order inside a fragment parent', () => {
        const root = mount();
        const frag = new Component();
        frag.controls.add(item('c'), item('a'), item('b'));
        root.controls.add(frag, item('z'));
        frag.controls.insert(1, item('d'), item('e'));
        frag.controls.insert(5, item('f'), item('g'));
        expect(listOrder(frag)).toBe('c,d,e,a,b,f,g');
        expect(domOrder(root)).toBe('c,d,e,a,b,f,g,z');
    });

    it('keeps text values in the order they are given', () => {
        const host = mount();
        host.controls.add('!' as any);
        host.controls.add(0, 'Total: ' as any, 42 as any);
        expect((host.element as unknown as HTMLElement).textContent).toBe('Total: 42!');
    });

    it('leaves single child inserts and appends as they are', () => {
        const host = setup('cab');
        host.controls.insert(1, item('d'));
        host.controls.insert(2, item('e'));
        host.controls.insert(-1, item('f'), item('g'));
        host.controls.insert(undefined, item('h'), item('i'));
        host.controls.add(item('j'), item('k'));
        expect(listOrder(host)).toBe('c,d,e,a,b,f,g,h,i,j,k');
        expect(domOrder(host)).toBe('c,d,e,a,b,f,g,h,i,j,k');
    });
});
