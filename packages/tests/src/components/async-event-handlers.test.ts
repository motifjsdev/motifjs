/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

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
    return { host, root };
}

describe('async event handlers', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('an inline async onclick runs and awaits', async () => {
        const steps: string[] = [];
        const A = evalJsx(`
            function A(){ return <button onclick={async () => { steps.push('start'); await wait(); steps.push('end'); }}>a</button>; }`,
            'A', { steps, wait: () => Promise.resolve() });
        const { host, root } = mount(A());
        host.querySelector('button')!.click();
        expect(steps).toEqual(['start']);
        await tick();
        expect(steps).toEqual(['start', 'end']);
        await root.dispose();
    });

    test('a rejected async onclick is reported as MJX123', async () => {
        const reported: any[] = [];
        const unbind = motif.errorHandler.addListener(e => reported.push(e));
        const log = jest.spyOn(console, 'error').mockImplementation(() => { });
        try {
            const A = evalJsx(`
                function A(){ return <button onclick={async () => { await wait(); throw new Error('boom'); }}>a</button>; }`,
                'A', { wait: () => Promise.resolve() });
            const { host, root } = mount(A());
            host.querySelector('button')!.click();
            await tick();
            expect(reported.find(e => e?.code === 'MJX123')?.cause?.message).toBe('boom');
            await root.dispose();
        } finally {
            unbind();
            log.mockRestore();
        }
    });

    test('an async x-ref receives the component', async () => {
        const seen: string[] = [];
        const A = evalJsx(`
            function A(){ return <div x-ref={async (s) => { await wait(); seen.push(s.element.tagName); }} />; }`,
            'A', { seen, wait: () => Promise.resolve() });
        const { root } = mount(A());
        await tick();
        expect(seen).toEqual(['DIV']);
        await root.dispose();
    });
});
