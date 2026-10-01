/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const tick = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function compile(body: string, extra: Record<string, any>) {
    const out = new compiler.Compiler().start(`function A(){ return ${body}; }`, 'C.tsx');
    const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = Object.keys(extra);
    return new Function('_mc', '_mf', '_mfc', '_mv', 'Component', ...names, `"use strict";${code}\nreturn A;`)(
        motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component, ...names.map(n => extra[n]));
}

function mount(A: () => any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(A());
    return { host, root };
}

describe('conditional content is rebuilt only when the condition value changes', () => {
    let built: string[];
    const make = (name: string) => class extends Component {
        constructor() { super('i'); built.push(name); (this.element as HTMLElement).className = name; }
    };

    beforeEach(() => { built = []; });
    afterEach(() => { document.body.innerHTML = ''; });

    test('&& keeps its branch while the value stays the same', async () => {
        const s = reactive({ n: 1 });
        const X = make('x');
        const { host, root } = mount(compile(`<section>{s.n > 0 && <X />}</section>`, { s, X }));
        await tick();
        s.n = 2; await tick();
        s.n = 3; await tick();
        expect(built).toEqual(['x']);
        s.n = 0; await tick();
        expect(host.querySelector('.x')).toBeNull();
        s.n = 5; await tick();
        expect(built).toEqual(['x', 'x']);
        expect(host.querySelector('.x')).not.toBeNull();
        await root.dispose();
    });

    test('&& rebuilds when a truthy value is replaced by another', async () => {
        const s = reactive({ user: { name: 'a' } as any });
        const X = make('x');
        const { root } = mount(compile(`<section>{s.user && <X />}</section>`, { s, X }));
        await tick();
        s.user = { name: 'b' }; await tick();
        expect(built).toEqual(['x', 'x']);
        await root.dispose();
    });

    test('a ternary keeps its branch while the value stays the same', async () => {
        const s = reactive({ n: 1 });
        const X = make('x');
        const Y = make('y');
        const { host, root } = mount(compile(`<section>{s.n > 0 ? <X /> : <Y />}</section>`, { s, X, Y }));
        await tick();
        s.n = 2; await tick();
        s.n = 3; await tick();
        expect(built).toEqual(['x']);
        s.n = 0; await tick();
        expect(built).toEqual(['x', 'y']);
        expect(host.querySelector('.y')).not.toBeNull();
        await root.dispose();
    });

    test('a branch change queued before dispose does not run afterwards', async () => {
        const s = reactive({ a: true, b: 1 });
        const X = make('x');
        const Y = make('y');
        const Z = make('z');
        const { root } = mount(compile(`<section>{s.a ? <X /> : s.b > 0 ? <Y /> : <Z />}</section>`, { s, X, Y, Z }));
        await tick();
        s.a = false;
        await Promise.resolve();
        await root.dispose();
        await tick();
        expect(built).toEqual(['x']);
    });

    test('a nested ternary keeps its inner branch while the outer value stays the same', async () => {
        const s = reactive({ a: false, b: 1 });
        const X = make('x');
        const Y = make('y');
        const Z = make('z');
        const { root } = mount(compile(`<section>{s.a ? <X /> : s.b > 0 ? <Y /> : <Z />}</section>`, { s, X, Y, Z }));
        await tick();
        s.b = 2; await tick();
        s.b = 3; await tick();
        expect(built).toEqual(['y']);
        await root.dispose();
    });
});
