import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = async () => {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
    }
};

function evalJsx(source: string, names: string[], extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'PropTernary.tsx');
    const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/gm, '');
    const injected = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...injected, `${code}\nreturn { ${names.join(', ')} };`)(...values);
}

function mount(child: any): HTMLElement {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return host;
}

const panes = (host: HTMLElement) => Array.from(host.querySelectorAll('section.pane')).map((p) => p.innerHTML.replace(/<!--.*?-->/g, ''));

describe('a ternary prop with markup branches stays live in the slot that places it', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test.each([
        ['function receiver, {() => props.toolbar}', `function Pane(props) { return <section class="pane">{() => props.toolbar}</section>; }`],
        ['function receiver, {() => props.toolbar()}', `function Pane(props) { return <section class="pane">{() => props.toolbar()}</section>; }`],
        ['class receiver, {() => this.props.toolbar}', `class Pane extends Component { view() { return <section class="pane">{() => this.props.toolbar}</section>; } }`],
    ])('%s follows the condition', async (_label, pane) => {
        const s = reactive({ editing: false });
        const { Host } = evalJsx(`${pane}
            class Host extends Component { view() { return <Pane toolbar={s.editing ? <nav class="t">Kaydet</nav> : null} />; } }`, ['Pane', 'Host'], { s });
        const host = mount(new Host());
        await settle();
        expect(panes(host)).toEqual(['']);
        s.editing = true;
        await settle();
        expect(panes(host)).toEqual(['<nav class="t">Kaydet</nav>']);
        s.editing = false;
        await settle();
        expect(panes(host)).toEqual(['']);
    });

    test('a plain prop inside the branch is read once and the branch is not rebuilt', async () => {
        const s = reactive({ editing: true, count: 1 });
        const built = { badge: 0 };
        const { Host } = evalJsx(`function Pane(props) { return <section class="pane">{() => props.toolbar}</section>; }
            function Badge(props) { built.badge++; return <b>{props.count}</b>; }
            class Host extends Component { view() { return <Pane toolbar={s.editing ? <Badge count={s.count} /> : null} />; } }`, ['Pane', 'Badge', 'Host'], { s, built });
        const host = mount(new Host());
        await settle();
        expect(panes(host)).toEqual(['<b>1</b>']);
        s.count = 5;
        await settle();
        expect(panes(host)).toEqual(['<b>1</b>']);
        expect(built.badge).toBe(1);
    });

    test('when the condition input changes but its result does not, the branch is kept', async () => {
        const s = reactive({ n: 1 });
        const built = { row: 0 };
        const { Host } = evalJsx(`function Pane(props) { return <section class="pane">{() => props.toolbar}</section>; }
            function Row() { built.row++; return <i>dolu</i>; }
            class Host extends Component { view() { return <Pane toolbar={s.n > 0 ? <Row /> : null} />; } }`, ['Pane', 'Row', 'Host'], { s, built });
        const host = mount(new Host());
        await settle();
        s.n = 2;
        await settle();
        s.n = 3;
        await settle();
        expect(panes(host)).toEqual(['<i>dolu</i>']);
        expect(built.row).toBe(1);
        s.n = 0;
        await settle();
        expect(panes(host)).toEqual(['']);
    });

    test('the same prop placed twice gives two live copies', async () => {
        const s = reactive({ editing: false });
        const { Host } = evalJsx(`function Pane(props) { return <div><section class="pane">{() => props.toolbar}</section><section class="pane">{() => props.toolbar}</section></div>; }
            class Host extends Component { view() { return <Pane toolbar={s.editing ? <nav>A</nav> : null} />; } }`, ['Pane', 'Host'], { s });
        const host = mount(new Host());
        await settle();
        s.editing = true;
        await settle();
        expect(panes(host)).toEqual(['<nav>A</nav>', '<nav>A</nav>']);
    });

    test('a text ternary prop, a ready component and a function component reference are placed as before', async () => {
        const s = reactive({ on: false });
        const { Host } = evalJsx(`function Pane(props) { return <section class="pane">{() => props.toolbar}</section>; }
            function Label(props) { return <section class="pane">{props.label}</section>; }
            function NavFn() { return <nav>Fn</nav>; }
            class Host extends Component { view() { return <div><Label label={s.on ? "acik" : "kapali"} /><Pane toolbar={<nav>Hazir</nav>} /><Pane toolbar={NavFn} /></div>; } }`, ['Pane', 'Label', 'NavFn', 'Host'], { s });
        const host = mount(new Host());
        await settle();
        expect(panes(host)).toEqual(['kapali', '<nav>Hazir</nav>', '<nav>Fn</nav>']);
        s.on = true;
        await settle();
        expect(panes(host)).toEqual(['acik', '<nav>Hazir</nav>', '<nav>Fn</nav>']);
    });
});
