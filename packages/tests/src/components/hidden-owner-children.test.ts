import * as motif from '@motifx/core';
import { Component, ComponentBase, motifFragment, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async () => { await tick(); await tick(); await tick(20); };

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'HO.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function host() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    return { el, root };
}

const connected = (c: ComponentBase) => !!(c.element as any).isConnected;
const html = (c: ComponentBase) => (c.element as HTMLElement).outerHTML;

describe('children added while their owner is hidden', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('owner hidden with isWait: the child stays out of view and appears when the wait ends', async () => {
        const { root } = host();
        const owner = new Component('div', {});
        owner.controls.add(new Component('b', {}));
        root.controls.add(owner);
        await settle();
        owner.isWait = true;
        await settle();
        const c = new Component('span', {});
        owner.controls.add(c);
        expect(connected(c)).toBe(false);
        owner.isWait = false;
        await settle();
        expect(connected(c)).toBe(true);
        expect(html(owner)).toBe('<div><b></b><span></span></div>');
    });

    test('owner hidden with x-display', async () => {
        const { root } = host();
        const st = reactive({ show: true });
        const owner = new Component('div', { 'x-display': () => st.show } as any);
        root.controls.add(owner);
        await settle();
        st.show = false;
        await settle();
        const c = new Component('span', {});
        owner.controls.add(c);
        expect(connected(c)).toBe(false);
        st.show = true;
        await settle();
        expect(connected(c)).toBe(true);
        expect(c.parent).toBe(owner);
    });

    test('owner waiting again with x-wait after it was built', async () => {
        const { root } = host();
        const st = reactive({ wait: false });
        const owner = new Component('div', { 'x-wait': () => st.wait } as any);
        root.controls.add(owner);
        await settle();
        st.wait = true;
        await settle();
        const c = new Component('span', {});
        owner.controls.add(c);
        expect(connected(c)).toBe(false);
        st.wait = false;
        await settle();
        expect(connected(c)).toBe(true);
    });

    test('a child inserted at the front while hidden keeps its place', async () => {
        const { root } = host();
        const owner = new Component('ul', {});
        owner.controls.add(new Component('li', {}), new Component('p', {}));
        root.controls.add(owner);
        await settle();
        owner.isWait = true;
        await settle();
        owner.controls.add(0, new Component('em', {}));
        owner.isWait = false;
        await settle();
        expect(html(owner)).toBe('<ul><em></em><li></li><p></p></ul>');
    });

    test('a child of a hidden component (isWait) gets its own new children', async () => {
        const { root } = host();
        const parent = new Component('div', {});
        const owner = new Component('section', {});
        parent.controls.add(owner);
        root.controls.add(parent);
        await settle();
        parent.isWait = true;
        await settle();
        const c = new Component('span', {});
        owner.controls.add(c);
        expect(connected(c)).toBe(false);
        parent.isWait = false;
        await settle();
        expect(connected(c)).toBe(true);
        expect(html(parent)).toBe('<div><section><span></span></section></div>');
    });

    test('a child of a hidden component (x-display) gets its own new children', async () => {
        const { root } = host();
        const st = reactive({ show: true });
        const parent = new Component('div', { 'x-display': () => st.show } as any);
        const owner = new Component('section', {});
        parent.controls.add(owner);
        root.controls.add(parent);
        await settle();
        st.show = false;
        await settle();
        const c = new Component('span', {});
        owner.controls.add(c);
        expect(connected(c)).toBe(false);
        st.show = true;
        await settle();
        expect(connected(c)).toBe(true);
    });

    test('deeper under a hidden component the child is placed as well', async () => {
        const { root } = host();
        const st = reactive({ show: true });
        const gp = new Component('div', { 'x-display': () => st.show } as any);
        const parent = new Component('section', {});
        const owner = new Component('ul', {});
        gp.controls.add(parent);
        parent.controls.add(owner);
        root.controls.add(gp);
        await settle();
        st.show = false;
        await settle();
        const c = new Component('li', {});
        owner.controls.add(c);
        expect(connected(c)).toBe(false);
        st.show = true;
        await settle();
        expect(connected(c)).toBe(true);
    });

    test('rows added to a hidden list show up when it is shown', async () => {
        const { root } = host();
        const st = reactive({ show: true, items: [] as string[] });
        const list = new Component('ul', { 'x-display': () => st.show } as any);
        list.bindings.list(() => st.items, (n: string) => new Component('li', { onElementCreating: () => { const li = document.createElement('li'); li.textContent = n; return li; } } as any));
        root.controls.add(list);
        await settle();
        st.show = false;
        await settle();
        st.items.push('a', 'b');
        await settle();
        st.show = true;
        await settle();
        expect((list.element as HTMLElement).textContent).toBe('ab');
        expect((list.element as HTMLElement).querySelectorAll('li').length).toBe(2);
    });

    test('a built component moved under a waiting parent keeps the children added to it', async () => {
        const { root } = host();
        const st = reactive({ wait: true });
        const waiting = new Component('div', { 'x-wait': () => st.wait } as any);
        root.controls.add(waiting);
        await settle();
        const owner = new Component('section', {});
        owner.controls.add(new Component('i', {}));
        owner.build();
        waiting.controls.add(owner);
        const c = new Component('span', {});
        owner.controls.add(c);
        st.wait = false;
        await settle();
        expect(connected(c)).toBe(true);
        expect(html(owner)).toBe('<section><i></i><span></span></section>');
    });

    test('a child with its own x-wait still waits for it', async () => {
        const { root } = host();
        const st = reactive({ childWait: true });
        const owner = new Component('div', {});
        root.controls.add(owner);
        await settle();
        owner.isWait = true;
        await settle();
        const c = new Component('span', { 'x-wait': () => st.childWait } as any);
        owner.controls.add(c);
        owner.isWait = false;
        await settle();
        expect(c.isBuilt).toBe(false);
        expect(connected(c)).toBe(false);
        st.childWait = false;
        await settle();
        expect(connected(c)).toBe(true);
    });

    test('a component waiting before its first build builds the children added meanwhile', async () => {
        const { root } = host();
        const st = reactive({ wait: true });
        const owner = new Component('div', { 'x-wait': () => st.wait } as any);
        root.controls.add(owner);
        await settle();
        const c = new Component('span', {});
        owner.controls.add(c);
        expect(owner.isBuilt).toBe(false);
        expect(c.isBuilt).toBe(false);
        st.wait = false;
        await settle();
        expect(connected(c)).toBe(true);
    });

    test('owner hidden with motif.hide()', async () => {
        const { root } = host();
        const owner = new Component('div', {});
        root.controls.add(owner);
        await settle();
        await owner.motif.hide();
        const c = new Component('span', {});
        owner.controls.add(c);
        expect(connected(c)).toBe(false);
        await owner.motif.show();
        await settle();
        expect(connected(c)).toBe(true);
    });
});

describe('children added while a fragment is hidden', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('hidden with motif.hide(): the new child is not shown until the fragment is', async () => {
        const { el, root } = host();
        const frag = motifFragment({});
        frag.controls.add(new Component('b', {}));
        root.controls.add(frag);
        await settle();
        await frag.motif.hide();
        await settle();
        const c = new Component('span', {});
        frag.controls.add(c);
        expect(connected(c)).toBe(false);
        expect(el.querySelector('span')).toBeNull();
        await frag.motif.show();
        await settle();
        expect(el.innerHTML).toBe('<!--[--><b></b><span></span><!--]-->');
    });

    test('hidden with isWait: the new child is not shown until the wait ends', async () => {
        const { el, root } = host();
        const frag = motifFragment({});
        frag.controls.add(new Component('b', {}));
        root.controls.add(frag);
        await settle();
        frag.isWait = true;
        await settle();
        const c = new Component('span', {});
        frag.controls.add(c);
        expect(connected(c)).toBe(false);
        frag.isWait = false;
        await settle();
        expect(el.innerHTML).toBe('<!--[--><b></b><span></span><!--]-->');
    });

    test('a visible fragment places new children at once', async () => {
        const { el, root } = host();
        const frag = motifFragment({});
        root.controls.add(frag);
        await settle();
        frag.controls.add(new Component('b', {}));
        expect(el.innerHTML).toBe('<!--[--><b></b><!--]-->');
    });
});

describe('JSX content inside hidden components', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a ternary that changes while its container is hidden shows the new branch', async () => {
        const st = reactive({ show: true, mode: 'a' });
        const A = evalJsx(`function A(){ return <div x-display={() => st.show}>{st.mode === 'a' ? <b>A</b> : <i>B</i>}</div>; }`, 'A', { st });
        const { el, root } = host();
        root.controls.add(A());
        await settle();
        st.show = false;
        await settle();
        st.mode = 'b';
        await settle();
        st.show = true;
        await settle();
        expect(el.innerHTML).toBe('<div><!--[--><i>B</i><!--]--></div>');
    });

    test('a ternary nested one level deeper', async () => {
        const st = reactive({ loading: false, ok: true });
        const A = evalJsx(`function A(){ return <div x-wait={() => st.loading}><p>{st.ok ? <b>ok</b> : <i>err</i>}</p></div>; }`, 'A', { st });
        const { el, root } = host();
        root.controls.add(A());
        await settle();
        st.loading = true;
        await settle();
        st.ok = false;
        await settle();
        st.loading = false;
        await settle();
        expect(el.innerHTML).toBe('<div><p><!--[--><i>err</i><!--]--></p></div>');
    });

    test('a list in a hidden tab shows the rows pushed while hidden', async () => {
        const st = reactive({ tab: 'a', items: [] as string[] });
        const A = evalJsx(`function A(){ return <main>
            <section x-display={() => st.tab === 'a'}>A</section>
            <ul x-display={() => st.tab === 'b'}>{st.items.map(i => <li>{i}</li>)}</ul>
        </main>; }`, 'A', { st });
        const { el, root } = host();
        root.controls.add(A());
        await settle();
        st.items.push('x', 'y');
        await settle();
        st.tab = 'b';
        await settle();
        expect(el.querySelector('ul')!.textContent).toBe('xy');
        expect(el.querySelector('section')).toBeNull();
    });

    test('rows replaced while x-wait holds show the new rows', async () => {
        const st = reactive({ loading: false, rows: ['r1', 'r2'] as string[] });
        const A = evalJsx(`function A(){ return <div x-wait={() => st.loading}><ul>{st.rows.map(r => <li>{r}</li>)}</ul></div>; }`, 'A', { st });
        const { el, root } = host();
        root.controls.add(A());
        await settle();
        st.loading = true;
        await settle();
        st.rows = ['n1', 'n2', 'n3'];
        await settle();
        st.loading = false;
        await settle();
        expect(el.querySelector('ul')!.textContent).toBe('n1n2n3');
    });

    test('content stays hidden while the container is hidden', async () => {
        const st = reactive({ show: true, mode: 'a' });
        const A = evalJsx(`function A(){ return <div id="box" x-display={() => st.show}>{st.mode === 'a' ? <b>A</b> : <i id="b">B</i>}</div>; }`, 'A', { st });
        const { el, root } = host();
        root.controls.add(A());
        await settle();
        st.show = false;
        await settle();
        st.mode = 'b';
        await settle();
        expect(el.querySelector('#box')).toBeNull();
        expect(el.querySelector('#b')).toBeNull();
    });
});
