/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'OptionsProps.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component } from '@motifx/core';
const cb = () => {};
const received = [];
class Klass extends Component<HTMLDivElement> { view() { return <span>c</span>; } }
const Opt = () => ({
  el: 'div',
  ctor(props) { received.push(Object.keys(props || {}).sort().join(',')); },
  view() { return <span>c</span>; },
});
const spreadAttrs = { title: 'inner', 'data-k': 'v' };
const WithSpread = () => ({ el: 'div', view() { return <span {...spreadAttrs}>s</span>; } });
const make = {
  callbacks: (T) => <T onFormClosing={cb} onSave={cb} onChange={cb} />,
  attrs: (T) => <T userId={42} title="t" items={[1, 2]} class="k" id="i" role="note" tabindex={0} aria-label="a" data-x="1" />,
  spread: () => <WithSpread />,
};
`;
const m = load(source, ['make', 'Klass', 'Opt', 'WithSpread', 'cb', 'received']);

let host: HTMLElement;
let root: Component;

beforeEach(() => {
    m.received.length = 0;
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host);
    root.build();
});

afterEach(() => {
    root.dispose();
    host.remove();
});

function mount(factory: () => any): { c: any; listeners: string[] } {
    const listeners: string[] = [];
    const original = Element.prototype.addEventListener;
    (Element.prototype as any).addEventListener = function (type: string, ...rest: any[]) {
        listeners.push(type);
        return original.call(this, type, ...rest);
    };
    let c: any;
    try {
        c = factory();
        root.controls.add(c);
    } finally {
        (Element.prototype as any).addEventListener = original;
    }
    return { c, listeners };
}

describe('Options API bileşen etiketi', () => {
    test('callback prop\'ları this.props\'ta kalır, DOM dinleyicisi olmaz', () => {
        const { c, listeners } = mount(() => m.make.callbacks(m.Opt));
        expect(listeners).toEqual(['change']);
        expect(c.props.onFormClosing).toBe(m.cb);
        expect(c.props.onSave).toBe(m.cb);
        expect(c.props.onChange).toBeUndefined();
    });

    test('köke yalnız ortak öznitelikler düşer', () => {
        const { c } = mount(() => m.make.attrs(m.Opt));
        const el = c.element as HTMLElement;
        expect(el.getAttribute('class')).toBe('k');
        expect(el.id).toBe('i');
        expect(el.getAttribute('role')).toBe('note');
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.getAttribute('aria-label')).toBe('a');
        expect(el.getAttribute('data-x')).toBe('1');
        expect(el.hasAttribute('userid')).toBe(false);
        expect(el.hasAttribute('title')).toBe(false);
        expect(el.hasAttribute('items')).toBe(false);
        expect(c.props.userId).toBe(42);
        expect(c.props.title).toBe('t');
        expect(c.props.items).toEqual([1, 2]);
    });

    test.each(['callbacks', 'attrs'])('%s: sınıf bileşeniyle aynı kök ve dinleyiciler', (kind) => {
        const opt = mount(() => m.make[kind](m.Opt));
        const klass = mount(() => m.make[kind](m.Klass));
        expect(opt.c.element.outerHTML).toBe(klass.c.element.outerHTML);
        expect(opt.listeners).toEqual(klass.listeners);
        expect(Object.keys(opt.c.props).sort()).toEqual(Object.keys(klass.c.props).sort());
    });

    test('ctor prop\'ları alır', () => {
        mount(() => m.make.callbacks(m.Opt));
        expect(m.received).toEqual(['onFormClosing,onSave']);
    });

    test('new Component(fabrika, props) aynı kuralı izler', () => {
        const { c, listeners } = mount(() => new Component(m.Opt, { onSave: m.cb, title: 't', class: 'k' } as any));
        expect(listeners).toEqual([]);
        expect((c.element as HTMLElement).outerHTML).toBe('<div class="k"><span>c</span></div>');
        expect(c.props.onSave).toBe(m.cb);
    });

    test('görünümdeki düz elemanların yayılan öznitelikleri yine yazılır', () => {
        const { c } = mount(() => m.make.spread());
        expect((c.element as HTMLElement).innerHTML).toBe('<span title="inner" data-k="v">s</span>');
    });
});

describe('elle kurulan düz eleman', () => {
    test('new Component(etiket, props) bütün on* fonksiyonlarını dinleyici, diğerlerini öznitelik yapar', () => {
        const listeners: string[] = [];
        const original = Element.prototype.addEventListener;
        (Element.prototype as any).addEventListener = function (type: string, ...rest: any[]) {
            listeners.push(type);
            return original.call(this, type, ...rest);
        };
        let c: any;
        try {
            c = new Component('div', { onFormClosing: m.cb, onSave: m.cb, onChange: m.cb, title: 't' } as any);
            c.build();
        } finally {
            (Element.prototype as any).addEventListener = original;
        }
        expect(listeners).toEqual(['formclosing', 'save', 'change']);
        expect((c.element as HTMLElement).getAttribute('title')).toBe('t');
        c.dispose();
    });
});
