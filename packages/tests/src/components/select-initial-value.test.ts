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

describe('<select value={…}> initial value', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('static options: the initial value is not the first option', async () => {
        const A = evalJsx(`function A(s){ return <select value={() => s.lang}><option value="tr">TR</option><option value="en">EN</option></select>; }`, 'A');
        const state = reactive({ lang: 'en' });
        const { host, root } = mount(A(state));
        const select = host.querySelector('select') as HTMLSelectElement;
        expect(select.value).toBe('en');

        state.lang = 'tr';
        await wait(10);
        expect(select.value).toBe('tr');
        await root.dispose();
    });

    test('options rendered from a list', async () => {
        const A = evalJsx(`function A(s){ return <select value={() => s.lang}>{s.langs.map(l => <option value={l}>{l}</option>)}</select>; }`, 'A');
        const state = reactive({ lang: 'de', langs: ['tr', 'en', 'de'] });
        const { host, root } = mount(A(state));
        await wait(10);
        const select = host.querySelector('select') as HTMLSelectElement;
        expect(select.options.length).toBe(3);
        expect(select.value).toBe('de');
        await root.dispose();
    });

    test('bindings.model on a select also starts on the model value', async () => {
        const state = reactive({ lang: 'en' });
        const select = new Component('select', {
            initializeComponent: (s: any) => {
                s.bindings.model(state, 'lang');
                for (const v of ['tr', 'en']) {
                    const opt = new Component('option');
                    (opt.element as HTMLOptionElement).value = v;
                    s.controls.add(opt);
                }
            }
        } as any);
        const { root } = mount(select);
        expect((select.element as HTMLSelectElement).value).toBe('en');
        await root.dispose();
    });
});
