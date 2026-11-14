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
    const out = new CompilerCtor().start(source, 'BranchValues.tsx');
    const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/gm, '');
    const injected = ['_mc', '_mf', '_mfc', '_mv', '_mr', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, (motif as any).motifReport, Component, reactive, ...Object.values(extra)];
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

const shown = (host: HTMLElement) => host.querySelector('section')!.innerHTML.replace(/<!--.*?-->/g, '');

const parts = `
    function notice(text) { return <div class="n">{text}</div>; }
    function label() { return 'plain-' + s.text; }
    class Panel extends Component { view() { return <div class="n">panel</div>; } }
    function pickClass() { return Panel; }
    function later() { return Promise.resolve(<div class="n">later</div>); }`;

const probe = (child: string) => `${parts}
    class Probe extends Component {
        word = 'member-word';
        notice(text) { return <div class="n">{text}</div>; }
        label() { return 'label-' + s.text; }
        nothing() { return null; }
        maybe() { return s.inner ? <div class="n">inner</div> : null; }
        pair() { return [<b>x</b>, <i>y</i>]; }
        view() {
            const word = 'local-word';
            return <section>${child}</section>;
        }
    }`;

const inSwitch = (body: string) => `{() => { switch (s.on) { case true: ${body} default: return null; } }}`;

async function walk(child: string) {
    const s = reactive({ on: true, alt: true, inner: false, text: 'first', items: ['x', 'y'], word: null as any });
    const errors: string[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ')); });
    try {
        const { Probe } = evalJsx(probe(child), ['Probe'], { s });
        const host = mount(new Probe());
        const built = shown(host);
        await settle();
        const settled = shown(host);
        s.items.push('z');
        s.word = 'w';
        s.text = 'second';
        s.inner = true;
        s.alt = false;
        await settle();
        const changed = shown(host);
        s.on = false;
        await settle();
        const off = shown(host);
        s.on = true;
        s.alt = true;
        await settle();
        const back = shown(host);
        return { built, settled, changed, off, back, errors };
    } finally {
        spy.mockRestore();
    }
}

describe('a non-markup ternary branch behaves as the same expression written alone', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test.each([
        ['a method call returning a component', `{s.on ? this.notice('a') : null}`, ['<div class="n">a</div>', '<div class="n">a</div>', '', '<div class="n">a</div>']],
        ['a function call returning a component', `{s.on ? notice('a') : null}`, ['<div class="n">a</div>', '<div class="n">a</div>', '', '<div class="n">a</div>']],
        ['an optional call', `{s.on ? this.notice?.('a') : null}`, ['<div class="n">a</div>', '<div class="n">a</div>', '', '<div class="n">a</div>']],
        ['a getter around the ternary', `{() => s.on ? this.notice('g') : null}`, ['<div class="n">g</div>', '<div class="n">g</div>', '', '<div class="n">g</div>']],
        ['a nested ternary', `{s.on ? (s.alt ? this.notice('i') : <i>alt</i>) : null}`, ['<div class="n">i</div>', '<i>alt</i>', '', '<div class="n">i</div>']],
        ['a call on both sides', `{s.on ? this.notice('yes') : this.notice('no')}`, ['<div class="n">yes</div>', '<div class="n">yes</div>', '<div class="n">no</div>', '<div class="n">yes</div>']],
        ['a call that returns a component only later', `{s.on ? this.maybe() : null}`, ['', '<div class="n">inner</div>', '', '<div class="n">inner</div>']],
        ['a call returning text', `{s.on ? this.label() : 'off'}`, ['label-first', 'label-second', 'off', 'label-second']],
        ['a call returning null', `{s.on ? this.nothing() : null}`, ['', '', '', '']],
        ['a map over a reactive array', `{s.on ? s.items.map(i => <li>{i}</li>) : <p>empty</p>}`, ['<li>x</li><li>y</li>', '<li>x</li><li>y</li><li>z</li>', '<p>empty</p>', '<li>x</li><li>y</li><li>z</li>']],
        ['&& with markup', `{s.on ? (s.alt && <i>and</i>) : null}`, ['<i>and</i>', '', '', '<i>and</i>']],
        ['&& with a call', `{s.on ? (s.alt && this.notice('c')) : null}`, ['<div class="n">c</div>', '', '', '<div class="n">c</div>']],
        ['?? with markup', `{s.on ? (s.word ?? <i>fallback</i>) : null}`, ['<i>fallback</i>', 'w', '', 'w']],
        ['|| with markup', `{s.on ? (s.word || <i>fallback</i>) : null}`, ['<i>fallback</i>', 'w', '', 'w']],
        ['an array of markup', `{s.on ? [<b>x</b>, <i>y</i>] : null}`, ['<b>x</b><i>y</i>', '<b>x</b><i>y</i>', '', '<b>x</b><i>y</i>']],
        ['a new instance', `{s.on ? new Panel() : null}`, ['<div class="n">panel</div>', '<div class="n">panel</div>', '', '<div class="n">panel</div>']],
        ['an arrow returning markup', `{s.on ? () => <i>arrow</i> : null}`, ['<i>arrow</i>', '<i>arrow</i>', '', '<i>arrow</i>']],
        ['a member holding text', `{s.on ? s.text : null}`, ['first', 'second', '', 'second']],
        ['a template string', '{s.on ? `t-${s.text}` : null}', ['t-first', 't-second', '', 't-second']],
    ])('%s', async (_label, child, [built, changed, off, back]) => {
        const r = await walk(child);
        expect(r.built).toBe(built);
        expect(r.changed).toBe(changed);
        expect(r.off).toBe(off);
        expect(r.back).toBe(back);
        expect(r.errors).toEqual([]);
    });

    test('a call branch is rebuilt when a value it read changes, as the call alone is', async () => {
        const run = async (child: string) => {
            const s = reactive({ on: true, text: 'first' });
            const built = { n: 0 };
            const { Probe } = evalJsx(`class Probe extends Component {
                notice() { built.n++; const text = s.text; return <div class="n">{text}</div>; }
                view() { return <section>${child}</section>; }
            }`, ['Probe'], { s, built });
            const host = mount(new Probe());
            await settle();
            const first = shown(host);
            s.text = 'changed';
            await settle();
            return { first, after: shown(host), count: built.n };
        };
        const alone = await run(`{this.notice()}`);
        const branch = await run(`{s.on ? this.notice() : null}`);
        expect(alone).toEqual({ first: '<div class="n">first</div>', after: '<div class="n">changed</div>', count: 2 });
        expect(branch).toEqual(alone);
    });
});

describe('a switch branch that is text is released when the branch is left', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test.each([
        ['a string', `return 'literal';`, 'literal'],
        ['a number', `return 42;`, '42'],
        ['a template string', 'return `tpl-${s.text}`;', 'tpl-first'],
        ['a variable holding text', `return word;`, 'local-word'],
        ['a member holding text', `return this.word;`, 'member-word'],
        ['a method call returning text', `return this.label();`, 'label-first'],
        ['a function call returning text', `return label();`, 'plain-first'],
    ])('%s is written once and does not stay behind', async (_label, body, text) => {
        const r = await walk(inSwitch(body));
        expect(r.built).toBe(text);
        expect(r.off).toBe('');
        expect(r.back).toBe(text.replace('first', 'second'));
        expect(r.errors).toEqual([]);
    });

    test.each([
        ['a method call returning a component', `return this.notice('a');`, '<div class="n">a</div>'],
        ['a new instance', `return new Panel();`, '<div class="n">panel</div>'],
        ['a call returning a component class', `return pickClass();`, '<div class="n">panel</div>'],
        ['a component class', `return Panel;`, '<div class="n">panel</div>'],
        ['a call returning an array of components', `return this.pair();`, '<b>x</b><i>y</i>'],
        ['markup', `return <div class="n">jsx</div>;`, '<div class="n">jsx</div>'],
    ])('%s is placed as before', async (_label, body, html) => {
        const r = await walk(inSwitch(body));
        expect(r.built).toBe(html);
        expect(r.off).toBe('');
        expect(r.back).toBe(html);
        expect(r.errors).toEqual([]);
    });

    test('a call returning a promise of a component is placed when it resolves', async () => {
        const r = await walk(inSwitch(`return later();`));
        expect(r.built).toBe('');
        expect(r.settled).toBe('<div class="n">later</div>');
        expect(r.off).toBe('');
        expect(r.back).toBe('<div class="n">later</div>');
    });

    test('a call returning null shows nothing', async () => {
        const r = await walk(inSwitch(`return this.nothing();`));
        expect([r.built, r.off, r.back]).toEqual(['', '', '']);
        expect(r.errors).toEqual([]);
    });
});
