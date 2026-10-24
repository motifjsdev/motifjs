import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'FP.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/m,
        (_: string, names: string) => `const {${names.replace(/\bas\b/g, ':')}} = motif;`);
    const fn = new Function('motif', 'Component', ...Object.keys(extra), `${code}\nreturn ${exportName};`);
    return fn(motif, Component, ...Object.values(extra));
}

function mount(child: any): { host: HTMLElement; root: Component } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

let warn: jest.SpyInstance;

beforeEach(() => {
    (globalThis as any).__MOTIF_DEV__ = true;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    warn.mockRestore();
    delete (globalThis as any).__MOTIF_DEV__;
    document.body.innerHTML = '';
});

const duplicateKeyWarnings = () => warn.mock.calls.map(c => String(c[0])).filter(l => l.includes('MJX202'));

describe('a list row key works the same on class, function and Options rows', () => {
    const source = `
        class ClassRow extends Component {
            constructor(p){ super('li', p); }
        }
        function FnRow(p){ return <li>{p.n}</li>; }
        function OptRow(p){ return motif.motifOptions({ el: 'li' }); }
        function Classes(){ return <ul>{s.items.map((i) => <ClassRow key={i.id} n={i.n} />)}</ul>; }
        function Functions(){ return <ul>{s.items.map((i) => <FnRow key={i.id} n={i.n} />)}</ul>; }
        function Options(){ return <ul>{s.items.map((i) => <OptRow key={i.id} n={i.n} />)}</ul>; }`;

    for (const name of ['Classes', 'Functions', 'Options']) {
        test(`${name}: a duplicate key is reported once with MJX202`, async () => {
            const s = reactive({ items: [{ id: 1, n: 'a' }, { id: 1, n: 'b' }] });
            const { host, root } = mount(evalJsx(source, name, { s })());
            await tick();
            expect(host.querySelectorAll('li').length).toBe(2);
            expect(duplicateKeyWarnings()).toHaveLength(1);
            expect(duplicateKeyWarnings()[0]).toContain('duplicate key "1" at index 1');
            await root.dispose();
        });

        test(`${name}: unique keys are not reported`, async () => {
            const s = reactive({ items: [{ id: 1, n: 'a' }, { id: 2, n: 'b' }] });
            const { root } = mount(evalJsx(source, name, { s })());
            await tick();
            expect(duplicateKeyWarnings()).toHaveLength(0);
            await root.dispose();
        });
    }

    test('the tag key wins over a key the function puts on its own root', async () => {
        const s = reactive({ items: [{ id: 1, n: 'a' }, { id: 2, n: 'a' }] });
        const List = evalJsx(`
            function Row(p){ return <li key={p.n}>{p.n}</li>; }
            function List(){ return <ul>{s.items.map((i) => <Row key={i.id} n={i.n} />)}</ul>; }`, 'List', { s });
        const { root } = mount(List());
        await tick();
        expect(duplicateKeyWarnings()).toHaveLength(0);
        await root.dispose();
    });
});

describe('new Component(fn, props) gives the returned root what new Component(Class, props) gives', () => {
    class Card extends Component {
        constructor(p: any) { super('article', p); }
    }
    const card = () => new Component('article');

    for (const [name, element] of [['class', Card], ['function', card]] as const) {
        test(`${name}: ref, shared attributes, options and key land on the root`, async () => {
            const got: ComponentBase[] = [];
            const comp = new Component(element as any, {
                ref: (c: ComponentBase) => got.push(c),
                class: 'card',
                id: 'c1',
                'aria-label': 'Card',
                options: { hideStrategy: 'detach' },
                indexkey: () => 7,
            } as any);
            const { host, root } = mount(comp);
            const el = host.querySelector('article')!;
            expect(comp.element).toBe(el);
            expect(got).toEqual([comp]);
            expect(el.classList.contains('card')).toBe(true);
            expect(el.id).toBe('c1');
            expect(el.getAttribute('aria-label')).toBe('Card');
            expect((comp.motif.options as any).hideStrategy).toBe('detach');
            expect((comp.props as any).indexkey()).toBe(7);
            await root.dispose();
        });
    }

    test('a function that passes its props to an inner component does not hand the ref to it', async () => {
        const got: ComponentBase[] = [];
        const wrap = (p: any) => new Component('section', { childs: [new Component('b', p)] });
        const comp = new Component(wrap as any, { ref: (c: ComponentBase) => got.push(c) } as any);
        const { root } = mount(comp);
        expect(got).toEqual([comp]);
        expect(comp.element.nodeName).toBe('SECTION');
        await root.dispose();
    });

    test('a function that returns a tag name still gets the ref', async () => {
        const got: ComponentBase[] = [];
        const comp = new Component((() => 'section') as any, { ref: (c: ComponentBase) => got.push(c) } as any);
        const { root } = mount(comp);
        expect(got).toEqual([comp]);
        expect(comp.element.nodeName).toBe('SECTION');
        await root.dispose();
    });
});

describe('hooks given in the props object reach a function root as they reach a class', () => {
    class Card extends Component {
        constructor(p: any) { super('article', p); }
    }
    const card = () => new Component('article');

    const hookProps = (log: string[], shown: { value: boolean }) => ({
        preconfig: (c: ComponentBase) => { log.push('preconfig'); c.bindings.display(() => shown.value); },
        initializeComponent: () => log.push('initializeComponent'),
        onBuilt: () => log.push('onBuilt'),
        onMounted: () => log.push('onMounted'),
    });

    const make = {
        motifComponent: (element: any, props: any) => motif.motifComponent(element, props),
        'new Component': (element: any, props: any) => new Component(element, props),
    };

    for (const [how, create] of Object.entries(make)) {
        test(`${how}: the function root runs the same hooks in the same order as the class`, async () => {
            const runs: Record<string, string[]> = {};
            for (const [name, element] of [['class', Card], ['function', card]] as const) {
                const log: string[] = [];
                const shown = reactive({ value: false });
                const { host, root } = mount(create(element, hookProps(log, shown)));
                await tick(20);
                expect([name, host.querySelector('article')]).toEqual([name, null]);
                shown.value = true;
                await tick(20);
                expect([name, host.querySelector('article') !== null]).toEqual([name, true]);
                runs[name] = log;
                await root.dispose();
            }
            expect(runs.class).toEqual(['preconfig', 'initializeComponent', 'onBuilt', 'onMounted']);
            expect(runs.function).toEqual(runs.class);
        });
    }

    test('hooks and x- keys leave the props the function receives, callback props stay', async () => {
        let seen: any;
        const row = (p: any) => { seen = { ...p }; return new Component('li'); };
        const onSave = () => 0;
        const shown = reactive({ value: false });
        const { host, root } = mount(motif.motifComponent(row, { note: 1, onSave, onBuilt: () => 0, 'x-display': () => shown.value }));
        expect(seen).toEqual({ note: 1, onSave });
        await tick();
        expect(host.querySelector('li')).toBeNull();
        shown.value = true;
        await tick();
        expect(host.querySelector('li')).not.toBeNull();
        await root.dispose();
    });

    test('a function that passes its props on to its root runs each hook once', async () => {
        for (const pass of [(p: any) => new Component('section', p), (p: any) => new Component('section', { ...p })]) {
            const log: string[] = [];
            const { root } = mount(motif.motifComponent(pass, { initializeComponent: () => log.push('init'), onBuilt: () => log.push('built') }));
            expect(log).toEqual(['init', 'built']);
            await root.dispose();
        }
    });

    test('a function that returns an Options object or a tag name keeps the hooks', async () => {
        const log: string[] = [];
        const options = () => motif.motifOptions({ el: 'section' });
        const { root } = mount(motif.motifComponent(options, { onBuilt: () => log.push('options') }));
        root.controls.add(new Component((() => 'section') as any, { onBuilt: () => log.push('tag') } as any));
        expect(log).toEqual(['options', 'tag']);
        await root.dispose();
    });
});
