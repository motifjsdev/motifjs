/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, errorHandler } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 5)); };

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'ReState.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component } from '@motifx/core';
const d = { save: 'Kaydet', title: 'Baslik', on: true, mode: 'a', watched: 0 };
const dict = { t(k) { return d[k]; } };
class Page extends Component<HTMLDivElement> {
  view() {
    return <section>
      <p id="getter">{() => d.save}</p>
      <p id="tpl">{\`\${d.save}!\`}</p>
      <p id="call">{dict.t('save')}</p>
      <p id="coalesce">{d.missing ?? d.save}</p>
      <p id="xtext" x-text={() => d.save}></p>
      <p id="tern">{d.on ? <b class="yes">acik</b> : <i class="no">kapali</i>}</p>
      <p id="and">{d.on && <b class="and">var</b>}</p>
      <p id="sw">{() => { switch (d.mode) { case 'a': return <b class="a">A</b>; default: return <i class="d">D</i>; } }}</p>
      <p id="watch" x-watch={() => { d.watched++; }}>w</p>
    </section>;
  }
}
`;

let m: Record<string, any>;
let host: HTMLElement;
let root: Component;
let page: any;
let reported: any[];
let unbind: () => void;

beforeEach(async () => {
    m = load(source, ['d', 'Page']);
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host as any);
    root.build();
    page = new m.Page();
    root.controls.add(page);
    await settle();
});

afterEach(() => {
    unbind();
    root.dispose();
    host.remove();
});

const q = (sel: string) => host.querySelector(sel) as HTMLElement;

describe.each(['setState', 'reState'])('%s re-evaluates every effect binding', (how) => {
    test('child getter, template, member call and ?? slots re-read plain data', async () => {
        expect(q('#getter').textContent).toBe('Kaydet');
        m.d.save = 'Save';
        page[how]();
        await settle();
        expect(q('#getter').textContent).toBe('Save');
        expect(q('#tpl').textContent).toBe('Save!');
        expect(q('#call').textContent).toBe('Save');
        expect(q('#coalesce').textContent).toBe('Save');
        expect(q('#xtext').textContent).toBe('Save');
        expect(reported).toEqual([]);
    });

    test('ternary, && and switch keep their branch instance when the condition is unchanged', async () => {
        const yes = q('#tern b.yes');
        const and = q('#and b.and');
        const a = q('#sw b.a');
        page[how]();
        await settle();
        expect(q('#tern b.yes')).toBe(yes);
        expect(q('#and b.and')).toBe(and);
        expect(q('#sw b.a')).toBe(a);
    });

    test('ternary, && and switch switch their branch when the plain condition changed', async () => {
        m.d.on = false;
        m.d.mode = 'z';
        page[how]();
        await settle();
        expect(q('#tern i.no')).not.toBeNull();
        expect(q('#tern b.yes')).toBeNull();
        expect(q('#and b.and')).toBeNull();
        expect(q('#sw i.d')).not.toBeNull();
        expect(q('#sw b.a')).toBeNull();
        expect(reported).toEqual([]);
    });

    test('x-watch runs once more', async () => {
        const before = m.d.watched;
        page[how]();
        await settle();
        expect(m.d.watched).toBe(before + 1);
    });
});

test('after dispose nothing is kept or re-run', async () => {
    const section = page.controls.items[0];
    const p = section.controls.items.find((c: any) => c.element?.id === 'getter');
    const w = section.controls.items.find((c: any) => c.element?.id === 'watch');
    const collections = [p.bindings as any, w.bindings as any];
    expect(collections[0]._effects.length).toBe(1);
    expect(collections[1]._effects.length).toBe(1);
    await page.dispose();
    for (const col of collections) {
        expect(col._effects === null || col._effects.length === 0).toBe(true);
    }
    expect(p.bindings).toBeUndefined();
    const before = m.d.watched;
    m.d.save = 'X';
    expect(() => page.setState()).not.toThrow();
    expect(() => page.reState()).not.toThrow();
    await settle();
    expect(m.d.watched).toBe(before);
    expect(reported).toEqual([]);
});

test('reactive data still updates without setState', async () => {
    const r = load(`
import { Component, reactive } from '@motifx/core';
const s = reactive({ v: 1 });
class Live extends Component<HTMLDivElement> {
  view() { return <p id="live">{() => s.v}</p>; }
}
`, ['s', 'Live']);
    const live = new r.Live();
    root.controls.add(live);
    await settle();
    r.s.v = 2;
    await settle();
    expect(q('#live').textContent).toBe('2');
    live.setState();
    await settle();
    r.s.v = 3;
    await settle();
    expect(q('#live').textContent).toBe('3');
});
