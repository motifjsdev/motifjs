/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function stub(el: Element, names: string[]) {
    const calls: string[] = [];
    for (const name of names) {
        Object.defineProperty(el, name, {
            configurable: true,
            value: (...args: any[]) => { calls.push(args.length ? `${name}(${args.map(a => JSON.stringify(a)).join(',')})` : `${name}()`); },
        });
    }
    return calls;
}

function mountTag(tag: string, names: string[], attrs: Record<string, any>) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    const c = new Component(tag);
    const calls = stub(c.element as Element, names);
    root.controls.add(c);
    c.attr.add(attrs);
    return { root, c, calls };
}

describe('method-like attributes call the element method', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test.each([
        ['show', true, ['show()']],
        ['show', false, ['close()']],
        ['showModal', true, ['showModal()']],
        ['showModal', false, ['close()']],
        ['close', true, ['close()']],
        ['close', 'cancel', ['close("cancel")']],
        ['showPopover', true, ['showPopover()']],
        ['showPopover', false, ['hidePopover()']],
        ['hidePopover', true, ['hidePopover()']],
        ['togglePopover', true, ['togglePopover(true)']],
        ['togglePopover', false, ['togglePopover(false)']],
        ['togglePopover', 1, ['togglePopover()']],
        ['requestSubmit', true, ['requestSubmit()']],
        ['checkValidity', true, ['checkValidity()']],
        ['reportValidity', true, ['reportValidity()']],
        ['showPicker', true, ['showPicker()']],
        ['load', true, ['load()']],
        ['setSelectionRange', [0, 5], ['setSelectionRange(0,5)']],
        ['setRangeText', 'abc', ['setRangeText("abc")']],
        ['setRangeText', ['abc', 0, 1], ['setRangeText("abc",0,1)']],
        ['setPointerCapture', 7, ['setPointerCapture(7)']],
        ['releasePointerCapture', 7, ['releasePointerCapture(7)']],
        ['fastSeek', 12, ['fastSeek(12)']],
    ])('%s = %p', async (name, value, expected) => {
        const names = ['show', 'showModal', 'close', 'showPopover', 'hidePopover', 'togglePopover', 'requestSubmit', 'checkValidity', 'reportValidity', 'showPicker', 'load', 'setSelectionRange', 'setRangeText', 'setPointerCapture', 'releasePointerCapture', 'fastSeek'];
        const { root, c, calls } = mountTag('div', names, { [name]: value });
        await tick();
        expect(calls).toEqual(expected);
        expect((c.element as Element).hasAttribute(name.toLowerCase())).toBe(false);
        await root.dispose();
    });

    test('a static options object reaches scrollTo and focus', async () => {
        const { root, c, calls } = mountTag('div', ['scrollTo', 'focus'], { scrollTo: { top: 10 }, focus: { preventScroll: true } });
        await tick();
        expect(calls).toEqual(['scrollTo({"top":10})', 'focus({"preventScroll":true})']);
        expect(Array.from((c.element as Element).attributes).map(a => a.name)).toEqual([]);
        await root.dispose();
    });

    test('nothing is called for false on methods without a counterpart', async () => {
        const { root, calls } = mountTag('div', ['requestSubmit', 'load', 'close'], { requestSubmit: false, load: false, close: false });
        await tick();
        expect(calls).toEqual([]);
        await root.dispose();
    });

    test('a reactive showModal opens and closes the dialog', async () => {
        const s = reactive({ open: false });
        const out = new compiler.Compiler().start(`function A(){ return <section><dialog id="d" showModal={() => s.open} /></section>; }`, 'D.tsx');
        const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
        const A = new Function('_mc', '_mf', '_mfc', '_mv', 'Component', 's', `"use strict";${code}\nreturn A;`)(motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component, s);
        const proto = Object.getPrototypeOf(document.createElement('dialog'));
        const saved = ['showModal', 'close'].map(n => [n, Object.getOwnPropertyDescriptor(proto, n)] as const);
        const calls = stub(proto, ['showModal', 'close']);
        try {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const root = new Component(host);
            root.build();
            root.controls.add(A());
            await tick();
            s.open = true;
            await tick();
            s.open = false;
            await tick();
            expect(calls).toEqual(['close()', 'showModal()', 'close()']);
            expect(host.querySelector('dialog')!.hasAttribute('showmodal')).toBe(false);
            await root.dispose();
        } finally {
            for (const [n, d] of saved) {
                if (d) Object.defineProperty(proto, n, d); else delete (proto as any)[n];
            }
        }
    });
});

describe('options on a plain tag', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('reaches motif.options and writes no attribute', async () => {
        const out = new compiler.Compiler().start(`function A(){ return <section><div id="o" options={{ hideStrategy: 'detach', disableDisposal: true }} /></section>; }`, 'O.tsx');
        const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
        const A = new Function('_mc', '_mf', '_mfc', '_mv', 'Component', `"use strict";${code}\nreturn A;`)(motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        root.controls.add(A());
        const div = host.querySelector('#o')!;
        const comp = (root.controls.items[0] as any).controls.items[0];
        expect(comp.motif.options.hideStrategy).toBe('detach');
        expect(comp.motif.options.disableDisposal).toBe(true);
        expect(Array.from(div.attributes).map(a => a.name)).toEqual(['id']);
        await root.dispose();
    });
});
