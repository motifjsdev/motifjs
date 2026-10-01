import * as motif from '@motifx/core';
import { Component } from '@motifx/core';
import { Scanner } from '@motifx/core/internal';

const compiler = require('../../../compiler/dist/index.cjs');

function compile(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new compiler.Compiler().start(source, 'O.tsx');
    const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = Object.keys(extra);
    return new Function('_mc', '_mf', '_mfc', '_mv', 'Component', ...names, `"use strict";${code}\nreturn ${exportName};`)(
        motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component, ...names.map(n => extra[n]));
}

function mount(child: any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

function mountDiv() {
    const c = new Component('div');
    const { root } = mount(c);
    return { root, c, el: c.element as HTMLElement };
}

const attributeNames = (el: Element) => Array.from(el.attributes).map(a => a.name).sort();

const hostile = () => JSON.parse('{"innerHTML":"<img src=x onerror=alert(1)>","onmouseover":"alert(2)","style":"position:fixed"}');

describe('object and array attribute values are written as one value', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('the keys of an object value do not become attributes', async () => {
        const { root, c, el } = mountDiv();
        c.attr.add({ title: hostile() });
        expect(attributeNames(el)).toEqual(['title']);
        expect(el.getAttribute('title')).toBe('[object Object]');
        expect(el.innerHTML).toBe('');
        await root.dispose();
    });

    test('an array value is written joined and its items are not traversed', async () => {
        const { root, c, el } = mountDiv();
        c.attr.add({ 'data-list': [1, 2], 'data-bag': [hostile()] });
        expect(attributeNames(el)).toEqual(['data-bag', 'data-list']);
        expect(el.getAttribute('data-list')).toBe('1,2');
        expect(el.getAttribute('data-bag')).toBe('[object Object]');
        expect(el.innerHTML).toBe('');
        await root.dispose();
    });

    test('a static value and a getter write the same text', async () => {
        const { root, c, el } = mountDiv();
        const value = { a: 1 };
        const list = [1, 2];
        c.attr.add({ 'data-a': value, 'data-b': () => value, 'data-c': list, 'data-d': () => list });
        expect(attributeNames(el)).toEqual(['data-a', 'data-b', 'data-c', 'data-d']);
        expect(el.getAttribute('data-a')).toBe('[object Object]');
        expect(el.getAttribute('data-b')).toBe('[object Object]');
        expect(el.getAttribute('data-c')).toBe('1,2');
        expect(el.getAttribute('data-d')).toBe('1,2');
        await root.dispose();
    });

    test('an array of bags writes nothing', async () => {
        const { root, c, el } = mountDiv();
        c.attr.add([{ title: 'a' }, { lang: 'tr' }] as any);
        expect(attributeNames(el)).toEqual([]);
        await root.dispose();
    });

    test('compiled identifier and call attributes keep the name written in JSX', async () => {
        const q = hostile();
        const A = compile(`function A(){ return <section><div id="d" data-q={q} title={getQ()} /></section>; }`, 'A', { q, getQ: () => q });
        const { host, root } = mount(A());
        const d = host.querySelector('#d')!;
        expect(attributeNames(d)).toEqual(['data-q', 'id', 'title']);
        expect(d.getAttribute('data-q')).toBe('[object Object]');
        expect(d.getAttribute('title')).toBe('[object Object]');
        expect(d.innerHTML).toBe('');
        await root.dispose();
    });

    test('spread on a plain element neither leaks the keys of object props nor calls their functions', async () => {
        let invoked = 0;
        const A = compile(`function A(p){ return <div {...p} />; }`, 'A');
        const { host, root } = mount(A({
            id: 'card',
            buttons: [{ key: 'ok', text: 'Tamam', onInvoke: () => { invoked++; return 'called'; } }],
            meta: { label: 'x', responsive: true },
            payload: hostile(),
        }));
        const el = host.firstElementChild as HTMLElement;
        expect(attributeNames(el)).toEqual(['buttons', 'id', 'meta', 'payload']);
        expect(el.getAttribute('buttons')).toBe('[object Object]');
        expect(el.getAttribute('meta')).toBe('[object Object]');
        expect(el.getAttribute('payload')).toBe('[object Object]');
        expect(el.innerHTML).toBe('');
        expect(invoked).toBe(0);
        await root.dispose();
    });

    test('a query value bound to an attribute stays the value of that attribute', async () => {
        const scanner = new Scanner('/list');
        const query = encodeURIComponent('{"innerHTML":"<img src=x onerror=alert(1)>","onmouseover":"alert(2)"}');
        expect(scanner.exist('/list?q=' + query)).toBe(true);
        const q = scanner.parameters.q;
        const A = compile(`function A(){ return <section><div id="d" data-q={q} /></section>; }`, 'A', { q });
        const { host, root } = mount(A());
        const d = host.querySelector('#d')!;
        expect(attributeNames(d)).toEqual(['data-q', 'id']);
        expect(d.innerHTML).toBe('');
        await root.dispose();
    });
});
