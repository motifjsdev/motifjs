/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'ModelWrite.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const settle = () => new Promise(r => setTimeout(r, 0));

let host: HTMLElement;
let root: Component;

beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host);
    root.build();
});

afterEach(() => {
    root.dispose();
    host.remove();
});

function field<T extends HTMLElement>(tag: string, setup: (c: Component<T>) => void, attrs: Record<string, any> = {}): { c: Component<T>; el: T } {
    const c = new Component<T>(tag, attrs as any);
    root.controls.add(c);
    setup(c);
    return { c, el: c.element as T };
}

function fire(el: HTMLElement, type: 'input' | 'change') {
    el.dispatchEvent(new Event(type, { bubbles: true }));
}

describe('form elemanı model yazımı', () => {
    test('input metni dataMember yoluyla yazılır', () => {
        const state = reactive({ name: 'a' });
        const { el } = field<HTMLInputElement>('input', c => c.bindings.model(state, 'name'));
        el.value = 'b';
        fire(el, 'input');
        expect(state.name).toBe('b');
    });

    test('noktalı dataMember iç nesneye yazar', () => {
        const state = reactive({ address: { city: 'x' } });
        const { el } = field<HTMLInputElement>('input', c => c.bindings.model(state, 'address.city'));
        el.value = 'y';
        fire(el, 'change');
        expect(state.address.city).toBe('y');
    });

    test('getter ve setter biçimi setter ile yazar', () => {
        const state = reactive({ name: 'a' });
        const seen: any[] = [];
        const { el } = field<HTMLInputElement>('input', c => c.bindings.model(() => state.name, (v: any) => { seen.push(v); state.name = v; }));
        el.value = 'z';
        fire(el, 'input');
        expect(seen).toEqual(['z']);
        expect(state.name).toBe('z');
    });

    test('converterBack yazmadan önce uygulanır', () => {
        const state = reactive({ n: 1 });
        const { el } = field<HTMLInputElement>('input', c => {
            const b = c.bindings.model(state, 'n');
            b.converterBack = (v: any) => Number(v) * 10;
        });
        el.value = '4';
        fire(el, 'input');
        expect(state.n).toBe(40);
    });

    test('checkbox boolean yazar', () => {
        const state = reactive({ done: false });
        const { el } = field<HTMLInputElement>('input', c => c.bindings.model(state, 'done'), { type: 'checkbox' });
        el.checked = true;
        fire(el, 'change');
        expect(state.done).toBe(true);
    });

    test('select ve textarea yazar', () => {
        const state = reactive({ pick: 'a', note: '' });
        const sel = new Component<HTMLSelectElement>('select');
        sel.element.innerHTML = '<option value="a">a</option><option value="b">b</option>';
        root.controls.add(sel);
        sel.bindings.model(state, 'pick');
        sel.element.value = 'b';
        fire(sel.element, 'change');
        expect(state.pick).toBe('b');
        const { el } = field<HTMLTextAreaElement>('textarea', c => c.bindings.model(state, 'note'));
        el.value = 'hello';
        fire(el, 'input');
        expect(state.note).toBe('hello');
    });

    test('dataMember olmadan value alanı olan kaynağa yazar', () => {
        const box = reactive({ value: 'a' });
        const { el } = field<HTMLInputElement>('input', c => c.bindings.model(box, undefined as any));
        el.value = 'q';
        fire(el, 'input');
        expect(box.value).toBe('q');
    });

    test('__proto__ yolu yazılmaz', () => {
        const state: any = reactive({ safe: 1 });
        const { el } = field<HTMLInputElement>('input', c => c.bindings.model(state, '__proto__.polluted'));
        el.value = 'x';
        fire(el, 'input');
        expect(({} as any).polluted).toBeUndefined();
    });

    test('derlenmiş x-model sahip nesne değişince yeni nesneye yazar', async () => {
        const m = load(`
            import { reactive } from '@motifx/core';
            const state = reactive({ form: { name: 'a' } });
            const make = () => <input x-model={() => state.form.name} />;
        `, ['state', 'make']);
        const input = m.make();
        root.controls.add(input);
        m.state.form = { name: 'b' };
        await settle();
        (input.element as HTMLInputElement).value = 'c';
        fire(input.element, 'input');
        expect(m.state.form.name).toBe('c');
    });
});

describe('bindings.writeModel', () => {
    const m = load(`
        import { Component, reactive } from '@motifx/core';
        const settings = reactive({ dark: false });
        class Toggle extends Component<HTMLDivElement> {
          state = reactive({ on: false });
          set value(v) { this.state.on = !!v; }
          get value() { return this.state.on; }
          view() {
            return <button class="t" onclick={() => this.bindings.writeModel(!this.state.on)}>{() => (this.state.on ? 'on' : 'off')}</button>;
          }
        }
        const make = {
          bound: () => <Toggle x-model={() => settings.dark} />,
          free: () => <Toggle />,
        };
    `, ['settings', 'make']);

    beforeEach(() => { m.settings.dark = false; });

    test('kökü div olan bileşen x-model ile bağlı state\'e yazar', async () => {
        const t = m.make.bound();
        root.controls.add(t);
        const button = host.querySelector('button.t') as HTMLButtonElement;
        expect(button.textContent).toBe('off');
        button.click();
        await settle();
        await settle();
        expect(m.settings.dark).toBe(true);
        expect(t.state.on).toBe(true);
        expect(button.textContent).toBe('on');
        m.settings.dark = false;
        await settle();
        await settle();
        expect(t.state.on).toBe(false);
        expect(button.textContent).toBe('off');
    });

    test('x-model yoksa yazmaz ve false döner', () => {
        const t = m.make.free();
        root.controls.add(t);
        expect(t.bindings.writeModel(true)).toBe(false);
        expect(m.settings.dark).toBe(false);
    });

    test('bindings.model(kaynak, üye) biçimine dataMember yoluyla yazar', () => {
        const state = reactive({ open: false });
        const c = new Component<HTMLDivElement>('div');
        root.controls.add(c);
        c.bindings.model(state, 'open');
        expect(c.bindings.writeModel(true)).toBe(true);
        expect(state.open).toBe(true);
    });

    test('converterBack uygulanır', () => {
        const state = reactive({ n: 0 });
        const c = new Component<HTMLDivElement>('div');
        root.controls.add(c);
        const b = c.bindings.model(state, 'n');
        b.converterBack = (v: any) => Number(v) + 1;
        c.bindings.writeModel('4');
        expect(state.n).toBe(5);
    });

    test('model olmayan bağlara dokunmaz', () => {
        const state = reactive({ title: 'a' });
        const c = new Component<HTMLDivElement>('div');
        root.controls.add(c);
        c.bindings.add('title', state, 'title');
        expect(c.bindings.writeModel('b')).toBe(false);
        expect(state.title).toBe('a');
    });

    test('kaldırılan model bağına yazmaz', () => {
        const state = reactive({ open: false });
        const c = new Component<HTMLDivElement>('div');
        root.controls.add(c);
        const b = c.bindings.model(state, 'open');
        c.bindings.remove(b);
        expect(c.bindings.writeModel(true)).toBe(false);
        expect(state.open).toBe(false);
    });

    test('form elemanında da aynı yazma yolunu kullanır', () => {
        const state = reactive({ name: 'a' });
        const { c, el } = field<HTMLInputElement>('input', x => x.bindings.model(state, 'name'));
        expect(c.bindings.writeModel('typed')).toBe(true);
        expect(state.name).toBe('typed');
        el.value = 'event';
        fire(el, 'input');
        expect(state.name).toBe('event');
    });
});
