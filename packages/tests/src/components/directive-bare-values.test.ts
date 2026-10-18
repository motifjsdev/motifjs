/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive, errorHandler } from '@motifx/core';

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

const visibleFor = (dir: string, condition: boolean) => dir === 'x-display' ? condition : !condition;

const negations: Array<[string, string, (a: boolean) => boolean]> = [
    ['a negation', '!s.a', a => !a],
    ['a double negation', '!!s.a', a => !!a],
];

describe('x-display and x-wait with a negation follow the state', () => {
    for (const [label, value, condition] of negations) {
        for (const start of [false, true]) {
            test(`${label}, state starts ${start}`, async () => {
                for (const dir of ['x-display', 'x-wait']) {
                    const s = reactive({ a: start });
                    const A = evalJsx(`function A(){ return <section><p id="t" ${dir}={${value}}>x</p></section>; }`, 'A', { s });
                    const host = mount(A());
                    await tick();
                    expect([dir, shown(host)]).toEqual([dir, visibleFor(dir, condition(start))]);
                    s.a = !start;
                    await tick();
                    expect([dir, shown(host)]).toEqual([dir, visibleFor(dir, condition(!start))]);
                    s.a = start;
                    await tick();
                    expect([dir, shown(host)]).toEqual([dir, visibleFor(dir, condition(start))]);
                    await host.dispose();
                }
                expect(reported).toEqual([]);
            });
        }
    }
});

describe('x-display and x-wait with optional chaining follow the state', () => {
    test('x-display={s.box?.open} hides while the object is missing', async () => {
        const s = reactive({ box: null as any });
        const A = evalJsx(`function A(){ return <section><p id="t" x-display={s.box?.open}>x</p></section>; }`, 'A', { s });
        const host = mount(A());
        await tick();
        expect(shown(host)).toBe(false);
        s.box = { open: true };
        await tick();
        expect(shown(host)).toBe(true);
        s.box.open = false;
        await tick();
        expect(shown(host)).toBe(false);
        s.box = null;
        await tick();
        expect(shown(host)).toBe(false);
        expect(reported).toEqual([]);
        await host.dispose();
    });

    test('x-wait={s.job?.running} and x-wait={s.job?.isRunning()} wait while the job runs', async () => {
        for (const value of ['s.job?.running', 's.job?.isRunning()']) {
            const s = reactive({ job: { running: true, isRunning() { return this.running; } } });
            const A = evalJsx(`function A(){ return <section><p id="t" x-wait={${value}}>x</p></section>; }`, 'A', { s });
            const host = mount(A());
            await tick();
            expect([value, shown(host)]).toEqual([value, false]);
            s.job.running = false;
            await tick();
            expect([value, shown(host)]).toEqual([value, true]);
            s.job = { running: true, isRunning() { return this.running; } };
            await tick();
            expect([value, shown(host)]).toEqual([value, false]);
            await host.dispose();
        }
        expect(reported).toEqual([]);
    });
});

describe('x-display and x-wait with a literal', () => {
    test.each([
        ['x-display', 'false', false],
        ['x-display', 'true', true],
        ['x-wait', 'true', false],
        ['x-wait', 'false', true],
    ])('%s={%s}', async (dir, value, visible) => {
        const A = evalJsx(`function A(){ return <section><p id="t" ${dir}={${value}}>x</p></section>; }`, 'A');
        const host = mount(A());
        await tick();
        expect(shown(host)).toBe(visible);
        expect(reported).toEqual([]);
        await host.dispose();
    });
});

describe('a negation on a component tag follows the state', () => {
    const tags: Array<[string, string]> = [
        ['a function component', `function Card(){ return <article id="t">c</article>; } function A(){ return <section><Card DIR={!s.a} /></section>; }`],
        ['a class component', `class Card extends Component { constructor(){ super('article'); } view(){ return <b id="t">c</b>; } } function A(){ return <section><Card DIR={!s.a} /></section>; }`],
    ];
    for (const [label, source] of tags) {
        test(label, async () => {
            for (const dir of ['x-display', 'x-wait']) {
                const s = reactive({ a: false });
                const A = evalJsx(source.replace('DIR', dir), 'A', { s });
                const host = mount(A());
                await tick();
                expect([dir, shown(host)]).toEqual([dir, visibleFor(dir, true)]);
                s.a = true;
                await tick();
                expect([dir, shown(host)]).toEqual([dir, visibleFor(dir, false)]);
                s.a = false;
                await tick();
                expect([dir, shown(host)]).toEqual([dir, visibleFor(dir, true)]);
                await host.dispose();
            }
            expect(reported).toEqual([]);
        });
    }
});
