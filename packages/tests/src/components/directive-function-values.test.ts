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

const shown = (host: Component) => !!(host.element as HTMLElement).querySelector('#t');

const forms: Array<[string, (dir: string) => string]> = [
    ['a variable holding a function', dir => `function A(){ const ok = () => s.a; return <section><p id="t" ${dir}={ok}>x</p></section>; }`],
    ['a method reference', dir => `class A extends Component { constructor(){ super('section'); this.state = s; } isOk(){ return this.state.a; } view(){ return <p id="t" ${dir}={this.isOk}>x</p>; } }`],
    ['an arrow', dir => `function A(){ return <section><p id="t" ${dir}={() => s.a}>x</p></section>; }`],
    ['a reactive value', dir => `function A(){ return <section><p id="t" ${dir}={s.a}>x</p></section>; }`],
];

describe('x-display and x-wait with a function value', () => {
    for (const [label, source] of forms) {
        for (const start of [false, true]) {
            test(`${label}, condition starts ${start}`, async () => {
                for (const dir of ['x-display', 'x-wait']) {
                    const s = reactive({ a: start });
                    const A = evalJsx(source(dir), 'A', { s });
                    const host = mount(label === 'a method reference' ? new A() : A());
                    await tick();
                    const visibleWhen = (cond: boolean) => dir === 'x-display' ? cond : !cond;
                    expect([dir, shown(host)]).toEqual([dir, visibleWhen(start)]);
                    s.a = !start;
                    await tick();
                    expect([dir, shown(host)]).toEqual([dir, visibleWhen(!start)]);
                    s.a = start;
                    await tick();
                    expect([dir, shown(host)]).toEqual([dir, visibleWhen(start)]);
                    await host.dispose();
                }
                expect(reported).toEqual([]);
            });
        }
    }
});

describe('other directives with a method reference', () => {
    test('x-text calls the method with this and stays live', async () => {
        const s = reactive({ name: 'a' });
        const A = evalJsx(`class A extends Component { constructor(){ super('section'); this.state = s; } label(){ return 'hi ' + this.state.name; } view(){ return <p id="t" x-text={this.label}></p>; } }`, 'A', { s });
        const host = mount(new A());
        await tick();
        expect((host.element as HTMLElement).querySelector('#t')!.textContent).toBe('hi a');
        s.name = 'b';
        await tick();
        expect((host.element as HTMLElement).querySelector('#t')!.textContent).toBe('hi b');
        expect(reported).toEqual([]);
        await host.dispose();
    });

    test('x-watch runs the method and runs it again on change', async () => {
        const s = reactive({ q: 'a' });
        const seen: string[] = [];
        const A = evalJsx(`class A extends Component { constructor(){ super('section'); this.state = s; } track(){ seen.push(this.state.q); } view(){ return <p x-watch={this.track}></p>; } }`, 'A', { s, seen });
        const host = mount(new A());
        await tick();
        s.q = 'b';
        await tick();
        expect(seen).toEqual(['a', 'b']);
        expect(reported).toEqual([]);
        await host.dispose();
    });
});

describe('bindings.display without the compiler', () => {
    test('a predicate that returns a function is resolved before it is negated', async () => {
        const s = reactive({ a: false });
        const p = new Component('p');
        p.bindings.display(() => () => s.a);
        const host = mount(p);
        await tick();
        expect((p.element as HTMLElement).isConnected).toBe(false);
        s.a = true;
        await tick();
        expect((p.element as HTMLElement).isConnected).toBe(true);
        await host.dispose();
    });
});
