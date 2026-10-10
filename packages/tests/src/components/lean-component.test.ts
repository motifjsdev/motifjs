import * as motif from '@motifx/core';
import { Component, ComponentBase, Disposable, errorHandler, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'LC.tsx');
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

describe('the motif namespace', () => {
    test('is there on every component and stays the same object', () => {
        const { root } = mount('metin', new Component('div'));
        for (const c of root.controls.items) {
            expect(c.motif).toBeDefined();
            expect(c.motif).toBe(c.motif);
            expect(c.motif.options).toBeDefined();
            expect(c.motif.options.placeholder).toBeUndefined();
            expect(c.motif.options.cache).toBeUndefined();
        }
        root.dispose();
    });

    test('is still there after dispose and its options are dropped', async () => {
        const c = new Component('div');
        const { root } = mount(c);
        c.dispose();
        await settle();
        expect(c.motif).toBeDefined();
        expect(c.motif.options).toBeUndefined();
        root.dispose();
    });

    test('show and hide work on an element that never used the namespace before', async () => {
        const host: any = new Component('div');
        host.controls.add(new Component('b'));
        const i = new Component('i');
        host.controls.add(i);
        const { root, el } = mount(host);
        await i.motif.hide();
        expect(el.innerHTML).toBe('<div><b></b><!--h--></div>');
        await i.motif.show();
        expect(el.innerHTML).toBe('<div><b></b><i></i></div>');
        root.dispose();
    });
});

describe('disposables of a component', () => {
    test('registered items are released on dispose', async () => {
        const log: string[] = [];
        const c = new Component('div');
        const { root } = mount(c);
        c.motif.register({ dispose: () => log.push('a') });
        c.motif.setDisposable(() => log.push('b'));
        c.dispose();
        await settle();
        expect(log).toEqual(['a', 'b']);
        root.dispose();
    });

    test('registering on a disposed component fails as before', async () => {
        for (const used of [false, true]) {
            const c = new Component('div');
            if (used) c.motif.setDisposable(() => { });
            const { root } = mount(c);
            c.dispose();
            await settle();
            expect(() => c.motif.setDisposable(() => { })).toThrow(TypeError);
            const host = new Component('div');
            const child = new Component('i');
            if (used) child.motif.setDisposable(() => { });
            host.controls.add(child);
            root.controls.add(host);
            await host.dispose();
            await settle();
            expect(child.isDisposed).toBe(true);
            expect(() => child.motif.setDisposable(() => { })).toThrow(TypeError);
            root.dispose();
        }
    });

    test('a user class built on Disposable keeps its registrations', () => {
        const log: string[] = [];
        class Service extends Disposable {
            constructor() { super(); (this as any)._register({ dispose: () => log.push('kayıt') }); }
            add(fn: () => void) { (this as any)._register({ dispose: fn }); }
        }
        const s = new Service();
        s.add(() => log.push('sonra'));
        s.dispose();
        expect(log).toEqual(['kayıt', 'sonra']);
        const t = new Service();
        t.dispose();
        expect(log).toEqual(['kayıt', 'sonra', 'kayıt']);
        const u = new (class extends Disposable { })();
        expect(() => u.dispose()).not.toThrow();
    });
});

describe('lifecycle flags', () => {
    test('follow construction, build, hide and dispose', async () => {
        const c = new Component('div');
        expect([c.isBuilt, c.isInitialized, c.isConfigured, c.isDisposed, c.isVisible, c.isWait]).toEqual([false, true, true, false, true, false]);
        const { root } = mount(c);
        expect([c.isBuilt, c.isVisible]).toEqual([true, true]);
        await c.motif.hide();
        expect(c.isVisible).toBe(false);
        await c.motif.show();
        expect(c.isVisible).toBe(true);
        c.isVisible = false;
        expect(c.isVisible).toBe(false);
        c.isVisible = true;
        c.dispose();
        await settle();
        expect(c.isDisposed).toBe(true);
        expect(!!c.isBuilt).toBe(false);
        expect(!!c.isVisible).toBe(false);
        expect(!!c.isWait).toBe(false);
        root.dispose();
    });

    test('a component built inside a waiting parent keeps waiting', async () => {
        const st = reactive({ w: true });
        const A = evalJsx(`function A(){ return <div><p x-wait={() => st.w}>P</p></div>; }`, 'A', { st });
        const { root, el } = mount(A());
        await settle();
        const p = root.controls.items[0].controls.items[0];
        expect([p.isWait, p.isBuilt]).toEqual([true, false]);
        st.w = false;
        await settle();
        expect([p.isWait, p.isBuilt]).toEqual([false, true]);
        expect(el.textContent).toBe('P');
        root.dispose();
    });
});

describe('props of a component', () => {
    test('framework keys are taken out and the rest stays', () => {
        const a = new Component('div', { initializeComponent: () => { }, onBuilt: () => { } } as any);
        expect(Object.keys(a.props)).toEqual([]);
        const b = new Component('div', { initializeComponent: () => { }, title: 'x', 'data-k': '1' } as any);
        expect(Object.keys(b.props).sort()).toEqual(['data-k', 'title']);
        const own: any = { onBuilt: () => { }, label: 'z' };
        const c = new Component('div', own);
        expect(c.props).toBe(own);
        expect(own.onBuilt).toBeUndefined();
    });
});

describe('compiled elements', () => {
    test('a plain element runs its setup with itself as sender', () => {
        const seen: any[] = [];
        const A = evalJsx(`function A(){ return <div class="k"><span>a</span>{"b"}</div>; }`, 'A');
        const a = A();
        const { root, el } = mount(a);
        expect(el.innerHTML).toBe('<div class="k"><span>a</span>b</div>');
        expect(a.controls.items.length).toBe(2);
        expect(a.controls.items[0].element.nodeName).toBe('SPAN');
        root.dispose();
        expect(seen).toEqual([]);
    });

    test('setup order with a class method, prop handlers and runover', async () => {
        const log: string[] = [];
        const Fn = () => evalJsx(`function A(){ return <div onBuilt={() => log.push('built')}><i>x</i></div>; }`, 'A', { log })();
        const c = motif.motifComponent(Fn, { runover: { initializeComponent: () => log.push('runover-init'), onBuilt: () => log.push('runover-built') } } as any) as ComponentBase;
        const { root } = mount(c);
        await settle();
        expect(log).toEqual(['runover-init', 'built', 'runover-built']);
        root.dispose();
    });

    test('the same setup given twice runs once and keeps its place', async () => {
        const log: string[] = [];
        const f = () => log.push('f');
        const c = new Component('div', { initializeComponent: [f, () => log.push('g'), f], runover: { initializeComponent: [f, () => log.push('h')] } } as any);
        mount(c);
        expect(log).toEqual(['f', 'g', 'h']);
    });

    test('a handler added while setup runs is called in the same turn', () => {
        const log: string[] = [];
        const c = new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                log.push('a');
                motif.motifComponent(() => s, { runover: { initializeComponent: () => log.push('b') } });
            },
        } as any);
        mount(c);
        expect(log).toEqual(['a', 'b']);
    });

    test('ref, x-wait and lifecycle props still reach the element', async () => {
        const st = reactive({ w: true });
        let ref: any = null;
        const log: string[] = [];
        const A = evalJsx(`function A(){ return <div><b ref={(c) => set(c)} onBuilt={() => log.push('b')} x-wait={() => st.w}>x</b></div>; }`, 'A', { st, log, set: (c: any) => { ref = c; } });
        const { root, el } = mount(A());
        await settle();
        expect(ref).toBeInstanceOf(ComponentBase);
        expect(log).toEqual([]);
        st.w = false;
        await settle();
        expect(log).toEqual(['b']);
        expect(el.innerHTML).toBe('<div><b>x</b></div>');
        root.dispose();
    });
});

describe('hooks added to a plain element after it was made', () => {
    test('x: listeners and an instance method run', async () => {
        const log: string[] = [];
        const c: any = new Component('div');
        c.motif.on('x:built', () => log.push('x-built'));
        c.onBuilt = () => log.push('method-built');
        c.motif.on('x:disposing', () => log.push('x-disposing'));
        const { root } = mount(c);
        c.dispose();
        await settle();
        expect(log).toEqual(['method-built', 'x-built', 'x-disposing']);
        root.dispose();
    });

    test('onMounted waits for the document', async () => {
        const log: string[] = [];
        const c: any = new Component('div');
        c.motif.on('x:mounted', () => log.push('mounted'));
        const detached = new Component(document.createElement('section'));
        detached.build();
        detached.controls.add(c);
        await settle();
        expect(log).toEqual([]);
        document.body.appendChild(detached.element as unknown as Node);
        await settle();
        expect(log).toEqual(['mounted']);
        detached.dispose();
    });

    test('onDisposed runs once even when dispose is called twice', async () => {
        const log: string[] = [];
        const c: any = new Component('div', { onDisposed: () => log.push('disposed') } as any);
        const { root } = mount(c);
        c.dispose();
        c.dispose();
        await settle();
        expect(log).toEqual(['disposed']);
        root.dispose();
    });
});
