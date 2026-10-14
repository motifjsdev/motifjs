import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'CM.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(child: ComponentBase) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    root.controls.add(child);
    return el;
}

describe('metin çocuğunda {L[k]}', () => {
    test('anahtarı değişkenin değerinden okur', async () => {
        const L = { a: 'Alpha', k: 'yanlış alan' };
        const A = evalJsx(`function A(){ const k = 'a'; return <p>{L[k]}</p>; }`, 'A', { L });
        const el = mount(A());
        await settle();
        expect(el.querySelector('p')!.textContent).toBe('Alpha');
    });

    test('liste içinde her öğe kendi anahtarının etiketini gösterir', async () => {
        const L = { build: 'Build', dispose: 'Dispose' };
        const A = evalJsx(`function A(){ return <ul>{['build', 'dispose'].map(k => <li>{L[k]}</li>)}</ul>; }`, 'A', { L });
        const el = mount(A());
        await settle();
        expect(Array.from(el.querySelectorAll('li')).map(li => li.textContent)).toEqual(['Build', 'Dispose']);
    });

    test('ternary dalında anahtarı değişkenin değerinden okur', async () => {
        const L = { a: 'Alpha', k: 'yanlış alan' };
        const A = evalJsx(`function A(){ const k = 'a'; return <p>{c ? L[k] : "x"}</p>; }`, 'A', { L, c: true });
        const el = mount(A());
        await settle();
        expect(el.querySelector('p')!.textContent).toBe('Alpha');
    });

    test('reaktif nesnede seçilen anahtarın değeri değişince metin güncellenir', async () => {
        const L = reactive({ a: 'Alpha' });
        const A = evalJsx(`function A(){ const k = 'a'; return <p>{L[k]}</p>; }`, 'A', { L });
        const el = mount(A());
        await settle();
        L.a = 'Alef';
        await settle();
        expect(el.querySelector('p')!.textContent).toBe('Alef');
    });
});
