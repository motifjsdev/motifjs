/**
 * @jest-environment jsdom
 */
import { Component, Frame, errorHandler } from '@motifx/core';

let warn: jest.SpyInstance;
let unbind: () => void;
let reported: any[];

beforeEach(() => {
    (globalThis as any).__MOTIF_DEV__ = true;
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    unbind();
    warn.mockRestore();
    delete (globalThis as any).__MOTIF_DEV__;
    document.body.innerHTML = '';
});

const warnings = () => warn.mock.calls.map(c => String(c[0])).filter(l => l.includes('MJX128'));

function mount(make: () => Component) {
    const host = new Component(document.body.appendChild(document.createElement('div')));
    host.build();
    try { host.controls.add(make()); } catch { }
    return host;
}

describe('MJX128 reports a class member that hides a ComponentBase member', () => {
    test('build() without super.build: the component would stay empty', () => {
        class EmptyCard extends Component { constructor() { super('div'); } build() { } }
        mount(() => new EmptyCard());
        expect(warnings()).toEqual([expect.stringContaining('EmptyCard overrides build without calling super.build')]);
    });

    test('dispose() without super.dispose: the component would never be torn down', () => {
        class Leaky extends Component { constructor() { super('div'); } async dispose() { } }
        mount(() => new Leaky());
        expect(warnings()).toEqual([expect.stringContaining('Leaky overrides dispose without calling super.dispose')]);
    });

    test('style() with fewer parameters, which TypeScript accepts', () => {
        class Themed extends Component { constructor() { super('div'); } style() { return 'dark'; } }
        mount(() => new Themed());
        expect(warnings()).toEqual([expect.stringContaining('Themed overrides style without calling super.style')]);
    });

    test('an accessor override without super', () => {
        class Ctx extends Component { constructor() { super('div'); } get context(): any { return null; } }
        mount(() => new Ctx());
        expect(warnings()).toEqual([expect.stringContaining('Ctx overrides context without calling super.context')]);
    });

    test('instance fields that hide methods or accessors', () => {
        class Fields extends Component {
            constructor() {
                super('div');
                Object.defineProperty(this, 'isWait', { value: false, writable: true, enumerable: true, configurable: true });
            }
            style: any = 'red';
            dispose: any = async () => { };
        }
        mount(() => new Fields());
        const w = warnings();
        expect(w).toHaveLength(3);
        for (const m of ['style', 'dispose', 'isWait']) {
            expect(w).toContainEqual(expect.stringContaining(`Fields defines '${m}' as an instance field`));
        }
    });

    test.each([
        ['controls', []],
        ['attr', {}],
        ['class', 'card'],
        ['bindings', null],
        ['motif', 1],
        ['element', {}],
        ['parent', 'x'],
    ])('a field that replaces %s', (member, value) => {
        const Replaced = class extends Component { constructor() { super('div'); (this as any)[member] = value; } };
        Object.defineProperty(Replaced, 'name', { value: 'Replaced_' + member });
        mount(() => new Replaced());
        expect(warnings()).toContainEqual(expect.stringContaining(`Replaced_${member} replaces '${member}'`));
    });

    test('reported once per class', () => {
        class Twice extends Component { constructor() { super('div'); } build() { } }
        mount(() => new Twice());
        mount(() => new Twice());
        expect(warnings()).toHaveLength(1);
    });

    test('a component built directly is checked too', () => {
        class Root extends Component { constructor() { super(document.body.appendChild(document.createElement('div'))); } style: any = 'x'; }
        new Root().build();
        expect(warnings()).toEqual([expect.stringContaining("Root defines 'style' as an instance field")]);
    });
});

describe('MJX128 stays silent', () => {
    test('overrides that call super, the intended hooks and view', async () => {
        const order: string[] = [];
        class Good extends Component {
            constructor() { super('div'); }
            build(building?: boolean) { order.push('build'); super.build(building); }
            async dispose(options?: any) { order.push('dispose'); await super.dispose(options); }
            style(content: any) { return super.style(content); }
            get context() { return super.context; }
            initializeComponent() { }
            onBuilt() { }
            onDisposing() { }
            view() { return new Component('span'); }
        }
        class Child extends Good { }
        const good = new Good();
        mount(() => good);
        mount(() => new Child());
        await good.dispose();
        expect(good.isDisposed).toBe(true);
        expect(order).toContain('build');
        expect(order).toContain('dispose');
        expect(warnings()).toEqual([]);
    });

    test('plain components and framework classes', () => {
        const host = mount(() => new Component('p'));
        host.controls.add(new Frame());
        expect(warnings()).toEqual([]);
    });

    test('outside development mode', () => {
        delete (globalThis as any).__MOTIF_DEV__;
        class Quiet extends Component { constructor() { super('div'); } build() { } }
        mount(() => new Quiet());
        expect(warnings()).toEqual([]);
    });

    test('the component still behaves as before; the warning only reports', () => {
        class EmptyCard extends Component { constructor() { super('div'); } build() { } view() { return new Component('b'); } }
        const host = mount(() => new EmptyCard());
        expect((host.element as HTMLElement).querySelector('b')).toBeNull();
        expect(reported).toEqual([]);
    });
});
