import { Component, ComponentBase, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function make(tag = 'div'): { c: ComponentBase; el: HTMLElement; root: ComponentBase } {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    const c = new Component(tag);
    root.controls.add(c);
    return { c, el: c.element as HTMLElement, root };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('static class names', () => {
    test('single names are written in order and a repeated name is not added twice', () => {
        const { c, el, root } = make();
        expect(c.class.add('a')).toBe(c);
        c.class.add('b');
        c.class.add('a');
        c.class.add('c');
        expect(el.getAttribute('class')).toBe('a b c');
        expect(c.class.has('b')).toBe(true);
        expect(c.class.has('z')).toBe(false);
        root.dispose();
    });

    test('a name added before build is on the element after build', () => {
        const host = document.createElement('section');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        const c = new Component('div');
        c.class.add('early');
        root.controls.add(c);
        expect((c.element as HTMLElement).className).toBe('early');
        root.dispose();
    });

    test('a class that was already on the element stays and is not tracked', () => {
        const { c, el, root } = make();
        el.className = 'outer';
        c.class.add('a');
        expect(el.className).toBe('outer a');
        c.class.remove('outer');
        expect(el.className).toBe('outer a');
        c.class.remove('a');
        expect(el.className).toBe('outer');
        root.dispose();
    });

    test('removing one of several static names keeps the others', () => {
        const { c, el, root } = make();
        c.class.add('a');
        c.class.add('b');
        c.class.add('c');
        c.class.remove('b');
        expect(el.className).toBe('a c');
        c.class.remove(['a', 'c']);
        expect(el.className).toBe('');
        c.class.add('a');
        expect(el.className).toBe('a');
        root.dispose();
    });

    test('removing everything clears the attribute and later names start fresh', () => {
        const { c, el, root } = make();
        c.class.add('a');
        c.class.add('b');
        c.class.remove('**');
        expect(el.hasAttribute('class')).toBe(false);
        c.class.add('b');
        expect(el.getAttribute('class')).toBe('b');
        root.dispose();
    });

    test('a static name shared with a reactive source stays while either holds it', async () => {
        const state = reactive({ on: true });
        const { c, el, root } = make();
        c.class.add('x');
        c.class.add(() => (state.on ? 'x' : ''));
        expect(el.className).toBe('x');
        state.on = false;
        await settle();
        expect(el.className).toBe('x');
        state.on = true;
        await settle();
        c.class.remove('x');
        expect(el.className).toBe('x');
        state.on = false;
        await settle();
        expect(el.className).toBe('');
        root.dispose();
    });

    test('object and array forms after single names see the names added before', () => {
        const { c, el, root } = make();
        c.class.add('a');
        c.class.add('b');
        c.class.add({ a: false, d: true });
        expect(el.className).toBe('b d');
        c.class.add(['b', 'e']);
        expect(el.className).toBe('b d e');
        c.class.add('f');
        c.class.add('b');
        expect(el.className).toBe('b d e f');
        c.class.remove('d');
        expect(el.className).toBe('b e f');
        root.dispose();
    });

    test('a reactive object form after single names keeps both sources', async () => {
        const state = reactive({ sel: false });
        const { c, el, root } = make('tr');
        c.class.add('row');
        c.class.add([{ danger: () => state.sel }]);
        expect(el.className).toBe('row');
        state.sel = true;
        await settle();
        expect(el.className).toBe('row danger');
        state.sel = false;
        await settle();
        expect(el.className).toBe('row');
        root.dispose();
    });

    test('names with spaces, empty strings and nullish values behave as before', () => {
        const { c, el, root } = make();
        c.class.add('a b');
        c.class.add('');
        c.class.add(null as any);
        c.class.add(undefined as any);
        c.class.add('  c   d ');
        expect(el.className).toBe('a b c d');
        c.class.add('b');
        expect(el.className).toBe('a b c d');
        root.dispose();
    });

    test('a name that is part of another name is still added', () => {
        const { c, el, root } = make();
        c.class.add('col-md-10');
        c.class.add('col-md-1');
        c.class.add('md');
        expect(el.className).toBe('col-md-10 col-md-1 md');
        c.class.remove('col-md-1');
        expect(el.className).toBe('col-md-10 md');
        root.dispose();
    });

    test('several names in one call and across calls stay in order', () => {
        const { c, el, root } = make();
        c.class.add('a', 'b');
        c.class.add('c', 'a', 'd');
        expect(el.className).toBe('a b c d');
        root.dispose();
    });

    test('a text component accepts class names without an element to write to', () => {
        const host = document.createElement('section');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        const t: any = new Component('text');
        expect(() => { t.class.add('a'); t.class.add('b'); t.class.remove('a'); t.class.add({ c: true }); }).not.toThrow();
        root.controls.add(t);
        expect(host.innerHTML).toBe('');
        root.dispose();
    });

    test('a disposed component keeps quiet when its class API was kept', async () => {
        const { c, root } = make();
        const api = c.class;
        api.add('a');
        root.dispose();
        await settle();
        expect(() => { api.add('b'); api.remove('a'); api.add({ c: true }); }).not.toThrow();
    });
});
