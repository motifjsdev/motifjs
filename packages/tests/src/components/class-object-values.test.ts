import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function compile(jsx: string, extra: Record<string, any> = {}) {
    const out = new compiler.Compiler().start(`function A(){ return <section>${jsx}</section>; }`, 'C.tsx');
    const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = Object.keys(extra);
    return new Function('_mc', '_mf', '_mfc', '_mv', 'Component', ...names, `"use strict";${code}\nreturn A;`)(
        motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component, ...names.map(n => extra[n]));
}

function mountCompiled(jsx: string, extra: Record<string, any> = {}) {
    const A = compile(jsx, extra);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(A());
    return { root, el: host.querySelector('#d') as HTMLElement };
}

function mountDiv() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    const c = new Component('div');
    root.controls.add(c);
    return { root, c, el: c.element as HTMLElement };
}

const classes = (el: Element) => Array.from(el.classList).sort();

describe('class objects in JSX', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a getter value toggles its key', async () => {
        const s = reactive({ on: false });
        const { root, el } = mountCompiled(`<div id="d" class={{ a: () => s.on }} />`, { s });
        expect(classes(el)).toEqual([]);
        s.on = true;
        await settle();
        expect(classes(el)).toEqual(['a']);
        await root.dispose();
    });

    test('a quoted key with true is added once', async () => {
        const { root, el } = mountCompiled(`<div id="d" class={{ 'my-a': true }} />`);
        expect(classes(el)).toEqual(['my-a']);
        await root.dispose();
    });

    test('a comparison value stays live', async () => {
        const s = reactive({ sel: 0 });
        const { root, el } = mountCompiled(`<div id="d" class={{ danger: s.sel === id }} />`, { s, id: 2 });
        expect(classes(el)).toEqual([]);
        s.sel = 2;
        await settle();
        expect(classes(el)).toEqual(['danger']);
        s.sel = 3;
        await settle();
        expect(classes(el)).toEqual([]);
        await root.dispose();
    });

    test('member, call and ternary values stay live', async () => {
        const s = reactive({ on: false, n: 0 });
        const isOn = () => s.on;
        const { root, el } = mountCompiled(`<div id="d" class={{ a: s.on, b: isOn(), c: s.n > 2 ? true : false }} />`, { s, isOn });
        expect(classes(el)).toEqual([]);
        s.on = true;
        await settle();
        expect(classes(el)).toEqual(['a', 'b']);
        s.n = 3;
        await settle();
        expect(classes(el)).toEqual(['a', 'b', 'c']);
        s.on = false;
        await settle();
        expect(classes(el)).toEqual(['c']);
        await root.dispose();
    });

    test('a name key with a boolean literal is a class name, not a variable', async () => {
        const { root, el } = mountCompiled(`<div id="d" class={{ a: true, b: false }} />`);
        expect(classes(el)).toEqual(['a']);
        await root.dispose();
    });

    test('falsy literals leave their keys out', async () => {
        const { root, el } = mountCompiled(`<div id="d" class={{ 'my-a': true, 'my-b': false, c: '', d: 'x', e: 0, f: null, g: 1 }} />`);
        expect(classes(el)).toEqual(['d', 'g', 'my-a']);
        await root.dispose();
    });

    test('a template value decides its key and does not become the class name', async () => {
        const s = reactive({ k: '' });
        const { root, el } = mountCompiled('<div id="d" class={{ a: `x`, b: ``, c: `${s.k}` }} />', { s });
        expect(classes(el)).toEqual(['a']);
        s.k = 'yes';
        await settle();
        expect(classes(el)).toEqual(['a', 'c']);
        await root.dispose();
    });

    test('a getter inside an array keeps its key', async () => {
        const s = reactive({ on: false });
        const { root, el } = mountCompiled(`<div id="d" class={[{ a: () => s.on }]} />`, { s });
        expect(classes(el)).toEqual([]);
        s.on = true;
        await settle();
        expect(classes(el)).toEqual(['a']);
        await root.dispose();
    });

    test('an expression inside an array stays live next to a plain name', async () => {
        const s = reactive({ sel: 0 });
        const { root, el } = mountCompiled(`<div id="d" class={['base', { danger: s.sel === 1 }]} />`, { s });
        expect(classes(el)).toEqual(['base']);
        s.sel = 1;
        await settle();
        expect(classes(el)).toEqual(['base', 'danger']);
        await root.dispose();
    });

    test('a value that holds a getter is read through it', async () => {
        const s = reactive({ on: false });
        const isOn = () => s.on;
        const { root, el } = mountCompiled(`<div id="d" class={{ a: isOn }} />`, { isOn });
        expect(classes(el)).toEqual([]);
        s.on = true;
        await settle();
        expect(classes(el)).toEqual(['a']);
        await root.dispose();
    });

    test('static and live keys mix in one object', async () => {
        const s = reactive({ on: false });
        const { root, el } = mountCompiled(`<div id="d" class={{ card: true, active: s.on }} />`, { s });
        expect(classes(el)).toEqual(['card']);
        s.on = true;
        await settle();
        expect(classes(el)).toEqual(['active', 'card']);
        s.on = false;
        await settle();
        expect(classes(el)).toEqual(['card']);
        await root.dispose();
    });

    test('a computed key takes the class name from its expression', async () => {
        const s = reactive({ on: false });
        const { root, el } = mountCompiled(`<div id="d" class={{ [name]: s.on }} />`, { s, name: 'picked' });
        expect(classes(el)).toEqual([]);
        s.on = true;
        await settle();
        expect(classes(el)).toEqual(['picked']);
        await root.dispose();
    });
});

describe('class objects given to class.add', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a function value is bound live', async () => {
        const s = reactive({ on: false });
        const { root, c, el } = mountDiv();
        c.class.add({ a: () => s.on, b: true });
        expect(classes(el)).toEqual(['b']);
        s.on = true;
        await settle();
        expect(classes(el)).toEqual(['a', 'b']);
        s.on = false;
        await settle();
        expect(classes(el)).toEqual(['b']);
        await root.dispose();
    });

    test('plain values stay as they are', async () => {
        const { root, c, el } = mountDiv();
        c.class.add({ a: true, b: false, d: 'x' });
        expect(classes(el)).toEqual(['a', 'd']);
        await root.dispose();
    });

    test('a keyed getter that returns a getter is read through it', async () => {
        const s = reactive({ on: false });
        const isOn = () => s.on;
        const { root, c, el } = mountDiv();
        c.class.add([{ a: () => isOn }]);
        expect(classes(el)).toEqual([]);
        s.on = true;
        await settle();
        expect(classes(el)).toEqual(['a']);
        await root.dispose();
    });

    test('a function value is removed with class.remove("**")', async () => {
        const s = reactive({ on: true });
        const { root, c, el } = mountDiv();
        c.class.add({ a: () => s.on });
        expect(classes(el)).toEqual(['a']);
        c.class.remove('**');
        s.on = false;
        await settle();
        s.on = true;
        await settle();
        expect(classes(el)).toEqual([]);
        await root.dispose();
    });
});
