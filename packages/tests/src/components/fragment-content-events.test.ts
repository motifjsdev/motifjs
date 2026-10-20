/**
 * @jest-environment jsdom
 */
import { Component } from '@motifx/core';

function mount(...children: any[]) {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    for (const c of children) root.controls.add(c);
    return root;
}

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));
const click = (el: any) => (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const enter = (el: any) => (el as HTMLElement).dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));

afterEach(() => { document.body.innerHTML = ''; });

describe('a DOM listener on a component without an element listens on its whole content', () => {
    test('a click inside any top-level child fires the handler with the fragment as sender', async () => {
        const frag = new Component();
        const a = new Component('button');
        const b = new Component('span');
        frag.controls.add(a, b);
        const root = mount(frag);
        await settle();
        const seen: any[] = [];
        await frag.motif.on('click', (sender: any, _e: any) => seen.push(sender));
        click(a.element);
        click(b.element);
        expect(seen.length).toBe(2);
        expect(seen[0]).toBe(frag);
        expect(seen[1]).toBe(frag);
        expect(frag.motif.options.hasEvent('click')).toBe(true);
        root.dispose();
    });

    test('a child added later is covered, a child detached is released', async () => {
        const frag = new Component();
        const first = new Component('button');
        frag.controls.add(first);
        const root = mount(frag);
        await settle();
        const log: string[] = [];
        await frag.motif.on('click', () => log.push('frag'));
        const later = new Component('button');
        frag.controls.add(later);
        await settle();
        click(later.element);
        expect(log).toEqual(['frag']);

        const other = new Component('div');
        root.controls.add(other);
        await settle();
        other.controls.add(later);
        await settle();
        click(later.element);
        expect(log).toEqual(['frag']);
        root.dispose();
    });

    test('a nested fragment is part of the content: one call per event', async () => {
        const outer = new Component();
        const inner = new Component();
        const button = new Component('button');
        inner.controls.add(button);
        outer.controls.add(inner);
        const root = mount(outer);
        await settle();
        const log: string[] = [];
        await outer.motif.on('click', () => log.push('outer'));
        click(button.element);
        expect(log).toEqual(['outer']);
        const added = new Component('i');
        inner.controls.add(added);
        await settle();
        click(added.element);
        expect(log).toEqual(['outer', 'outer']);
        root.dispose();
    });

    test(':self means the target is one of the content elements itself', async () => {
        const frag = new Component();
        const box = new Component('div');
        const deep = new Component('b');
        box.controls.add(deep);
        frag.controls.add(box);
        const root = mount(frag);
        await settle();
        const log: string[] = [];
        await frag.motif.on('click:self' as any, () => log.push('self'));
        click(deep.element);
        expect(log).toEqual([]);
        click(box.element);
        expect(log).toEqual(['self']);
        root.dispose();
    });

    test(':once runs one time across the whole content and hasEvent turns false', async () => {
        const frag = new Component();
        const a = new Component('button');
        const b = new Component('button');
        frag.controls.add(a, b);
        const root = mount(frag);
        await settle();
        const log: string[] = [];
        await frag.motif.on('click:once', () => log.push('once'));
        click(a.element);
        click(b.element);
        click(a.element);
        expect(log).toEqual(['once']);
        expect(frag.motif.options.hasEvent('click:once')).toBe(false);
        root.dispose();
    });

    test('off releases the handler from every content element', async () => {
        const frag = new Component();
        const a = new Component('button');
        const b = new Component('button');
        frag.controls.add(a, b);
        const root = mount(frag);
        await settle();
        const log: string[] = [];
        const fn = () => log.push('x');
        await frag.motif.on('click', fn);
        await frag.motif.off('click', fn);
        click(a.element);
        click(b.element);
        expect(log).toEqual([]);
        expect(frag.motif.options.hasEvent('click')).toBe(false);
        root.dispose();
    });

    test('a listener registered before any child exists starts working when content arrives', async () => {
        const frag = new Component();
        const root = mount(frag);
        await settle();
        const log: string[] = [];
        await frag.motif.on('click', () => log.push('late'));
        const child = new Component('button');
        frag.controls.add(child);
        await settle();
        click(child.element);
        expect(log).toEqual(['late']);
        root.dispose();
    });

    test('a non-bubbling event such as mouseenter reaches the handler through each content element', async () => {
        const frag = new Component();
        const a = new Component('div');
        const b = new Component('div');
        frag.controls.add(a, b);
        const root = mount(frag);
        await settle();
        const log: string[] = [];
        await frag.motif.on('mouseenter', () => log.push('enter'));
        enter(a.element);
        enter(b.element);
        expect(log).toEqual(['enter', 'enter']);
        root.dispose();
    });

    test('trigger still calls the handler once, without touching the content elements', async () => {
        const frag = new Component();
        const a = new Component('button');
        frag.controls.add(a);
        const root = mount(frag);
        await settle();
        const log: any[] = [];
        await frag.motif.on('click', (_s: any, e: any) => log.push(e.id));
        await frag.motif.trigger('click', { id: 7 });
        expect(log).toEqual([7]);
        root.dispose();
    });

    test('dispose releases the content listeners', async () => {
        const frag = new Component();
        const a = new Component('button');
        frag.controls.add(a);
        const root = mount(frag);
        await settle();
        const log: string[] = [];
        await frag.motif.on('click', () => log.push('x'));
        const el = a.element as HTMLElement;
        await frag.dispose();
        click(el);
        expect(log).toEqual([]);
        root.dispose();
    });
});
