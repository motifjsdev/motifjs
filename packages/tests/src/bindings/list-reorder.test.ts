import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'LR.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(child: ComponentBase, ...after: ComponentBase[]) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    root.controls.add(child);
    for (const a of after) root.controls.add(a);
    return { root, el };
}

function countMoves(node: Node) {
    let moves = 0;
    const orig = node.insertBefore.bind(node);
    (node as any).insertBefore = (a: any, b: any) => { moves++; return orig(a, b); };
    return () => moves;
}

function lisLength(seq: number[]) {
    const tails: number[] = [];
    for (const v of seq) {
        let lo = 0, hi = tails.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m] < v) lo = m + 1; else hi = m; }
        tails[lo] = v;
    }
    return tails.length;
}

let seed = 11;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
function shuffle<T>(a: T[]) { for (let i = a.length - 1; i > 0; i--) { const j = rand() % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'r' + i }));
const texts = (el: Element, sel = 'li') => Array.from(el.querySelectorAll(sel)).map(x => x.textContent).join(',');
const ids = (a: { id: string }[]) => a.map(x => x.id).join(',');
function listHost(c: ComponentBase): ComponentBase {
    while (c.controls.items.length === 1 && (c.controls.items[0].element as unknown as Node).nodeType === Node.COMMENT_NODE) c = c.controls.items[0];
    return c;
}
const itemTexts = (c: ComponentBase) => listHost(c).controls.items.map(x => (x.element as unknown as Element).textContent).join(',');

function listOf(st: { rows: { id: string }[] }) {
    const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li>{r.id}</li>)}</ul>; }`, 'A', { st });
    const ul = A() as ComponentBase;
    const { el } = mount(ul);
    return { ul, el, dom: ul.element as unknown as HTMLElement };
}

describe('reordering a bound list', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    const cases: [string, (a: any[]) => any[]][] = [
        ['reverse', a => a.reverse()],
        ['swap first and last', a => { [a[0], a[a.length - 1]] = [a[a.length - 1], a[0]]; return a; }],
        ['swap two in the middle', a => { [a[3], a[17]] = [a[17], a[3]]; return a; }],
        ['last to first', a => { a.unshift(a.pop()); return a; }],
        ['first to last', a => { a.push(a.shift()); return a; }],
        ['sort by text', a => a.sort((x, y) => x.id.localeCompare(y.id))],
        ['shuffle', a => shuffle(a)],
        ['shuffle again', a => shuffle(a)],
        ['identity', a => a],
    ];

    test.each(cases)('%s keeps DOM, items and rows in the same order with the fewest moves', async (_, mutate) => {
        const st = reactive({ rows: rows(30) });
        const { ul, dom } = listOf(st);
        await settle();
        const host = listHost(ul);
        const before = host.controls.items;
        const comps = new Map(host.controls.items.map(c => [(c.element as unknown as Element).textContent, c]));
        const prev = st.rows.map(r => r.id);
        const moves = countMoves(dom);
        const next = mutate(st.rows.slice());
        st.rows = next;
        await settle();
        expect(texts(dom)).toBe(ids(next));
        expect(itemTexts(ul)).toBe(ids(next));
        expect(host.controls.items).toBe(before);
        expect(host.controls.items.length).toBe(30);
        for (const c of host.controls.items) expect(comps.get((c.element as unknown as Element).textContent)).toBe(c);
        expect(moves()).toBe(30 - lisLength(next.map((r: any) => prev.indexOf(r.id))));
    });

    test('many reorders in a row stay consistent', async () => {
        const st = reactive({ rows: rows(12) });
        const { ul, dom } = listOf(st);
        await settle();
        for (let i = 0; i < 60; i++) {
            st.rows = shuffle(st.rows.slice());
            await settle();
            expect(texts(dom)).toBe(ids(st.rows));
            expect(itemTexts(ul)).toBe(ids(st.rows));
        }
    });

    test('rows that stay in place are not touched', async () => {
        const st = reactive({ rows: rows(10) });
        const { dom } = listOf(st);
        await settle();
        const lis = Array.from(dom.children);
        const seen: Node[] = [];
        const orig = dom.insertBefore.bind(dom);
        (dom as any).insertBefore = (a: any, b: any) => { seen.push(a); return orig(a, b); };
        const next = st.rows.slice();
        [next[1], next[8]] = [next[8], next[1]];
        st.rows = next;
        await settle();
        expect(seen.length).toBe(2);
        expect(seen).toEqual(expect.arrayContaining([lis[1], lis[8]]));
    });

    test('focus in a row that stays in place is kept', async () => {
        const st = reactive({ rows: rows(10) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li><input value={r.id} /></li>)}</ul>; }`, 'A', { st });
        const ul = A() as ComponentBase;
        mount(ul);
        await settle();
        const input = (ul.element as unknown as HTMLElement).querySelectorAll('input')[5] as HTMLInputElement;
        input.focus();
        expect(document.activeElement).toBe(input);
        const next = st.rows.slice();
        [next[0], next[9]] = [next[9], next[0]];
        st.rows = next;
        await settle();
        expect(document.activeElement).toBe(input);
        expect(Array.from((ul.element as unknown as HTMLElement).querySelectorAll('input')).map(i => i.value).join(',')).toBe(ids(next));
    });

    test('keyed rows', async () => {
        const st = reactive({ rows: rows(15) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li key={r.id}>{r.id}</li>)}</ul>; }`, 'A', { st });
        const ul = A() as ComponentBase;
        mount(ul);
        await settle();
        for (let i = 0; i < 10; i++) {
            st.rows = shuffle(st.rows.slice());
            await settle();
            expect(texts(ul.element as unknown as Element)).toBe(ids(st.rows));
            expect(itemTexts(ul)).toBe(ids(st.rows));
        }
    });

    test('primitive rows with repeated values', async () => {
        const st = reactive({ rows: ['a', 'b', 'a', 'c', 'b', 'd'] });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li>{r}</li>)}</ul>; }`, 'A', { st });
        const ul = A() as ComponentBase;
        mount(ul);
        await settle();
        for (const next of [['d', 'b', 'c', 'a', 'b', 'a'], ['a', 'a', 'b', 'b', 'c', 'd'], ['b', 'a', 'd', 'c', 'a', 'b']]) {
            st.rows = next;
            await settle();
            expect(texts(ul.element as unknown as Element)).toBe(next.join(','));
            expect(itemTexts(ul)).toBe(next.join(','));
        }
    });

    test('fragment rows move as whole ranges', async () => {
        const st = reactive({ rows: rows(8) });
        const A = evalJsx(`function A(){ return <div>{st.rows.map(r => <><b>{r.id}</b><i>{r.id}</i></>)}</div>; }`, 'A', { st });
        const div = A() as ComponentBase;
        mount(div);
        await settle();
        const order = () => Array.from((div.element as unknown as HTMLElement).children).map(x => x.tagName + x.textContent).join(',');
        for (const mutate of [(a: any[]) => a.reverse(), (a: any[]) => shuffle(a), (a: any[]) => { a.push(a.shift()); return a; }]) {
            st.rows = mutate(st.rows.slice());
            await settle();
            expect(order()).toBe(st.rows.map(r => `B${r.id},I${r.id}`).join(','));
        }
    });

    test('a list inside a fragment stays before the next sibling', async () => {
        const st = reactive({ rows: rows(8) });
        const A = evalJsx(`function A(){ return <>{st.rows.map(r => <li>{r.id}</li>)}</>; }`, 'A', { st });
        const frag = A() as ComponentBase;
        const end = new Component('li', { onElementCreating: () => { const li = document.createElement('li'); li.textContent = 'end'; return li; } } as any);
        const { el } = mount(frag, end);
        await settle();
        for (const mutate of [(a: any[]) => a.reverse(), (a: any[]) => shuffle(a), (a: any[]) => { a.unshift(a.pop()); return a; }]) {
            st.rows = mutate(st.rows.slice());
            await settle();
            expect(texts(el)).toBe(ids(st.rows) + ',end');
            expect(itemTexts(frag)).toBe(ids(st.rows));
        }
    });

    test('nested lists reorder independently', async () => {
        const st = reactive({ groups: [0, 1, 2, 3].map(g => ({ id: 'g' + g, rows: [0, 1, 2, 3].map(i => ({ id: `g${g}r${i}` })) })) });
        const A = evalJsx(`function A(){ return <div>{st.groups.map(g => <section><h3>{g.id}</h3><ul>{g.rows.map(r => <li>{r.id}</li>)}</ul></section>)}</div>; }`, 'A', { st });
        const div = A() as ComponentBase;
        const { el } = mount(div);
        await settle();
        const expected = () => st.groups.map(g => g.id + ':' + ids(g.rows)).join('|');
        const actual = () => Array.from(el.querySelectorAll('section')).map(s => s.querySelector('h3')!.textContent + ':' + texts(s)).join('|');
        st.groups = st.groups.slice().reverse();
        await settle();
        expect(actual()).toBe(expected());
        st.groups[1].rows = st.groups[1].rows.slice().reverse();
        await settle();
        expect(actual()).toBe(expected());
        st.groups = shuffle(st.groups.slice());
        st.groups[0].rows = shuffle(st.groups[0].rows.slice());
        await settle();
        expect(actual()).toBe(expected());
    });

    test('reorder mixed with added and removed rows', async () => {
        const st = reactive({ rows: rows(10) });
        const { ul, dom } = listOf(st);
        await settle();
        const next = st.rows.slice().reverse();
        next.splice(3, 2, { id: 'x1' }, { id: 'x2' }, { id: 'x3' });
        st.rows = next;
        await settle();
        expect(texts(dom)).toBe(ids(next));
        expect(itemTexts(ul)).toBe(ids(next));
        const again = shuffle(st.rows.slice());
        again.pop();
        st.rows = again;
        await settle();
        expect(texts(dom)).toBe(ids(again));
        expect(itemTexts(ul)).toBe(ids(again));
    });

    test('rows that are reordered keep their reactivity', async () => {
        const st = reactive({ rows: rows(5).map(r => ({ ...r, n: 0 })) });
        const A = evalJsx(`function A(){ return <ul>{st.rows.map(r => <li>{() => r.id + ':' + r.n}</li>)}</ul>; }`, 'A', { st });
        const ul = A() as ComponentBase;
        mount(ul);
        await settle();
        st.rows = st.rows.slice().reverse();
        await settle();
        st.rows[0].n = 7;
        st.rows[4].n = 9;
        await settle();
        expect(texts(ul.element as unknown as Element)).toBe('r4:7,r3:0,r2:0,r1:0,r0:9');
    });
});
