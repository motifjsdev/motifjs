/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'RT.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    const fn = new Function(...names, `${code}\nreturn ${exportName};`);
    return fn(...values);
}

function mount(child: Component) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    const bubbled: string[] = [];
    host.addEventListener('click', e => bubbled.push(e.type));
    host.addEventListener('keydown', e => bubbled.push((e as KeyboardEvent).key));
    return { root, bubbled };
}

const key = (el: Element, k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
};

const click = (el: Element) => {
    const e = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('DOM event handler return value', () => {
    test('a concise && body does not cancel the other keys', async () => {
        const submitted: string[] = [];
        const c = new Component('input');
        c.motif.on('keydown', (e: any) => e.key === 'Enter' && submitted.push(e.key) > 0);
        const { root, bubbled } = mount(c);
        const typed = key(c.element as Element, 'a');
        expect(typed.defaultPrevented).toBe(false);
        const entered = key(c.element as Element, 'Enter');
        expect(entered.defaultPrevented).toBe(false);
        expect(submitted).toEqual(['Enter']);
        expect(bubbled).toEqual(['a', 'Enter']);
        await root.dispose();
    });

    test('returning false neither prevents nor stops the event', async () => {
        const c = new Component('button');
        c.motif.on('click', () => false);
        const { root, bubbled } = mount(c);
        const e = click(c.element as Element);
        expect(e.defaultPrevented).toBe(false);
        expect(bubbled).toEqual(['click']);
        await root.dispose();
    });

    test('returning false from a prop handler is ignored', async () => {
        const c = new Component('button', { onclick: () => false } as any);
        const { root, bubbled } = mount(c);
        const e = click(c.element as Element);
        expect(e.defaultPrevented).toBe(false);
        expect(bubbled).toEqual(['click']);
        await root.dispose();
    });

    test('returning { cancel: true } prevents and stops the event', async () => {
        const c = new Component('button');
        c.motif.on('click', () => ({ cancel: true }) as any);
        const { root, bubbled } = mount(c);
        const e = click(c.element as Element);
        expect(e.defaultPrevented).toBe(true);
        expect(bubbled).toEqual([]);
        await root.dispose();
    });

    test(':prevent cancels without stopping, :stop stops without cancelling', async () => {
        const prevented = new Component('button');
        prevented.motif.on('click:prevent', () => false);
        const a = mount(prevented);
        const pe = click(prevented.element as Element);
        expect(pe.defaultPrevented).toBe(true);
        expect(a.bubbled).toEqual(['click']);

        const stopped = new Component('button');
        stopped.motif.on('click:stop', () => false);
        const b = mount(stopped);
        const se = click(stopped.element as Element);
        expect(se.defaultPrevented).toBe(false);
        expect(b.bubbled).toEqual([]);

        await a.root.dispose();
        await b.root.dispose();
    });

    test('compiled JSX onkeydown with && lets other keys through', async () => {
        const submitted: string[] = [];
        const Field = evalJsx(
            `function Field(){ return <input onkeydown={(e) => e.key === 'Enter' && submit(e.key)} />; }`,
            'Field',
            { submit: (k: string) => { submitted.push(k); return false; } },
        );
        const { root, bubbled } = mount(Field());
        const input = document.body.querySelector('input') as HTMLInputElement;
        expect(key(input, 'x').defaultPrevented).toBe(false);
        expect(key(input, 'Enter').defaultPrevented).toBe(false);
        expect(submitted).toEqual(['Enter']);
        expect(bubbled).toEqual(['x', 'Enter']);
        await root.dispose();
    });
});
