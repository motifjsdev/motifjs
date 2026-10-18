/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'SwitchBool.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component, reactive } from '@motifx/core';
const s = reactive({ online: true });
function Status() {
  return <p id="t">{() => {
    switch (s.online) {
      case true: return <b>bagli</b>;
      case false: return <i>cevrimdisi</i>;
    }
  }}</p>;
}
`;

const m = load(source, ['s', 'Status']);
const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

test('boolean case etiketleri çalışma anında eşleşir ve değer değişince dal değişir', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    const root = new Component(host as any);
    root.build();
    root.controls.add(m.Status());
    await settle();
    const p = host.querySelector('#t') as HTMLElement;
    expect(p.querySelector('b')?.textContent).toBe('bagli');
    expect(p.querySelector('i')).toBeNull();

    m.s.online = false;
    await settle();
    expect(p.querySelector('i')?.textContent).toBe('cevrimdisi');
    expect(p.querySelector('b')).toBeNull();

    m.s.online = true;
    await settle();
    expect(p.querySelector('b')?.textContent).toBe('bagli');
    root.dispose();
    host.remove();
});

const source2 = `
import { Component, reactive } from '@motifx/core';
const s = reactive({ mode: null });
function WithDefault() {
  return <p id="d">{() => {
    switch (s.mode) {
      case 'a': return <b>A</b>;
      default: return <i>varsayilan</i>;
    }
  }}</p>;
}
function WithTrailing() {
  return <p id="t2">{() => {
    switch (s.mode) {
      case 'a': return <b>A</b>;
    }
    return <i>yedek</i>;
  }}</p>;
}
`;
const m2 = load(source2, ['s', 'WithDefault', 'WithTrailing']);

test('ayırıcı başta null iken default dalı çizilir ve sonra değişir', async () => {
    m2.s.mode = null;
    const host = document.body.appendChild(document.createElement('div'));
    const root = new Component(host as any);
    root.build();
    root.controls.add(m2.WithDefault());
    await settle();
    const p = host.querySelector('#d') as HTMLElement;
    expect(p.querySelector('i')?.textContent).toBe('varsayilan');
    m2.s.mode = 'a';
    await settle();
    expect(p.querySelector('b')?.textContent).toBe('A');
    m2.s.mode = undefined;
    await settle();
    expect(p.querySelector('i')?.textContent).toBe('varsayilan');
    root.dispose();
    host.remove();
});

test('switch sonrası yedek return hiçbir dal eşleşmeyince gösterilir', async () => {
    m2.s.mode = 'x';
    const host = document.body.appendChild(document.createElement('div'));
    const root = new Component(host as any);
    root.build();
    root.controls.add(m2.WithTrailing());
    await settle();
    const p = host.querySelector('#t2') as HTMLElement;
    expect(p.querySelector('i')?.textContent).toBe('yedek');
    m2.s.mode = 'a';
    await settle();
    expect(p.querySelector('b')?.textContent).toBe('A');
    expect(p.querySelector('i')).toBeNull();
    m2.s.mode = 'zzz';
    await settle();
    expect(p.querySelector('i')?.textContent).toBe('yedek');
    root.dispose();
    host.remove();
});

test('bindings.switchCase: başlangıç değeri undefined iken varsayılan dal kurulur', async () => {
    const { reactive } = motif as any;
    const st = reactive({ v: undefined });
    const host = document.body.appendChild(document.createElement('div'));
    const root = new Component(host as any);
    root.build();
    const p = new Component('p', { initializeComponent: (x: any) => x.bindings.switchCase(() => st.v, { a: (f: any) => f.navigate(new Component('b')) }, (f: any) => f.navigate(new Component('i'))) });
    root.controls.add(p);
    await settle();
    expect((p.element as HTMLElement).querySelector('i')).not.toBeNull();
    root.dispose();
    host.remove();
});
