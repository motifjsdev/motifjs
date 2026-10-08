import * as motif from '@motifx/core';
import { Component, ComponentBase, FragmentNode, motifFragment, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async () => { await tick(); await tick(); };

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'RO.tsx');
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

describe('component tag props carried by the compiler', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('class component tag: attributes fall through to the root, DOM events are heard, own props stay in props', async () => {
        const log = { clicks: 0, props: null as any };
        const A = evalJsx(`
            class Card extends Component {
                constructor(p){ super('div', p); log.props = p; }
                view(){ return <b>{this.props.title}</b>; }
            }
            function A(){ return <Card id="card" class="k" data-x="1" aria-label="L" title="T" onClick={() => log.clicks++} />; }`, 'A', { log });
        const { host } = mount(A());
        await settle();
        const el = host.querySelector('#card') as HTMLElement;
        expect(el).not.toBeNull();
        expect(el.className).toBe('k');
        expect(el.getAttribute('data-x')).toBe('1');
        expect(el.getAttribute('aria-label')).toBe('L');
        expect(el.textContent).toBe('T');
        el.click();
        expect(log.clicks).toBe(1);
        expect(log.props.title).toBe('T');
        expect('runover' in log.props).toBe(false);
    });

    test('function component tag: attributes and events land on the returned root', async () => {
        const log = { clicks: 0 };
        const A = evalJsx(`
            function Fn(p){ return <section>{p.label}</section>; }
            function A(){ return <Fn label="L" id="fn" class="f" onClick={() => log.clicks++} />; }`, 'A', { log });
        const { host } = mount(A());
        await settle();
        const el = host.querySelector('#fn') as HTMLElement;
        expect(el.tagName).toBe('SECTION');
        expect(el.className).toBe('f');
        expect(el.textContent).toBe('L');
        el.click();
        expect(log.clicks).toBe(1);
    });

    test('x-wait on component tags holds the component until the condition clears', async () => {
        const st = reactive({ w: true });
        const A = evalJsx(`
            class Card extends Component { constructor(p){ super('div', p); } view(){ return <b>c</b>; } }
            function Fn(){ return <section>f</section>; }
            function A(){ return <main><Card id="card" x-wait={() => st.w} /><Fn id="fn" x-wait={() => st.w} /></main>; }`, 'A', { st });
        const { host } = mount(A());
        await settle();
        expect(host.querySelector('#card')).toBeNull();
        expect(host.querySelector('#fn')).toBeNull();
        st.w = false;
        await settle();
        expect(host.querySelector('#card')).not.toBeNull();
        expect(host.querySelector('#fn')).not.toBeNull();
    });

    test('x-display on a component tag toggles it', async () => {
        const st = reactive({ on: false });
        const A = evalJsx(`
            class Card extends Component { constructor(p){ super('div', p); } view(){ return <b>c</b>; } }
            function A(){ return <main><Card id="card" x-display={() => st.on} /></main>; }`, 'A', { st });
        const { host } = mount(A());
        await settle();
        expect(host.querySelector('#card')).toBeNull();
        st.on = true;
        await settle();
        expect(host.querySelector('#card')).not.toBeNull();
        st.on = false;
        await settle();
        expect(host.querySelector('#card')).toBeNull();
    });

    test('lifecycle hooks and initializeComponent on component tags run on the tag component in order', async () => {
        const log: string[] = [];
        const A = evalJsx(`
            class Card extends Component {
                constructor(p){ super('div', p); }
                initializeComponent(){ log.push('member'); }
                view(){ return <b>c</b>; }
            }
            function Fn(){ return <section>f</section>; }
            function A(){ return <main>
                <Card initializeComponent={(s) => log.push('card-tag:' + (s instanceof Card))} onBuilt={(s) => log.push('card-built:' + (s instanceof Card))} />
                <Fn initializeComponent={(s) => log.push('fn-tag:' + s.element.tagName)} onBuilt={(s) => log.push('fn-built:' + s.element.tagName)} />
            </main>; }`, 'A', { log });
        mount(A());
        await settle();
        expect(log).toEqual(['member', 'card-tag:true', 'card-built:true', 'fn-tag:SECTION', 'fn-built:SECTION']);
    });

    test('ref on a component tag receives the tag component', async () => {
        const got: any = {};
        const A = evalJsx(`
            class Card extends Component { constructor(p){ super('div', p); } view(){ return <b>c</b>; } }
            function Fn(){ return <section>f</section>; }
            function A(){ return <main><Card ref={(c) => got.card = c} /><Fn ref={(c) => got.fn = c} /></main>; }`, 'A', { got });
        mount(A());
        await settle();
        expect(got.card).toBeInstanceOf(ComponentBase);
        expect((got.card.element as HTMLElement).tagName).toBe('DIV');
        expect((got.fn.element as HTMLElement).tagName).toBe('SECTION');
    });

    test('component events on a class component tag are subscribed', async () => {
        const log: any[] = [];
        const A = evalJsx(`
            class Card extends Component {
                constructor(p){ super('div', p); }
                view(){ return <b>c</b>; }
                ping(){ this.motif.trigger('ping', { n: 1 }); }
            }
            function A(){ return <Card on:ping={(e) => log.push(e.n)} ref={(c) => log.push(c)} />; }`, 'A', { log });
        mount(A());
        await settle();
        const card: any = log.find(x => x instanceof ComponentBase);
        card.ping();
        expect(log.filter(x => typeof x === 'number')).toEqual([1]);
    });
});

describe('FragmentNode nodes', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('nodes given in props are added as content', async () => {
        const a = new Component('i', {});
        const b = new Component('b', {});
        const frag = new FragmentNode({ nodes: [a, b] } as any);
        const { host } = mount(frag);
        await settle();
        expect(frag.controls.items).toEqual([a, b]);
        expect(host.innerHTML).toContain('<i></i><b></b>');
        expect(Array.isArray((frag.props as any).nodes)).toBe(true);
    });

    test('childs come first, then nodes', async () => {
        const a = new Component('i', {});
        const b = new Component('b', {});
        const frag = new FragmentNode({ childs: [a], nodes: [b] } as any);
        mount(frag);
        await settle();
        expect(frag.controls.items).toEqual([a, b]);
    });

    test('motifFragment passes nodes through', async () => {
        const a = new Component('i', {});
        const frag = motifFragment({ nodes: [a] });
        mount(frag);
        await settle();
        expect(frag.controls.items).toEqual([a]);
    });

    test('a fragment without nodes stays empty and a JSX fragment keeps its children', async () => {
        const empty = new FragmentNode({} as any);
        const A = evalJsx(`function A(){ return <><i>1</i><b>2</b></>; }`, 'A');
        const { host } = mount(empty);
        const jsxFrag = A();
        const second = mount(jsxFrag);
        await settle();
        expect(empty.controls.items.length).toBe(0);
        expect(second.host.innerHTML).toContain('<i>1</i><b>2</b>');
        expect(host.innerHTML).not.toContain('<i>');
    });
});
