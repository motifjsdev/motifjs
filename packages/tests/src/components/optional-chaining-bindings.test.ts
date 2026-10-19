/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'Optional.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component, reactive } from '@motifx/core';
const s = reactive({ sel: null as any });
function View() {
  return <section>
    <p id="attr" title={s.sel?.title}>a</p>
    <p id="cls" class={s.sel?.cls}>c</p>
    <p id="xtext" x-text={s.sel?.title}></p>
    <p id="child">{s.sel?.title}</p>
    <p id="disp" x-display={s.sel?.on}>d</p>
  </section>;
}
`;

const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

test('?. içeren öznitelik, class, x-text, metin çocuğu ve x-display canlı kalır', async () => {
    const m = load(source, ['s', 'View']);
    const host = document.body.appendChild(document.createElement('div'));
    const root = new Component(host as any);
    root.build();
    root.controls.add(m.View());
    await settle();
    const q = (id: string) => host.querySelector('#' + id) as HTMLElement;

    expect(q('attr').getAttribute('title')).toBeNull();
    expect(q('cls').className).toBe('');
    expect(q('xtext').textContent).toBe('');
    expect(q('child').textContent).toBe('');
    expect(q('disp')).toBeNull();

    m.s.sel = { title: 'Birinci', cls: 'one', on: true };
    await settle();
    expect(q('attr').getAttribute('title')).toBe('Birinci');
    expect(q('cls').className).toBe('one');
    expect(q('xtext').textContent).toBe('Birinci');
    expect(q('child').textContent).toBe('Birinci');
    expect(q('disp')).not.toBeNull();

    m.s.sel.title = 'Ikinci';
    m.s.sel.cls = 'two';
    await settle();
    expect(q('attr').getAttribute('title')).toBe('Ikinci');
    expect(q('cls').className).toBe('two');
    expect(q('xtext').textContent).toBe('Ikinci');
    expect(q('child').textContent).toBe('Ikinci');

    m.s.sel = null;
    await settle();
    expect(q('attr').getAttribute('title')).toBeNull();
    expect(q('cls').className).toBe('');
    expect(q('xtext').textContent).toBe('');
    expect(q('child').textContent).toBe('');
    expect(q('disp')).toBeNull();

    root.dispose();
    host.remove();
});
