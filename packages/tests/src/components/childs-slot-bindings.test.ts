/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'SlotBindings.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component, reactive } from '@motifx/core';
const s = reactive({ flag: false, title: null, items: ['a', 'b'] });

class Panel extends Component<HTMLDivElement> {
  view() { return <div class="body"><span class="slot">{this.childs}</span></div>; }
}
class Fn extends Component<HTMLElement> {
  badge() { return s.flag ? <b>ROZET</b> : "yok"; }
}
function FnPanel(props) { return <div class="body"><span class="slot">{props.childs}</span></div>; }
const OptPanel = () => ({ el: 'div', view() { return <div class="body"><span class="slot">{this.childs}</span></div>; } });

const helper = new Fn();
const make = {
  ternary: () => <main><Panel><p>once</p>{s.flag ? <b>EVET</b> : <i>HAYIR</i>}<q>sonra</q></Panel></main>,
  and: () => <main><Panel>{s.flag && <b>EVET</b>}</Panel></main>,
  coalesce: () => <main><Panel>{s.title ?? <i>Adsiz</i>}</Panel></main>,
  call: () => <main><Panel>{helper.badge()}</Panel></main>,
  arrow: () => <main><Panel>{() => s.title ?? "bos"}</Panel></main>,
  template: () => <main><Panel>{\`baslik: \${s.title ?? "bos"}\`}</Panel></main>,
  list: () => <main><Panel>{s.items.map(i => <li>{i}</li>)}</Panel></main>,
  fn: () => <main><FnPanel>{s.flag ? <b>EVET</b> : <i>HAYIR</i>}</FnPanel></main>,
  opt: () => <main><OptPanel>{s.flag ? <b>EVET</b> : <i>HAYIR</i>}</OptPanel></main>,
};
`;

const m = load(source, ['s', 'make']);
const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

let host: HTMLElement;
let root: Component;

beforeEach(() => {
    m.s.flag = false;
    m.s.title = null;
    m.s.items.length = 0;
    m.s.items.push('a', 'b');
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
    const main = host.querySelector('main') as HTMLElement;
    const slot = main.querySelector('.slot') as HTMLElement;
    return { main, slot };
}

/** Yuva dışında kalan her şey: yuvanın içeriği çıkarılmış `main` metni ve yuva dışındaki b/i/li/p/q elemanları. */
function outside(main: HTMLElement) {
    const tags = Array.from(main.querySelectorAll('b, i, li, p, q')).filter(e => !e.closest('.slot'));
    const clone = main.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.slot').forEach(e => e.remove());
    return { tags, text: clone.textContent ?? '' };
}

describe('bileşen etiketinin çocuğu olan bağ ifadeleri childs yuvasında, bir kez, canlı', () => {
    test('ternary: yuvada tek kopya, sırası korunur, değişince yuvada güncellenir', async () => {
        const { main, slot } = await mount('ternary');
        expect(main.querySelectorAll('i').length).toBe(1);
        expect(main.querySelectorAll('b').length).toBe(0);
        expect(slot.querySelector('i')?.textContent).toBe('HAYIR');
        expect(outside(main).tags.length).toBe(0);
        expect(outside(main).text).toBe('');
        expect(Array.from(slot.children).map(e => e.tagName.toLowerCase())).toEqual(['p', 'i', 'q']);

        m.s.flag = true;
        await settle();
        expect(main.querySelectorAll('b').length).toBe(1);
        expect(main.querySelectorAll('i').length).toBe(0);
        expect(slot.querySelector('b')?.textContent).toBe('EVET');
        expect(Array.from(slot.children).map(e => e.tagName.toLowerCase())).toEqual(['p', 'b', 'q']);
    });

    test('&&: yanlışken yuva boş ve "false" yazılmaz, doğru olunca yuvada tek kopya', async () => {
        const { main, slot } = await mount('and');
        expect(main.textContent).not.toContain('false');
        expect(slot.querySelectorAll('b').length).toBe(0);
        expect(outside(main).tags.length).toBe(0);

        m.s.flag = true;
        await settle();
        expect(main.querySelectorAll('b').length).toBe(1);
        expect(slot.querySelector('b')?.textContent).toBe('EVET');

        m.s.flag = false;
        await settle();
        expect(main.querySelectorAll('b').length).toBe(0);
        expect(main.textContent).not.toContain('false');
    });

    test('&&: başta doğruyken de yuvada tek kopya', async () => {
        m.s.flag = true;
        const { main, slot } = await mount('and');
        expect(main.querySelectorAll('b').length).toBe(1);
        expect(slot.querySelector('b')?.textContent).toBe('EVET');
    });

    test('??: yuvada tek kopya ve canlı', async () => {
        const { main, slot } = await mount('coalesce');
        expect(main.querySelectorAll('i').length).toBe(1);
        expect(slot.querySelector('i')?.textContent).toBe('Adsiz');
        expect(outside(main).text).toBe('');

        m.s.title = 'Baslik';
        await settle();
        expect(main.querySelectorAll('i').length).toBe(0);
        expect(slot.textContent).toBe('Baslik');
        expect(outside(main).text).toBe('');
    });

    test('üye çağrısı: yuvada tek kopya ve canlı', async () => {
        const { main, slot } = await mount('call');
        expect(slot.textContent).toBe('yok');
        expect(outside(main).text).toBe('');

        m.s.flag = true;
        await settle();
        expect(main.querySelectorAll('b').length).toBe(1);
        expect(slot.querySelector('b')?.textContent).toBe('ROZET');
        expect(outside(main).text).toBe('');
    });

    test('ok fonksiyonu: yuvada canlı metin', async () => {
        const { slot } = await mount('arrow');
        expect(slot.textContent).toBe('bos');
        m.s.title = 'Baslik';
        await settle();
        expect(slot.textContent).toBe('Baslik');
    });

    test('şablon dizesi: yuvada canlı metin', async () => {
        const { slot } = await mount('template');
        expect(slot.textContent).toBe('baslik: bos');
        m.s.title = 'Baslik';
        await settle();
        expect(slot.textContent).toBe('baslik: Baslik');
    });

    test('liste: yuvada ve canlı (değişmeyen davranış)', async () => {
        const { main, slot } = await mount('list');
        expect(slot.querySelectorAll('li').length).toBe(2);
        expect(outside(main).tags.length).toBe(0);
        m.s.items.push('c');
        await settle();
        expect(slot.querySelectorAll('li').length).toBe(3);
    });

    test('fonksiyon bileşeni etiketi: ternary yuvada tek kopya', async () => {
        const { main, slot } = await mount('fn');
        expect(main.querySelectorAll('i').length).toBe(1);
        expect(slot.querySelector('i')?.textContent).toBe('HAYIR');
        m.s.flag = true;
        await settle();
        expect(main.querySelectorAll('b').length).toBe(1);
        expect(slot.querySelector('b')?.textContent).toBe('EVET');
    });

    test('Options bileşeni etiketi: ternary yuvada tek kopya', async () => {
        const { main, slot } = await mount('opt');
        expect(main.querySelectorAll('i').length).toBe(1);
        expect(slot.querySelector('i')?.textContent).toBe('HAYIR');
        m.s.flag = true;
        await settle();
        expect(main.querySelectorAll('b').length).toBe(1);
        expect(slot.querySelector('b')?.textContent).toBe('EVET');
    });
});
