import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { await tick(); await tick(); };

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'SpreadInline.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(child: any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

const attrWatchers = (c: any, key: string) =>
    ((c.bindings as any)._items as any[]).filter(b => b?.propertyName === `__attr:${key}`).length;

describe('an inline attribute owns the key even when the spread gives a getter for it', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('compiled tag: inline id and title stay, the spread-only getter stays live, class keeps merging', async () => {
        const st = reactive({ id: 'g1', title: 't1', y: 'y1', cls: 'ga' });
        const p = { id: () => st.id, title: () => st.title, 'data-y': () => st.y, class: () => st.cls };
        const A = evalJsx(`function A(){ return <input {...p} id="title" title="plain" class="fixed" />; }`, 'A', { p });
        const comp = A();
        const { host } = mount(comp);
        await settle();
        const el = host.querySelector('input')!;
        expect(el.id).toBe('title');
        expect(el.getAttribute('title')).toBe('plain');
        expect(el.getAttribute('data-y')).toBe('y1');
        expect(attrWatchers(comp, 'id')).toBe(0);
        expect(attrWatchers(comp, 'title')).toBe(0);
        expect(attrWatchers(comp, 'data-y')).toBe(1);
        st.id = 'g2'; st.title = 't2'; st.y = 'y2'; st.cls = 'gb';
        await settle();
        expect(el.id).toBe('title');
        expect(el.getAttribute('title')).toBe('plain');
        expect(el.getAttribute('data-y')).toBe('y2');
        expect(el.classList.contains('fixed')).toBe(true);
        expect(el.classList.contains('gb')).toBe(true);
        expect(el.classList.contains('ga')).toBe(false);
    });

    test('JSX-free: a plain value after a getter owns the key, a getter after a plain value is live, remove clears both', async () => {
        const st = reactive({ id: 'g1' });
        const a: any = new Component('div');
        a.attr.add({ id: () => st.id });
        a.attr.add({ id: 'fixed' });
        const b: any = new Component('div');
        b.attr.add({ id: 'fixed' });
        b.attr.add({ id: () => st.id });
        const c: any = new Component('div');
        c.attr.add({ id: () => st.id });
        c.attr.remove('id');
        const { root } = mount(a);
        root.controls.add(b);
        root.controls.add(c);
        await settle();
        expect(a.element.id).toBe('fixed');
        expect(attrWatchers(a, 'id')).toBe(0);
        expect(b.element.id).toBe('g1');
        expect(attrWatchers(b, 'id')).toBe(1);
        expect(c.element.hasAttribute('id')).toBe(false);
        expect(attrWatchers(c, 'id')).toBe(0);
        st.id = 'g2';
        await settle();
        expect(a.element.id).toBe('fixed');
        expect(b.element.id).toBe('g2');
        expect(c.element.hasAttribute('id')).toBe(false);
    });
});
