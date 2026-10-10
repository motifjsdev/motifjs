import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'EP.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(...children: any[]) {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    for (const c of children) root.controls.add(c);
    return { root, el };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('parts of an element component', () => {
    test('class, attr and bindings are reachable and stay the same object', () => {
        const c: any = new Component('div');
        const { root, el } = mount(c);
        expect(typeof c.class.add).toBe('function');
        expect(c.class).toBe(c.class);
        expect(typeof c.attr.add).toBe('function');
        expect(c.attr).toBe(c.attr);
        expect(c.bindings.items).toEqual([]);
        expect(c.bindings).toBe(c.bindings);
        expect(el.innerHTML).toBe('<div></div>');
        root.dispose();
    });

    test('a part used after build works', async () => {
        const st = reactive({ v: 'bir' });
        const c: any = new Component('div');
        const { root, el } = mount(c);
        c.class.add('kutu');
        c.attr.add({ title: 't' });
        c.bindings.add('textContent', st, 'v');
        await settle();
        expect(el.innerHTML).toBe('<div class="kutu" title="t">bir</div>');
        st.v = 'iki';
        await settle();
        expect(el.innerHTML).toBe('<div class="kutu" title="t">iki</div>');
        root.dispose();
    });

    test('class, attributes and bound values from JSX', async () => {
        const st = reactive({ c: 'a', t: 'x', v: 'ilk', on: true, show: true });
        const A = evalJsx(`function A(){ return <div class="sabit" title={st.t} data-k="1"><span class={st.c}>s</span><input value={st.v} /><p x-wait={() => !st.on}>w</p><b x-display={() => st.show}>d</b></div>; }`, 'A', { st });
        const { root, el } = mount(A());
        await settle();
        const html = () => el.innerHTML.replace(/<!--[^>]*-->/g, '#');
        expect(html()).toBe('<div title="x" data-k="1" class="sabit"><span class="a">s</span><input><p>w</p><b>d</b></div>');
        expect((el.querySelector('input') as HTMLInputElement).value).toBe('ilk');
        st.c = 'b';
        st.t = 'y';
        st.v = 'son';
        st.on = false;
        st.show = false;
        await settle();
        expect(html()).toBe('<div title="y" data-k="1" class="sabit"><span class="b">s</span><input>##</div>');
        expect((el.querySelector('input') as HTMLInputElement).value).toBe('son');
        st.on = true;
        st.show = true;
        await settle();
        expect(html()).toBe('<div title="y" data-k="1" class="sabit"><span class="b">s</span><input><p>w</p><b>d</b></div>');
        root.dispose();
    });

    test('style given as a function follows state', async () => {
        const st = reactive({ w: 10 });
        const c: any = new Component('div');
        c.style(() => ({ width: st.w + 'px' }));
        const { root } = mount(c);
        await settle();
        expect(c.element.style.width).toBe('10px');
        st.w = 20;
        await settle();
        expect(c.element.style.width).toBe('20px');
        root.dispose();
    });
});

describe('element components on dispose', () => {
    test('an element disposed on its own drops parts it never used', async () => {
        const c: any = new Component('div');
        const { root } = mount(c);
        c.dispose();
        await settle();
        expect(c.isDisposed).toBe(true);
        expect([c.controls, c.class, c.attr, c.bindings]).toEqual([undefined, undefined, undefined, undefined]);
        root.dispose();
    });

    test('an element disposed on its own drops parts it used', async () => {
        const st = reactive({ c: 'a' });
        const c: any = new Component('div');
        c.class.add(() => st.c);
        c.attr.add({ title: 't' });
        const { root, el } = mount(c);
        await settle();
        c.dispose();
        await settle();
        expect([c.class, c.attr, c.bindings]).toEqual([undefined, undefined, undefined]);
        st.c = 'b';
        await settle();
        expect(el.innerHTML).toBe('');
        root.dispose();
    });

    test('a reactive class stops following state after its parent is disposed', async () => {
        const st = reactive({ c: 'a' });
        const host: any = new Component('div');
        const c: any = new Component('span');
        c.class.add(() => st.c);
        host.controls.add(c);
        const { root } = mount(host);
        await settle();
        expect(c.element.className).toBe('a');
        root.dispose();
        await settle();
        st.c = 'b';
        await settle();
        expect(c.isDisposed).toBe(true);
    });
});
