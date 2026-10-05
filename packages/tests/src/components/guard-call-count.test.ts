/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive, errorHandler } from '@motifx/core';

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

const tick = () => new Promise(r => setTimeout(r, 10));

let reported: any[];
let unbind: () => void;

beforeEach(() => {
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
});

afterEach(() => {
    unbind();
    document.body.innerHTML = '';
});

function mount(child: Component) {
    const host = new Component(document.body.appendChild(document.createElement('div')));
    host.build();
    host.controls.add(child);
    return host;
}

const q = (host: Component, sel: string) => (host.element as HTMLElement).querySelector(sel) as HTMLElement | null;

function counter<T>(read: () => T) {
    const fn = (() => { fn.calls++; return read(); }) as (() => T) & { calls: number };
    fn.calls = 0;
    return fn;
}

describe('a call inside a generated getter runs once per evaluation', () => {
    test('x-display={check()}', async () => {
        const s = reactive({ on: true });
        const check = counter(() => s.on);
        const A = evalJsx(`function A(){ return <section><p id="t" x-display={check()}>x</p></section>; }`, 'A', { check });
        const host = mount(A());
        const initial = check.calls;
        expect(initial).toBeGreaterThan(0);
        expect(q(host, '#t')).not.toBeNull();
        s.on = false;
        await tick();
        expect(check.calls - initial).toBe(1);
        expect(q(host, '#t')).toBeNull();
        s.on = true;
        await tick();
        expect(check.calls - initial).toBe(2);
        expect(q(host, '#t')).not.toBeNull();
        expect(reported).toEqual([]);
    });

    test('x-wait={svc.isBusy()}', async () => {
        const s = reactive({ ready: false });
        const svc = { isBusy: counter(() => s.ready) };
        const A = evalJsx(`function A(){ return <section><p id="t" x-wait={svc.isBusy()}>x</p></section>; }`, 'A', { svc });
        const host = mount(A());
        const initial = svc.isBusy.calls;
        expect(q(host, '#t')).not.toBeNull();
        s.ready = true;
        await tick();
        expect(svc.isBusy.calls - initial).toBe(1);
        expect(q(host, '#t')).toBeNull();
        expect(reported).toEqual([]);
    });

    test('nested calls: store.get(key()).ready()', async () => {
        const s = reactive({ on: true });
        const key = counter(() => 'k');
        const entry = { ready: counter(() => s.on) };
        const store = { get: counter((..._a: any[]) => entry) };
        const A = evalJsx(`function A(){ return <section><p id="t" x-display={store.get(key()).ready()}>x</p></section>; }`, 'A', { store, key });
        const host = mount(A());
        const base = [key.calls, store.get.calls, entry.ready.calls];
        s.on = false;
        await tick();
        expect([key.calls - base[0], store.get.calls - base[1], entry.ready.calls - base[2]]).toEqual([1, 1, 1]);
        expect(q(host, '#t')).toBeNull();
        expect(reported).toEqual([]);
    });

    test('x-text={fmt()}', async () => {
        const s = reactive({ n: 1 });
        const fmt = counter(() => `n=${s.n}`);
        const A = evalJsx(`function A(){ return <section><p id="t" x-text={fmt()}></p></section>; }`, 'A', { fmt });
        const host = mount(A());
        const initial = fmt.calls;
        expect(q(host, '#t')!.textContent).toBe('n=1');
        s.n = 2;
        await tick();
        expect(fmt.calls - initial).toBe(1);
        expect(q(host, '#t')!.textContent).toBe('n=2');
        expect(reported).toEqual([]);
    });

    test('reactive attribute title={o.label()}', async () => {
        const s = reactive({ n: 1 });
        const o = { label: counter(() => `t${s.n}`) };
        const A = evalJsx(`function A(){ return <section><p id="t" title={o.label()}>x</p></section>; }`, 'A', { o });
        const host = mount(A());
        const initial = o.label.calls;
        expect(q(host, '#t')!.getAttribute('title')).toBe('t1');
        s.n = 2;
        await tick();
        expect(o.label.calls - initial).toBe(1);
        expect(q(host, '#t')!.getAttribute('title')).toBe('t2');
        expect(reported).toEqual([]);
    });

    test('list source items().map', async () => {
        const s = reactive({ list: ['a', 'b'] as string[] });
        const items = counter(() => s.list);
        const A = evalJsx(`function A(){ return <ul id="t">{items().map(i => <li key={i}>{i}</li>)}</ul>; }`, 'A', { items });
        const host = mount(A());
        const initial = items.calls;
        expect(q(host, '#t')!.querySelectorAll('li').length).toBe(2);
        s.list = ['a', 'b', 'c'];
        await tick();
        expect(items.calls - initial).toBe(1);
        expect(q(host, '#t')!.querySelectorAll('li').length).toBe(3);
        expect(reported).toEqual([]);
    });

    test('child condition {ok() && <b/>}', async () => {
        const s = reactive({ on: false });
        const ok = counter(() => s.on);
        const A = evalJsx(`function A(){ return <section id="t">{ok() && <b>y</b>}</section>; }`, 'A', { ok });
        const host = mount(A());
        const initial = ok.calls;
        expect(q(host, '#t b')).toBeNull();
        s.on = true;
        await tick();
        expect(ok.calls - initial).toBe(1);
        expect(q(host, '#t b')).not.toBeNull();
        expect(reported).toEqual([]);
    });

    test('a call in a comparison: x-display={count() > 0}', async () => {
        const s = reactive({ n: 1 });
        const count = counter(() => s.n);
        const A = evalJsx(`function A(){ return <section><p id="t" x-display={count() > 0}>x</p></section>; }`, 'A', { count });
        const host = mount(A());
        const initial = count.calls;
        s.n = 0;
        await tick();
        expect(count.calls - initial).toBe(1);
        expect(q(host, '#t')).toBeNull();
        expect(reported).toEqual([]);
    });

    test('calls the user wrote twice still run twice', async () => {
        const s = reactive({ n: 1 });
        const g = counter(() => s.n);
        const f = (a: number, b: number) => `${a + b}`;
        const A = evalJsx(`function A(){ return <section><p id="t" x-text={f(g(), g())}></p></section>; }`, 'A', { f, g });
        const host = mount(A());
        const initial = g.calls;
        expect(q(host, '#t')!.textContent).toBe('2');
        s.n = 2;
        await tick();
        expect(g.calls - initial).toBe(2);
        expect(q(host, '#t')!.textContent).toBe('4');
        expect(reported).toEqual([]);
    });
});

describe('guard semantics stay the same', () => {
    test('null and undefined fall back to the directive default', async () => {
        const s = reactive({ v: null as any });
        const check = counter(() => s.v);
        const A = evalJsx(`function A(){ return <section><p id="t" x-display={check()}>x</p></section>; }`, 'A', { check });
        const host = mount(A());
        expect(q(host, '#t')).not.toBeNull();
        s.v = false;
        await tick();
        expect(q(host, '#t')).toBeNull();
        s.v = undefined;
        await tick();
        expect(q(host, '#t')).not.toBeNull();
        expect(reported).toEqual([]);
    });

    test('a returned function is unwrapped and called once', async () => {
        const s = reactive({ on: true });
        const inner = counter(() => s.on);
        const check = counter(() => inner);
        const A = evalJsx(`function A(){ return <section><p id="t" x-display={check()}>x</p></section>; }`, 'A', { check });
        const host = mount(A());
        const base = [check.calls, inner.calls];
        s.on = false;
        await tick();
        expect([check.calls - base[0], inner.calls - base[1]]).toEqual([1, 1]);
        expect(q(host, '#t')).toBeNull();
        expect(reported).toEqual([]);
    });

    test('a missing link short-circuits without calling', async () => {
        const s = reactive({ store: null as any });
        const A = evalJsx(`function A(){ return <section><p id="u" x-display={s.store.get().ready()}>u</p></section>; }`, 'A', { s });
        const host = mount(A());
        expect(q(host, '#u')).not.toBeNull();
        const get = counter(() => ({ name: 'x', ready: () => false }));
        s.store = { get };
        await tick();
        expect(q(host, '#u')).toBeNull();
        expect(reported).toEqual([]);
    });
});
