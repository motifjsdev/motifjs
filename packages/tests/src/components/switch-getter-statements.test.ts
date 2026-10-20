/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'SwitchStmts.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component, reactive } from '@motifx/core';
const s = reactive({ k: 'a', n: 1, ok: true });
const MODE_A = 'a';
const built: string[] = [];
function Tracked(props: { name: string }) { built.push(props.name); return <i>{props.name}</i>; }
function Locals() {
  return <p id="locals">{() => { const label = 'L' + s.n; switch (s.k) { case 'a': return <Tracked name={'A-' + label} />; case 'b': return <b>B</b>; } }}</p>;
}
function CaseBlock() {
  return <p id="block">{() => { switch (s.k) { case 'a': { const t = s.n; return <b>A{t}</b>; } case 'b': return <b>B</b>; } }}</p>;
}
function Fallthrough() {
  return <p id="fall">{() => { switch (s.k) { case 'a': case 'b': return <b>AB</b>; default: return <i>D</i>; } }}</p>;
}
function AfterSwitch() {
  return <p id="after">{() => { switch (s.k) { case 'a': return <b>A</b>; } const note = 'none:' + s.k; return <i>{note}</i>; }}</p>;
}
function NonLiteral() {
  return <p id="nonlit">{() => { switch (s.k) { case MODE_A: return <b>A-var</b>; case 'b': return <b>B</b>; } }}</p>;
}
function TernaryLocals() {
  return <p id="tern">{() => { const label = 'T' + s.n; return s.ok ? <b>{label}</b> : <i>no</i>; }}</p>;
}
function Params() {
  return <p id="params">{((x) => { switch (x) { case 1: return <b>one:{x}</b>; default: return <i>other:{x}</i>; } })(s.n)}</p>;
}
`;

const m = load(source, ['s', 'built', 'Locals', 'CaseBlock', 'Fallthrough', 'AfterSwitch', 'NonLiteral', 'TernaryLocals', 'Params']);
const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

let host: HTMLElement;
let root: Component;
const text = (id: string) => (host.querySelector('#' + id) as HTMLElement).textContent;

beforeEach(() => {
    m.s.k = 'a'; m.s.n = 1; m.s.ok = true; m.built.length = 0;
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host as any);
    root.build();
});
afterEach(() => { root.dispose(); host.remove(); });

test('switch öncesi yerel değişkeni dal okur; anahtar değişmedikçe dal tutulur', async () => {
    root.controls.add(m.Locals());
    await settle();
    expect(text('locals')).toBe('A-L1');
    expect(m.built).toEqual(['A-L1']);
    m.s.n = 2;
    await settle();
    expect(text('locals')).toBe('A-L1');
    expect(m.built).toEqual(['A-L1']);
    m.s.k = 'b';
    await settle();
    expect(text('locals')).toBe('B');
    m.s.k = 'a';
    await settle();
    expect(text('locals')).toBe('A-L2');
    expect(m.built).toEqual(['A-L1', 'A-L2']);
});

test('blok sarmalı case deyimlerini çalıştırır ve return\'ünü yerleştirir', async () => {
    root.controls.add(m.CaseBlock());
    await settle();
    expect(text('block')).toBe('A1');
    m.s.k = 'b';
    await settle();
    expect(text('block')).toBe('B');
    m.s.n = 3; m.s.k = 'a';
    await settle();
    expect(text('block')).toBe('A3');
});

test('boş case sonraki gövdeye düşer', async () => {
    root.controls.add(m.Fallthrough());
    await settle();
    expect(text('fall')).toBe('AB');
    m.s.k = 'b';
    await settle();
    expect(text('fall')).toBe('AB');
    m.s.k = 'x';
    await settle();
    expect(text('fall')).toBe('D');
});

test('switch sonrası deyimler varsayılan yolda çalışır', async () => {
    root.controls.add(m.AfterSwitch());
    await settle();
    expect(text('after')).toBe('A');
    m.s.k = 'x';
    await settle();
    expect(text('after')).toBe('none:x');
    m.s.k = 'a';
    await settle();
    expect(text('after')).toBe('A');
});

test('literal olmayan etiketli switch yazıldığı gibi çalışır', async () => {
    root.controls.add(m.NonLiteral());
    await settle();
    expect(text('nonlit')).toBe('A-var');
    m.s.k = 'b';
    await settle();
    expect(text('nonlit')).toBe('B');
});

test('ternary öncesi yerel değişkeni dallar okur', async () => {
    root.controls.add(m.TernaryLocals());
    await settle();
    expect(text('tern')).toBe('T1');
    m.s.ok = false;
    await settle();
    expect(text('tern')).toBe('no');
    m.s.n = 2; m.s.ok = true;
    await settle();
    expect(text('tern')).toBe('T2');
});

test('IIFE biçimi argümanı ayırıcıya ve dallara geçirir', async () => {
    root.controls.add(m.Params());
    await settle();
    expect(text('params')).toBe('one:1');
    m.s.n = 5;
    await settle();
    expect(text('params')).toBe('other:5');
});
