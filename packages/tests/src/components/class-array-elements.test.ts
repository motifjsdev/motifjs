/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'ClassArray.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component, reactive } from '@motifx/core';
const s = reactive({ cls: 'c1', on: false, flag: true });
const v = 'vv';
const extra = ['e1', 'e2'];
let calls = 0;
const f = () => { calls++; return 'ff'; };
const make = {
  finding: () => <p id="t" class={["note", s.cls, v, s.flag ? "x" : "y", s.on && "z", f()]}>x</p>,
  spread: () => <p id="t" class={["note", ...extra]}>x</p>,
  negation: () => <p id="t" class={["note", !s.on && "closed"]}>x</p>,
};
const callCount = () => calls;
`;

const m = load(source, ['s', 'make', 'callCount']);
const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

let host: HTMLElement;
let root: Component;

beforeEach(() => {
    m.s.cls = 'c1';
    m.s.on = false;
    m.s.flag = true;
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host as any, {});
});

afterEach(() => {
    root.dispose();
    host.remove();
});

async function mount(name: string) {
    root.controls.add(m.make[name]());
    root.build();
    await settle();
    return host.querySelector('#t') as HTMLElement;
}

const classes = (el: HTMLElement) => Array.from(el.classList).sort();

describe('class dizisinin öğeleri elemana ulaşır ve canlı kalır', () => {
    test('bulgudaki dizi: altı öğenin hepsi elemanda', async () => {
        const before = m.callCount();
        const el = await mount('finding');
        expect(classes(el)).toEqual(['c1', 'ff', 'note', 'vv', 'x']);
        expect(m.callCount() - before).toBe(1);
    });

    test('üye yolu, ternary ve && canlı; düz çağrı bir kez', async () => {
        const before = m.callCount();
        const el = await mount('finding');
        m.s.cls = 'c2';
        await settle();
        expect(el.classList.contains('c2')).toBe(true);
        expect(el.classList.contains('c1')).toBe(false);

        m.s.on = true;
        await settle();
        expect(el.classList.contains('z')).toBe(true);

        m.s.flag = false;
        await settle();
        expect(el.classList.contains('y')).toBe(true);
        expect(el.classList.contains('x')).toBe(false);

        m.s.on = false;
        await settle();
        expect(el.classList.contains('z')).toBe(false);
        expect(classes(el)).toEqual(['c2', 'ff', 'note', 'vv', 'y']);
        expect(m.callCount() - before).toBe(1);
    });

    test('yayma öğeleri elemanda', async () => {
        const el = await mount('spread');
        expect(classes(el)).toEqual(['e1', 'e2', 'note']);
    });

    test('olumsuzlama canlı', async () => {
        const el = await mount('negation');
        expect(classes(el)).toEqual(['closed', 'note']);
        m.s.on = true;
        await settle();
        expect(classes(el)).toEqual(['note']);
    });
});
