/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function compile(body: string, extra: Record<string, any> = {}) {
    const out = new compiler.Compiler().start(`function A(){ return ${body}; }`, 'V.tsx');
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

describe('literal attribute values on plain tags', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('numbers, booleans and null reach the element', async () => {
        const A = compile(`<section><button id="b" disabled={false} tabindex={0} data-n={5} hidden={true} title={null} data-m={-1} /></section>`);
        const { host, root } = mount(A);
        const b = host.querySelector('#b') as HTMLButtonElement;
        expect(b.disabled).toBe(false);
        expect(b.hasAttribute('disabled')).toBe(false);
        expect(b.getAttribute('tabindex')).toBe('0');
        expect(b.getAttribute('data-n')).toBe('5');
        expect(b.getAttribute('hidden')).toBe('');
        expect(b.hasAttribute('title')).toBe(false);
        expect(b.getAttribute('data-m')).toBe('-1');
        await root.dispose();
    });

    test('aria-* and data-* write booleans as text', async () => {
        const A = compile(`<section><div id="d" aria-expanded={false} aria-hidden={true} data-flag={false} data-on /></section>`);
        const { host, root } = mount(A);
        const d = host.querySelector('#d')!;
        expect(d.getAttribute('aria-expanded')).toBe('false');
        expect(d.getAttribute('aria-hidden')).toBe('true');
        expect(d.getAttribute('data-flag')).toBe('false');
        expect(d.getAttribute('data-on')).toBe('true');
        await root.dispose();
    });

    test('a valueless attribute is present', async () => {
        const A = compile(`<section><button id="b" disabled /></section>`);
        const { host, root } = mount(A);
        expect((host.querySelector('#b') as HTMLButtonElement).disabled).toBe(true);
        await root.dispose();
    });

    test('a negation stays live', async () => {
        const s = reactive({ open: false });
        const A = compile(`<section><div id="d" aria-busy={!s.open} /></section>`, { s });
        const { host, root } = mount(A);
        const d = host.querySelector('#d')!;
        expect(d.getAttribute('aria-busy')).toBe('true');
        s.open = true;
        await tick();
        expect(d.getAttribute('aria-busy')).toBe('false');
        await root.dispose();
    });

    test('literal values reach method-like props', async () => {
        const proto = Object.getPrototypeOf(document.createElement('dialog'));
        const saved = ['showModal', 'show'].map(n => [n, Object.getOwnPropertyDescriptor(proto, n)] as const);
        const calls: string[] = [];
        for (const n of ['showModal', 'show']) {
            Object.defineProperty(proto, n, { configurable: true, value: () => { calls.push(n); } });
        }
        try {
            const A = compile(`<section><dialog showModal={true} /><dialog show /><input id="i" value="abcdefgh" setSelectionRange={[2, 5]} /></section>`);
            const { host, root } = mount(A);
            await tick();
            expect(calls.sort()).toEqual(['show', 'showModal']);
            const input = host.querySelector('#i') as HTMLInputElement;
            expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
            expect(input.hasAttribute('setselectionrange')).toBe(false);
            await root.dispose();
        } finally {
            for (const [n, d] of saved) {
                if (d) Object.defineProperty(proto, n, d); else delete (proto as any)[n];
            }
        }
    });
});
