import * as motif from '@motifx/core';
import { Component, ComponentBase, ControlCollection, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'TP.tsx');
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

const isText = (c: ComponentBase) => (c.element as any)?.nodeType === 3;

afterEach(() => { document.body.innerHTML = ''; });

describe('parts of a text component', () => {
    test('controls, class and attr are reachable and stay the same object', () => {
        const { root } = mount('metin');
        const t = root.controls.items[0];
        expect(isText(t)).toBe(true);
        expect(t.controls).toBeInstanceOf(ControlCollection);
        expect(t.controls.items).toEqual([]);
        expect(t.controls).toBe(t.controls);
        expect(typeof t.class.add).toBe('function');
        expect(t.class).toBe(t.class);
        expect(typeof t.attr.add).toBe('function');
        expect(t.attr).toBe(t.attr);
        expect(t.bindings.items).toEqual([]);
        root.dispose();
    });

    test('a text component made from a text node and from the "text" tag', () => {
        const a = new Component(document.createTextNode('a'));
        const b = new Component('text', { initializeComponent: (s: ComponentBase) => s.setText('b') } as any);
        const { root, el } = mount(a, b);
        for (const t of [a, b]) {
            expect(isText(t)).toBe(true);
            expect(t.controls.items).toEqual([]);
            expect(t.parent).toBe(root);
        }
        expect(el.textContent).toBe('ab');
        root.dispose();
    });

    test('an element component keeps its parts from the start', () => {
        const c = new Component('div');
        expect(c.controls).toBeInstanceOf(ControlCollection);
        expect(typeof c.class.add).toBe('function');
        expect(typeof c.attr.add).toBe('function');
        c.class.add('kutu');
        c.attr.add({ title: 'x' });
        const { root, el } = mount(c);
        expect(el.innerHTML).toBe('<div class="kutu" title="x"></div>');
        root.dispose();
    });

    test('an assigned part replaces the default one', () => {
        const c = new Component(document.createTextNode('a'));
        const other = new ControlCollection(c);
        c.controls = other;
        expect(c.controls).toBe(other);
        const cls: any = { add() { } };
        (c as any).class = cls;
        expect(c.class).toBe(cls);
    });
});

describe('text among element siblings', () => {
    test('static and bound text keep their place while state changes', async () => {
        const state = reactive({ name: 'Ada', n: 1 });
        const P = evalJsx(`function P(){ return <p>Merhaba {st.name}, <b>sayı</b> {st.n} son</p>; }`, 'P', { st: state });
        const { root, el } = mount(P());
        const before = el.innerHTML;
        expect(el.textContent).toBe('Merhaba Ada, sayı 1 son');
        state.name = 'Lin';
        state.n = 2;
        await settle();
        expect(el.textContent).toBe('Merhaba Lin, sayı 2 son');
        expect(el.querySelector('b')!.previousSibling!.textContent).toBe(', ');
        expect(before.replace('Ada', 'Lin').replace('> 1 ', '> 2 ')).toBe(el.innerHTML);
        root.dispose();
    });

    test('adding at an index and moving put text and elements in order', async () => {
        const host: any = new Component('div');
        const { root } = mount(host);
        host.controls.add('b');
        const i = new Component('i');
        host.controls.add(i);
        host.controls.add(0, 'a' as any);
        host.controls.add('c');
        expect(host.element.innerHTML).toBe('ab<i></i>c');
        host.controls.move(host.controls.items[0], undefined as any);
        await settle();
        expect(host.element.innerHTML).toBe('b<i></i>ca');
        root.dispose();
    });

    test('hiding and showing the parent keeps its texts', async () => {
        const host: any = new Component('div');
        host.controls.add('x');
        host.controls.add(new Component('b'));
        host.controls.add('y');
        const { root, el } = mount(host);
        await host.motif.hide();
        expect(el.innerHTML).toBe('<!--h-->');
        await host.motif.show();
        expect(el.innerHTML).toBe('<div>x<b></b>y</div>');
        root.dispose();
    });

    test('a list of rows with text cells reorders with the same nodes', async () => {
        const state = reactive({ rows: [{ id: 1, t: 'bir' }, { id: 2, t: 'iki' }, { id: 3, t: 'üç' }] });
        const L = evalJsx(`function L(){ return <ul>{st.rows.map(r => <li>{r.t} <b>{String(r.id)}</b></li>)}</ul>; }`, 'L', { st: state });
        const { root, el } = mount(L());
        const nodes = [...el.querySelectorAll('li')].map(li => li.firstChild);
        state.rows = [state.rows[2], state.rows[0], state.rows[1]];
        await settle();
        expect([...el.querySelectorAll('li')].map(li => li.textContent)).toEqual(['üç 3', 'bir 1', 'iki 2']);
        expect([...el.querySelectorAll('li')].map(li => li.firstChild)).toEqual([nodes[2], nodes[0], nodes[1]]);
        root.dispose();
    });
});

describe('text components on dispose', () => {
    test('a text component disposed on its own drops its parts', async () => {
        const { root } = mount('metin');
        const t = root.controls.items[0];
        t.dispose();
        await settle();
        expect(t.isDisposed).toBe(true);
        expect(t.controls).toBeUndefined();
        expect(t.class).toBeUndefined();
        expect(t.attr).toBeUndefined();
        root.dispose();
    });

    test('texts disposed with their parent', async () => {
        const host: any = new Component('div');
        host.controls.add('a');
        host.controls.add(new Component('b'));
        const { root } = mount(host);
        const [t, b] = host.controls.items;
        root.dispose();
        await settle();
        expect(t.isDisposed).toBe(true);
        expect(b.isDisposed).toBe(true);
        expect(host.isDisposed).toBe(true);
    });

    test('clearing many rows with texts', async () => {
        const host: any = new Component('div');
        const { root } = mount(host);
        for (let i = 0; i < 50; i++) {
            const row: any = new Component('p');
            row.controls.add(String(i));
            row.controls.add(new Component('b'));
            row.controls.add('!');
            host.controls.add(row);
        }
        const texts = host.controls.items.flatMap((r: any) => r.controls.items.filter(isText));
        expect(texts).toHaveLength(100);
        await host.controls.clearAsync();
        expect(host.element.innerHTML).toBe('');
        expect(texts.every(t => t.isDisposed)).toBe(true);
        root.dispose();
    });
});
