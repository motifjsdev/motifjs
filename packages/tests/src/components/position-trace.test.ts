import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'PT.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(...children: ComponentBase[]) {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    for (const c of children) root.controls.add(c);
    return { root, el };
}

function shape(node: Node): string {
    const out: string[] = [];
    node.childNodes.forEach(n => {
        if (n.nodeType === Node.COMMENT_NODE) {
            const t = (n as Comment).data;
            if (t === 'h') out.push('#');
            else if (t === '[' || t === ']') return;
            else out.push(`<!--${t}-->`);
        } else if (n.nodeType === Node.TEXT_NODE) {
            if ((n as Text).data.trim()) out.push((n as Text).data.trim());
        } else {
            const el = n as Element;
            if (el.children.length === 0) out.push(el.textContent ?? '');
            else out.push(`${el.tagName.toLowerCase()}(${shape(el)})`);
        }
    });
    return out.join(' ');
}

const visibleTexts = (el: Element, sel = 'li') => Array.from(el.querySelectorAll(sel)).map(x => x.textContent).join(' ');
const traces = (el: Node) => {
    let n = 0;
    const walk = (x: Node) => x.childNodes.forEach(c => { if (c.nodeType === Node.COMMENT_NODE && (c as Comment).data === 'h') n++; walk(c); });
    walk(el);
    return n;
};

let seed = 5;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
function shuffle<T>(a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = rand() % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

afterEach(() => { document.body.innerHTML = ''; });

describe('a hidden or waiting component keeps its place with a trace', () => {
    test('an element that waits from the start', async () => {
        const st = reactive({ w: true });
        const A = evalJsx(`function A(){ return <div><b>1</b><p x-wait={() => st.w}>P</p><b>2</b></div>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        expect(shape(el)).toBe('div(1 # 2)');
        st.w = false;
        await settle();
        expect(shape(el)).toBe('div(1 P 2)');
    });

    test('an element hidden by x-display from the start', async () => {
        const st = reactive({ d: false });
        const A = evalJsx(`function A(){ return <div><b>1</b><p x-display={() => st.d}>P</p><b>2</b></div>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        expect(shape(el)).toBe('div(1 # 2)');
        st.d = true;
        await settle();
        expect(shape(el)).toBe('div(1 P 2)');
        st.d = false;
        await settle();
        expect(shape(el)).toBe('div(1 # 2)');
    });

    test('a fragment that waits from the start', async () => {
        const st = reactive({ w: true });
        const A = evalJsx(`function F(){ return <><i>a</i><i>b</i></>; } function A(){ return <div><b>1</b><F x-wait={() => st.w} /><b>2</b></div>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        expect(shape(el)).toBe('div(1 # 2)');
        st.w = false;
        await settle();
        expect(shape(el)).toBe('div(1 a b 2)');
    });

    test('several waiting siblings keep their order', async () => {
        const st = reactive({ a: true, b: true, c: true });
        const A = evalJsx(`function A(){ return <div><b>0</b><p x-wait={() => st.a}>A</p><p x-wait={() => st.b}>B</p><b>1</b><p x-wait={() => st.c}>C</p></div>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        expect(shape(el)).toBe('div(0 # # 1 #)');
        st.c = false;
        await settle();
        expect(shape(el)).toBe('div(0 # # 1 C)');
        st.b = false;
        await settle();
        expect(shape(el)).toBe('div(0 # B 1 C)');
        st.a = false;
        await settle();
        expect(shape(el)).toBe('div(0 A B 1 C)');
    });

    test('a waiting child added to a built parent', async () => {
        const host = new Component('div', {});
        const { el } = mount(host);
        const mk = (t: string) => new Component('p', { onElementCreating: () => { const p = document.createElement('p'); p.textContent = t; return p; } } as any);
        const a = mk('A'), b = mk('B'), c = mk('C');
        b.isWait = true;
        host.controls.add(a, b, c);
        await settle();
        expect(shape(el)).toBe('div(A # C)');
        b.isWait = false;
        await settle();
        expect(shape(el)).toBe('div(A B C)');
    });

    test('a waiting child added to a hidden fragment owner', async () => {
        const mk = (t: string) => new Component('p', { onElementCreating: () => { const p = document.createElement('p'); p.textContent = t; return p; } } as any);
        const div = new Component('div', {});
        const { el } = mount(div);
        const frag = (motif as any).motifFragment() as ComponentBase;
        div.controls.add(frag);
        frag.controls.add(mk('X'));
        await settle();
        await frag.motif.hide();
        const w = mk('W');
        w.isWait = true;
        frag.controls.add(w);
        await frag.motif.show();
        await settle();
        expect(visibleTexts(el, 'p')).toBe('X');
        expect(traces(el)).toBe(1);
        w.isWait = false;
        await settle();
        expect(visibleTexts(el, 'p')).toBe('X W');
        expect(traces(el)).toBe(0);
    });
});

describe('list rows keep their place with a trace', () => {
    test('a row hidden after the first render', async () => {
        const st = reactive({ rows: [1, 2, 3].map(n => ({ n, show: true })) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li x-display={() => r.show}>{r.n}</li>)}</ul>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        st.rows[1].show = false;
        await settle();
        expect(shape(el)).toBe('ul(1 # 3)');
        st.rows[1].show = true;
        await settle();
        expect(shape(el)).toBe('ul(1 2 3)');
    });

    test('a row that waits from the start', async () => {
        const st = reactive({ rows: [1, 2, 3].map(n => ({ n, wait: n === 2 })) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li x-wait={() => r.wait}>{r.n}</li>)}</ul>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        expect(shape(el)).toBe('ul(1 # 3)');
        st.rows[1].wait = false;
        await settle();
        expect(shape(el)).toBe('ul(1 2 3)');
    });

    test('reversing a list moves the trace of a waiting row', async () => {
        const st = reactive({ rows: [0, 1, 2, 3, 4, 5].map(i => ({ id: 'r' + i, wait: i === 2 })) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li x-wait={() => r.wait}>{r.id}</li>)}</ul>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        st.rows = st.rows.slice().reverse();
        await settle();
        expect(shape(el)).toBe('ul(r5 r4 r3 # r1 r0)');
        st.rows.find(r => r.id === 'r2')!.wait = false;
        await settle();
        expect(shape(el)).toBe('ul(r5 r4 r3 r2 r1 r0)');
    });

    test('shuffling with hidden rows keeps every row in its place', async () => {
        const st = reactive({ rows: Array.from({ length: 20 }, (_, i) => ({ id: 'r' + i, show: true })) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li x-display={() => r.show}>{r.id}</li>)}</ul>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        for (const i of [2, 5, 6, 11, 19]) st.rows[i].show = false;
        await settle();
        for (let round = 0; round < 15; round++) {
            st.rows = shuffle(st.rows.slice());
            await settle();
            expect(shape(el)).toBe('ul(' + st.rows.map(r => r.show ? r.id : '#').join(' ') + ')');
        }
        st.rows.forEach(r => { r.show = true; });
        await settle();
        expect(shape(el)).toBe('ul(' + st.rows.map(r => r.id).join(' ') + ')');
    });

    test('a row hidden with motif.hide stays hidden when the list is reordered', async () => {
        const st = reactive({ rows: [0, 1, 2, 3, 4, 5].map(i => ({ id: 'r' + i })) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li>{r.id}</li>)}</ul>; }`, 'A', { st });
        const ul = A() as ComponentBase;
        const { el } = mount(ul);
        await settle();
        const row = Array.from(document.querySelectorAll('li')).find(li => li.textContent === 'r2')!;
        let host: ComponentBase = ul;
        while (host.controls.items.length === 1) host = host.controls.items[0];
        const comp = host.controls.items.find(c => (c.element as unknown) === row)!;
        await comp.motif.hide();
        st.rows = st.rows.slice().reverse();
        await settle();
        expect(shape(el)).toBe('ul(r5 r4 r3 # r1 r0)');
        await comp.motif.show();
        await settle();
        expect(shape(el)).toBe('ul(r5 r4 r3 r2 r1 r0)');
    });

    test('rows with an explicit detach strategy leave no trace and still land in order', async () => {
        const st = reactive({ rows: [0, 1, 2, 3, 4, 5].map(i => ({ id: 'r' + i, show: i !== 2 })) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li options={{ hideStrategy: 'detach' }} x-display={() => r.show}>{r.id}</li>)}</ul>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        expect(shape(el)).toBe('ul(r0 r1 r3 r4 r5)');
        st.rows = st.rows.slice().reverse();
        await settle();
        expect(shape(el)).toBe('ul(r5 r4 r3 r1 r0)');
        st.rows.find(r => r.id === 'r2')!.show = true;
        await settle();
        expect(shape(el)).toBe('ul(r5 r4 r3 r2 r1 r0)');
    });

    test('removing hidden rows and clearing the list leaves no trace', async () => {
        const st = reactive({ rows: [0, 1, 2, 3, 4, 5].map(i => ({ id: 'r' + i, wait: i % 2 === 0 })) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li x-wait={() => r.wait}>{r.id}</li>)}</ul>; }`, 'A', { st });
        const { el } = mount(A());
        await settle();
        expect(traces(el)).toBe(3);
        st.rows = st.rows.filter(r => r.id !== 'r2');
        await settle();
        expect(shape(el)).toBe('ul(# r1 r3 # r5)');
        st.rows = [];
        await settle();
        expect(traces(el)).toBe(0);
        expect(el.querySelectorAll('li').length).toBe(0);
    });
});

describe('moving components keeps traces in step', () => {
    const mk = (t: string) => new Component('li', { onElementCreating: () => { const li = document.createElement('li'); li.textContent = t; return li; } } as any);
    const order = (c: ComponentBase) => c.controls.items.map(x => (x.element as unknown as Element).textContent).join(' ');

    test('controls.move carries the trace of a hidden component', async () => {
        const ul = new Component('ul', {});
        const { el } = mount(ul);
        const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(mk);
        ul.controls.add(a, b, c, d);
        await settle();
        await b.motif.hide();
        expect(shape(el)).toBe('ul(A # C D)');
        ul.controls.move(b, null);
        expect(shape(el)).toBe('ul(A C D #)');
        ul.controls.move(d, b);
        expect(shape(el)).toBe('ul(A C D #)');
        ul.controls.move(a, b);
        expect(shape(el)).toBe('ul(C D A #)');
        expect(order(ul)).toBe('C D A B');
        await b.motif.show();
        expect(shape(el)).toBe('ul(C D A B)');
    });

    test('controls.move before a hidden component lands before its trace', async () => {
        const ul = new Component('ul', {});
        const { el } = mount(ul);
        const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(mk);
        ul.controls.add(a, b, c, d);
        await settle();
        await c.motif.hide();
        ul.controls.move(d, c);
        expect(shape(el)).toBe('ul(A B D #)');
        ul.controls.move(a, c);
        expect(shape(el)).toBe('ul(B D A #)');
        await c.motif.show();
        expect(shape(el)).toBe('ul(B D A C)');
        expect(order(ul)).toBe('B D A C');
    });

    test('controls.move of a waiting component that was never built', async () => {
        const ul = new Component('ul', {});
        const { el } = mount(ul);
        const [a, b, c] = ['A', 'B', 'C'].map(mk);
        b.isWait = true;
        ul.controls.add(a, b, c);
        await settle();
        ul.controls.move(b, a);
        expect(shape(el)).toBe('ul(# A C)');
        b.isWait = false;
        await settle();
        expect(shape(el)).toBe('ul(B A C)');
    });
});

describe('disposing removes the trace', () => {
    test('a waiting element and a waiting fragment', async () => {
        const st = reactive({ w: true });
        const A = evalJsx(`function F(){ return <><i>a</i></>; } function A(){ return <div><b>1</b><p x-wait={() => st.w}>P</p><F x-wait={() => st.w} /><b>2</b></div>; }`, 'A', { st });
        const div = A() as ComponentBase;
        const { el } = mount(div);
        await settle();
        expect(shape(el)).toBe('div(1 # # 2)');
        div.controls.items[2].dispose();
        div.controls.items[1].dispose();
        await settle();
        expect(shape(el)).toBe('div(1 2)');
    });

    test('a hidden element', async () => {
        const st = reactive({ s: true });
        const A = evalJsx(`function A(){ return <div><b>1</b><p x-display={() => st.s}>P</p><b>2</b></div>; }`, 'A', { st });
        const div = A() as ComponentBase;
        const { el } = mount(div);
        await settle();
        st.s = false;
        await settle();
        expect(shape(el)).toBe('div(1 # 2)');
        div.controls.items[1].dispose();
        await settle();
        expect(shape(el)).toBe('div(1 2)');
    });
});
