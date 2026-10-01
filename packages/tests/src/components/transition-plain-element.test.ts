import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';
import { wait } from '../helpers/test-utils';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function evalJsx(source: string, exportName: string) {
    const out = new CompilerCtor().start(source, 'RT.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const fn = new Function('_mc', '_mfc', '_mv', 'Component', 'reactive', `${code}\nreturn ${exportName};`);
    return fn((motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive);
}

function mount(child: any): { host: HTMLElement; root: Component } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

describe('transition on plain DOM elements (compiled JSX)', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('transition="fade" plays enter classes and writes no attribute', async () => {
        const A = evalJsx(`function A(){ return <div id="box" transition="fade">a</div>; }`, 'A');
        const { host, root } = mount(A());
        await Promise.resolve();
        const el = host.querySelector('#box') as HTMLElement;
        expect(el.hasAttribute('transition')).toBe(false);
        expect(el.classList.contains('fade-enter-from')).toBe(true);
        expect(el.classList.contains('fade-enter-active')).toBe(true);
        await root.dispose();
    });

    test('hide() plays leave classes before removing the element', async () => {
        const A = evalJsx(`function A(){ return <div id="box" transition="fade">a</div>; }`, 'A');
        const comp = A();
        const { host, root } = mount(comp);
        await wait(80);
        const el = host.querySelector('#box') as HTMLElement;
        const hiding = comp.motif.hide();
        await Promise.resolve();
        expect(el.classList.contains('fade-leave-active')).toBe(true);
        await hiding;
        await wait(80);
        expect(el.parentNode).toBeNull();
        await root.dispose();
    });

    test('object form sets the name and writes no stray attributes', async () => {
        const A = evalJsx(`function A(){ return <div id="box" transition={{ name: 'slide', duration: 30 }}>a</div>; }`, 'A');
        const { host, root } = mount(A());
        await Promise.resolve();
        const el = host.querySelector('#box') as HTMLElement;
        expect(el.hasAttribute('name')).toBe(false);
        expect(el.hasAttribute('duration')).toBe(false);
        expect(el.classList.contains('slide-enter-from')).toBe(true);
        await root.dispose();
    });
});
