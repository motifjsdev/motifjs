import * as motif from '@motifx/core';
import { Component, ComponentBase, FragmentNode, motifComponent, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}, strict = false) {
    const out = new CompilerCtor().start(source, 'IR.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    const fn = new Function(...names, `${strict ? '"use strict";\n' : ''}${code}\nreturn ${exportName};`);
    return fn(...values);
}

function mount(child: any): { host: HTMLElement; root: Component } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

describe('initializeComponent', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('the class member is called once during build, before view()', async () => {
        const log: any[] = [];
        const A = evalJsx(`
            class Panel extends Component {
                constructor(p){ super('section', p); }
                initializeComponent(sender){ log.push(['init', sender === this, this.isBuilt]); }
                view(){ log.push(['view']); return <b />; }
            }
            function A(){ return <Panel />; }`, 'A', { log });
        const { root } = mount(A());
        expect(log).toEqual([['init', true, false], ['view']]);
        await root.dispose();
    });

    test('a class that declares only setup() is not called: there is no alias', async () => {
        let called = 0;
        class Old extends Component {
            constructor() { super('div'); }
            setup() { called++; }
        }
        const { root } = mount(new Old());
        const c = new Component('div', { setup: (s: ComponentBase) => { called++; } } as any);
        root.controls.add(c);
        expect(called).toBe(0);
        await root.dispose();
    });

    test('the prop is called once with the tag component on plain, class and function tags', async () => {
        const got: Record<string, any[]> = { plain: [], cls: [], fn: [] };
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function Inner(){ return <section class="inner" />; }
            function A(){
                return <div>
                    <p initializeComponent={(s) => got.plain.push(s)} />
                    <Box initializeComponent={(s) => got.cls.push(s)} />
                    <Inner initializeComponent={(s) => got.fn.push(s)} />
                </div>;
            }`, 'A', { got });
        const { host, root } = mount(A());
        for (const key of Object.keys(got)) {
            expect([key, got[key].length]).toEqual([key, 1]);
        }
        expect(got.plain[0].element).toBe(host.querySelector('p'));
        expect(got.cls[0].element).toBe(host.querySelector('article'));
        expect(got.fn[0].element).toBe(host.querySelector('section.inner'));
        expect(host.querySelector('section.inner')!.hasAttribute('initializeComponent')).toBe(false);
        await root.dispose();
    });

    test('on a function tag the user and the compiled initializeComponent both run, in the class tag order', async () => {
        const log: Record<string, string[]> = { cls: [], fn: [] };
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function Inner(){ return <section />; }
            function A(){
                return <div>
                    <Box on:ping={() => log.cls.push('compiled')} initializeComponent={(s) => { log.cls.push('user'); s.motif.trigger('ping', {}); }} />
                    <Inner on:ping={() => log.fn.push('compiled')} initializeComponent={(s) => { log.fn.push('user'); s.motif.trigger('ping', {}); }} />
                </div>;
            }`, 'A', { log });
        const { host, root } = mount(A());
        expect(log.cls).toEqual(['user']);
        expect(log.fn).toEqual(log.cls);
        const box = root.controls.items[0].controls.items[0] as ComponentBase;
        const inner = root.controls.items[0].controls.items[1] as ComponentBase;
        expect(inner.element).toBe(host.querySelector('section'));
        box.motif.trigger('ping', {});
        inner.motif.trigger('ping', {});
        expect(log.cls).toEqual(['user', 'compiled']);
        expect(log.fn).toEqual(log.cls);
        await root.dispose();
    });

    test('a function tag with a directive and a user initializeComponent applies both to the returned root', async () => {
        const st = reactive({ label: 'a' });
        const got: any[] = [];
        const A = evalJsx(`
            function Inner(){ return <section />; }
            function A(){ return <div><Inner x-text={() => st.label} initializeComponent={(s) => got.push(s)} /></div>; }`, 'A', { st, got });
        const { host, root } = mount(A());
        const section = host.querySelector('section')!;
        expect(got.length).toBe(1);
        expect(got[0].element).toBe(section);
        expect(section.textContent).toBe('a');
        st.label = 'b';
        await tick();
        expect(section.textContent).toBe('b');
        await root.dispose();
    });

    test('manual construction: props and runover initializeComponent both run, the component method first', async () => {
        const log: string[] = [];
        class Manual extends Component {
            constructor(p: any) { super('div', p); }
            initializeComponent() { log.push('method'); }
        }
        const c = new Manual({
            initializeComponent: () => log.push('prop'),
            runover: { initializeComponent: [() => log.push('runover:1'), () => log.push('runover:2')] }
        });
        const { root } = mount(c);
        expect(log).toEqual(['method', 'prop', 'runover:1', 'runover:2']);
        expect((c.props as any).initializeComponent).toBeUndefined();
        await root.dispose();
    });

    test('FragmentNode places its childs and nodes through initializeComponent', async () => {
        const a = new Component('i');
        const b = new Component('u');
        const frag = new FragmentNode({ nodes: [a], initializeComponent: (s: ComponentBase) => { s.controls.add(b); } } as any);
        const { host, root } = mount(frag);
        expect(host.querySelector('i')).not.toBeNull();
        expect(host.querySelector('u')).not.toBeNull();
        await root.dispose();
    });
});

describe('x-initializing / x-initialized on a function component tag', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test.each([
        ['x-initializing', 'x-initialized'],
        ['x:initializing', 'x:initialized'],
        ['oninitializing', 'oninitialized'],
        ['onInitializing', 'onInitialized'],
    ])('%s / %s fire once on the returned root', async (a, b) => {
        const log: any[] = [];
        const A = evalJsx(`
            function Inner(){ return <section class="r" />; }
            function A(){ return <div><Inner ${a}={(s, e) => log.push(['initializing', s, e])} ${b}={(s, e) => log.push(['initialized', s, e])} /></div>; }`, 'A', { log });
        const { host, root } = mount(A());
        expect(log.map(x => x[0])).toEqual(['initializing', 'initialized']);
        expect(log[0][1].element).toBe(host.querySelector('section.r'));
        expect(log[1][1]).toBe(log[0][1]);
        expect(log[0][2]).toEqual({ cancel: false });
        await root.dispose();
    });

    test('the order of tag hooks matches the class tag order', async () => {
        const seq: Record<string, string[]> = { cls: [], fn: [] };
        const hooks = (k: string) => `ref={() => seq.${k}.push('ref')} x-initializing={() => seq.${k}.push('initializing')} x-initialized={() => seq.${k}.push('initialized')} onconfig={() => seq.${k}.push('config')} onbuilding={() => seq.${k}.push('building')} initializeComponent={() => seq.${k}.push('initializeComponent')} onbuilt={() => seq.${k}.push('built')}`;
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function Inner(){ return <section />; }
            function A(){
                return <div>
                    <Box ${hooks('cls')} />
                    <Inner ${hooks('fn')} />
                </div>;
            }`, 'A', { seq });
        const { root } = mount(A());
        await tick();
        expect(seq.cls).toEqual(['ref', 'initializing', 'initialized', 'config', 'building', 'initializeComponent', 'built']);
        expect(seq.fn).toEqual(seq.cls);
        await root.dispose();
    });

    test('a function that spreads its props onto the root fires each hook once', async () => {
        const log: string[] = [];
        const A = evalJsx(`
            function Spread(props){ return <nav {...props} />; }
            function A(){ return <div><Spread x-initializing={() => log.push('initializing')} oninitialized={() => log.push('initialized')} /></div>; }`, 'A', { log });
        const { root } = mount(A());
        expect(log).toEqual(['initializing', 'initialized']);
        await root.dispose();
    });

    test('a class tag whose constructor ignores props still gets the hooks once', async () => {
        const log: any[] = [];
        const A = evalJsx(`
            class Deaf extends Component {
                constructor(){ super('aside'); }
            }
            function A(){ return <div><Deaf x-initializing={(s) => log.push(['initializing', s])} x-initialized={(s) => log.push(['initialized', s])} /></div>; }`, 'A', { log });
        const { host, root } = mount(A());
        expect(log.map(x => x[0])).toEqual(['initializing', 'initialized']);
        expect(log[0][1].element).toBe(host.querySelector('aside'));
        await root.dispose();
    });
});

describe('ref is kept out of props and applied only where it was given', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('function component spreading {...props}: ref runs once on the returned root and never reaches props', async () => {
        const calls: any[] = [];
        const seen: any[] = [];
        const A = evalJsx(`
            function Leaf(props){ seen.push(['leaf', props.ref, props.runover && props.runover.ref]); return <em />; }
            function Outer(props){ seen.push(['outer', props.ref, props.runover && props.runover.ref]); return <div class="outer"><Leaf {...props} /></div>; }
            function A(){ return <main><Outer title="x" ref={(c) => calls.push(c)} /></main>; }`, 'A', { calls, seen });
        const { host, root } = mount(A());
        expect(calls.length).toBe(1);
        expect(calls[0].element).toBe(host.querySelector('div.outer'));
        expect(seen).toEqual([['outer', undefined, undefined], ['leaf', undefined, undefined]]);
        await root.dispose();
    });

    test('function component spreading {...props} onto an inner plain tag: the plain tag gets no ref', async () => {
        const calls: any[] = [];
        const A = evalJsx(`
            function Outer(props){ return <div class="outer"><i {...props} /></div>; }
            function A(){ return <main><Outer ref={(c) => calls.push(c)} /></main>; }`, 'A', { calls });
        const { host, root } = mount(A());
        expect(calls.length).toBe(1);
        expect(calls[0].element).toBe(host.querySelector('div.outer'));
        expect(host.querySelector('i')!.hasAttribute('ref')).toBe(false);
        await root.dispose();
    });

    test('class component spreading {...this.props}: ref runs once on the component and this.props.ref is undefined', async () => {
        const calls: any[] = [];
        const seen: any[] = [];
        const A = evalJsx(`
            class Leaf extends Component {
                constructor(p){ super('em', p); seen.push(['leaf', p.ref, this.props.ref]); }
            }
            class Card extends Component {
                constructor(p){ super('section', p); seen.push(['card', this.props.ref, this.props.runover]); }
                view(){ return <Leaf {...this.props} />; }
            }
            function A(){ return <main><Card title="t" ref={(c) => calls.push(c)} /></main>; }`, 'A', { calls, seen });
        const { host, root } = mount(A());
        expect(calls.length).toBe(1);
        expect(calls[0].element).toBe(host.querySelector('section'));
        expect(seen).toEqual([['card', undefined, undefined], ['leaf', undefined, undefined]]);
        expect((calls[0].props as any).title).toBe('t');
        await root.dispose();
    });

    test('ref={this.x} assignment form on class and function tags', async () => {
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function Inner(props){ return <section {...props} />; }
            class A extends Component {
                constructor(){ super('div'); this.box = null; this.inner = null; }
                view(){ return <div><Box ref={this.box} /><Inner ref={this.inner} /></div>; }
            }`, 'A');
        const a = new A();
        const { host, root } = mount(a);
        expect(a.box.element).toBe(host.querySelector('article'));
        expect(a.inner.element).toBe(host.querySelector('section'));
        expect(a.box.props.ref).toBeUndefined();
        expect(a.inner.props.ref).toBeUndefined();
        await root.dispose();
    });

    test('forwarding to an inner element goes through a separately named prop (inputRef)', async () => {
        const A = evalJsx(`
            function SearchBox(props){
                return <div class="search"><input ref={(c) => props.inputRef?.(c)} placeholder={props.placeholder} /></div>;
            }
            class Toolbar extends Component {
                constructor(){ super('header'); this.search = null; this.box = null; }
                view(){ return <SearchBox ref={this.box} inputRef={(c) => this.search = c} placeholder="Ara" />; }
            }`, 'Toolbar');
        const t = new A();
        const { host, root } = mount(t);
        expect(t.box.element).toBe(host.querySelector('div.search'));
        expect(t.search.element).toBe(host.querySelector('input'));
        expect(host.querySelector('input')!.getAttribute('placeholder')).toBe('Ara');
        await root.dispose();
    });

    test('ref + x-ref + x:ref on a function tag run once each, in source order, on the root', async () => {
        const log: any[] = [];
        const A = evalJsx(`
            function Inner(props){ return <section {...props} />; }
            function A(){ return <div><Inner x-ref={(c) => log.push(['a', c])} ref={(c) => log.push(['b', c])} x:ref={(c) => log.push(['c', c])} /></div>; }`, 'A', { log });
        const { host, root } = mount(A());
        expect(log.map(x => x[0])).toEqual(['a', 'b', 'c']);
        for (const entry of log) expect(entry[1].element).toBe(host.querySelector('section'));
        await root.dispose();
    });

    test('plain tag: ref is applied to that element component once and is not an attribute', async () => {
        const calls: any[] = [];
        const A = evalJsx(`function A(){ return <div><p x-ref={(c) => calls.push(['x', c])} ref={(c) => calls.push(['r', c])} /></div>; }`, 'A', { calls });
        const { host, root } = mount(A());
        expect(calls.map(x => x[0])).toEqual(['x', 'r']);
        expect(calls[0][1].element).toBe(host.querySelector('p'));
        expect(calls[0][1].props.ref).toBeUndefined();
        expect(host.querySelector('p')!.hasAttribute('ref')).toBe(false);
        await root.dispose();
    });

    test('manual construction: new X({ ref }) applies to the component itself and leaves no ref in this.props', async () => {
        const got: any[] = [];
        class Box extends Component {
            constructor(p: any) { super('article', p); }
        }
        const fn = (c: any) => got.push(c);
        const box = new Box({ ref: fn, title: 'b' });
        const plain = new Component('div', { ref: fn } as any);
        expect(got).toEqual([box, plain]);
        expect((box.props as any).ref).toBeUndefined();
        expect((box.props as any).title).toBe('b');
        expect((plain.props as any).ref).toBeUndefined();
        const { root } = mount(box);
        root.controls.add(plain);
        expect(got.length).toBe(2);
        await root.dispose();
    });

    test('inside ref a class component already has its props, its tag attributes and its options', async () => {
        const seen: any[] = [];
        const read = (c: any) => seen.push({ title: c.props?.title, cls: c.element.className, strategy: c.motif.options.hideStrategy });
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            class Tagged extends Component<HTMLDivElement> {}
            function A(){
                return <div>
                    <Box title="t" class="c" options={{ hideStrategy: 'detach' }} ref={read} />
                    <Tagged title="t" class="c" options={{ hideStrategy: 'detach' }} ref={read} />
                </div>;
            }`, 'A', { read });
        const { root } = mount(A());
        class Manual extends Component {
            constructor(p: any) { super('section', p); }
        }
        new Manual({ title: 't', class: 'c', options: { hideStrategy: 'detach' }, ref: read } as any);
        expect(seen).toEqual([
            { title: 't', cls: 'c', strategy: 'detach' },
            { title: 't', cls: 'c', strategy: 'detach' },
            { title: 't', cls: 'c', strategy: 'detach' },
        ]);
        await root.dispose();
    });

    test('subclass fields are set after ref: JavaScript initializes them once the base constructor returns', async () => {
        const seen: any[] = [];
        class Ctl extends Component {
            marker = 'ready';
            constructor(p: any) { super('div', p); }
        }
        const c = new Ctl({ ref: (x: any) => seen.push(x.marker) } as any);
        expect(seen).toEqual([undefined]);
        expect(c.marker).toBe('ready');
    });

    test('a ref given inside runover is used as well, once, on the component it was given to', async () => {
        const got: string[] = [];
        class Box extends Component {
            constructor(p: any) { super('article', p); }
        }
        const Fn = (p: any) => {
            got.push('props:' + String(p.ref) + ':' + String(p.runover && p.runover.ref));
            return new Component('section', p);
        };
        const box = new Box({ ref: () => got.push('box:props'), runover: { ref: [() => got.push('box:runover')] } });
        const fnRoot = motifComponent(Fn, { ref: () => got.push('fn:props'), runover: { ref: () => got.push('fn:runover') }, childs: [] }) as ComponentBase;
        expect(got).toEqual(['box:props', 'box:runover', 'props:undefined:undefined', 'fn:props', 'fn:runover']);
        expect((box.props as any).ref).toBeUndefined();
        expect((box.props as any).runover).toBeUndefined();
        expect((fnRoot.props as any).ref).toBeUndefined();
        const { root } = mount(box);
        root.controls.add(fnRoot);
        expect(got.length).toBe(5);
        await root.dispose();
    });

    test('a function returning the object form { el } gets its ref applied to the materialized component', async () => {
        const got: any[] = [];
        let seen: any = 'unset';
        const Fn = (p: any) => { seen = p.ref; return { el: 'div' }; };
        const c = motifComponent(Fn, { ref: (x: any) => got.push(x) }) as ComponentBase;
        expect(seen).toBeUndefined();
        expect(got).toEqual([c]);
        expect((c.props as any).ref).toBeUndefined();
        const { root } = mount(c);
        expect(got.length).toBe(1);
        await root.dispose();
    });
});

describe('ref on a member or identifier calls functions and assigns other values', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a class method passed as ref is called with the component', async () => {
        const got: any[] = [];
        const App = evalJsx(`
            class Leaf extends Component { constructor(p){ super('em', p); } }
            class App extends Component {
                constructor(p){ super('section', p); }
                onLeaf(c){ got.push(c.element.nodeName); }
                view(){ return <Leaf ref={this.onLeaf} />; }
            }`, 'App', { got });
        const app = new App({});
        const { root } = mount(app);
        expect(got).toEqual(['EM']);
        expect(typeof app.onLeaf).toBe('function');
        await root.dispose();
    });

    test('a declared field passed as ref receives the component', async () => {
        const App = evalJsx(`
            class App extends Component {
                box = null;
                constructor(p){ super('section', p); }
                view(){ return <div class="b" ref={this.box} />; }
            }`, 'App');
        const app = new App({});
        const { root } = mount(app);
        expect(app.box.element.className).toBe('b');
        await root.dispose();
    });

    test('an undeclared member is called when it holds a function and assigned otherwise', async () => {
        const got: any[] = [];
        const App = evalJsx(`
            class App extends Component {
                constructor(p){ super('section', p); this.cb = (c) => got.push(c.element.nodeName); }
                view(){ return <div><i ref={this.cb} /><b ref={this.slot} /></div>; }
            }`, 'App', { got });
        const app = new App({});
        const { root } = mount(app);
        expect(got).toEqual(['I']);
        expect(app.slot.element.nodeName).toBe('B');
        await root.dispose();
    });

    test('a local function passed as ref is called once', async () => {
        const got: any[] = [];
        const App = evalJsx(`
            function onRef(c){ got.push(c.element.nodeName); }
            function App(){ return <section><div ref={onRef} /></section>; }`, 'App', { got });
        const { root } = mount(App());
        expect(got).toEqual(['DIV']);
        await root.dispose();
    });
});

describe('onRefCreated belongs to the class that writes the JSX (strict mode)', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a function component with identifier and member refs', async () => {
        const got: any[] = [];
        const holder: any = { slot: null };
        const App = evalJsx(`
            function onRef(c){ got.push(c.element.nodeName); }
            function App(){ return <section><div ref={onRef} /><i ref={holder.slot} /></section>; }`, 'App', { got, holder }, true);
        const { root } = mount(App());
        expect(got).toEqual(['DIV']);
        expect(holder.slot.element.nodeName).toBe('I');
        await root.dispose();
    });

    test('JSX at module level', async () => {
        const holder: any = { slot: null };
        const el = evalJsx(`const el = <p ref={holder.slot} />;`, 'el', { holder }, true);
        const { root } = mount(el);
        expect(holder.slot.element.nodeName).toBe('P');
        await root.dispose();
    });

    test('a class method and a class field arrow both notify the class', async () => {
        const App = evalJsx(`
            class App extends Component {
                refs = [];
                a = null;
                b = null;
                constructor(p){ super('section', p); }
                part = () => <b ref={this.b} />;
                view(){ const part = this.part(); return <div><i ref={this.a} />{part}</div>; }
                onRefCreated(s){ this.refs.push(s.element.nodeName); }
            }`, 'App', {}, true);
        const app = new App({});
        const { root } = mount(app);
        expect(app.refs).toEqual(['B', 'I']);
        await root.dispose();
    });

    test('a plain function inside a class method does not notify its own this', async () => {
        const other: any = { calls: 0, onRefCreated() { this.calls++; } };
        const holder: any = { slot: null };
        const App = evalJsx(`
            class App extends Component {
                refs = [];
                constructor(p){ super('section', p); }
                view(){ const make = function(){ return <u ref={holder.slot} />; }; return <div>{make.call(other)}</div>; }
                onRefCreated(s){ this.refs.push(s); }
            }`, 'App', { other, holder }, true);
        const app = new App({});
        const { root } = mount(app);
        expect(holder.slot.element.nodeName).toBe('U');
        expect(other.calls).toBe(0);
        expect(app.refs).toEqual([]);
        await root.dispose();
    });
});

describe('ref: a function is called, an object is assigned', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('an object ref in props receives the component', async () => {
        const p: any = { ref: {} };
        const c = new Component('div', p);
        expect(p.ref).toBe(c);
        await c.dispose();
    });

    test('an object ref in runover receives the component', async () => {
        const runover: any = { ref: {} };
        const c = new Component('div', { runover } as any);
        expect(runover.ref).toBe(c);
        await c.dispose();
    });

    test('a function ref is called once and removed from props', async () => {
        const got: any[] = [];
        const p: any = { ref: (x: any) => got.push(x) };
        const c = new Component('div', p);
        expect(got).toEqual([c]);
        expect('ref' in c.props).toBe(false);
        await c.dispose();
    });

    test('a function ref in runover is called once and removed from runover', async () => {
        const got: any[] = [];
        const c = new Component('div', { runover: { ref: (x: any) => got.push(x) } } as any);
        expect(got).toEqual([c]);
        expect((c.props as any).runover?.ref).toBeUndefined();
        await c.dispose();
    });
});
