import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = async () => {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
    }
};

function load(source: string, names: string[], extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'NullFactory.tsx');
    const code = out.code
        .replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) => 'const {' + list.replace(/\bas\b/g, ':') + '} = motif;')
        .replace(/^export\s+default\s+/gm, '')
        .replace(/^export\s+/gm, '');
    return new Function('motif', ...Object.keys(extra), `${code}\nreturn { ${names.join(', ')} };`)(motif, ...Object.values(extra));
}

function mount(child: any): HTMLElement {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return host;
}

const clean = (el: Element | null) => (el ? el.innerHTML.replace(/<!--.*?-->/g, '') : null);

const li = (id: string) => {
    const c = new Component('li');
    (c.element as unknown as HTMLElement).id = id;
    return c;
};
const ids = (list: ComponentBase[]) => list.map((x) => (x.element as unknown as HTMLElement).id).join(',');

describe('a factory in the view that returns null or undefined is skipped instead of crashing the build', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test.each([
        ['options view, [() => null]', `const Pane = () => ({ el: "section", view() { return [() => null]; } });`],
        ['options view, [() => undefined]', `const Pane = () => ({ el: "section", view() { return [() => undefined]; } });`],
        ['class view, [() => null]', `class Pane extends Component { static elementTag = "section"; view() { return [() => null]; } }`],
        ['class view, () => null', `class Pane extends Component { static elementTag = "section"; view() { return () => null; } }`],
    ])('%s builds an empty element', async (_label, pane) => {
        const { Host } = load(`import { Component } from "@motifx/core";
            ${pane}
            class Host extends Component { view() { return <Pane />; } }`, ['Host']);
        const host = mount(new Host());
        await settle();
        expect(clean(host.querySelector('section'))).toBe('');
    });

    test('a toolbar prop written as a function that returns null leaves the title in place', async () => {
        const s = reactive({ editing: false });
        const { Host } = load(`import { Component } from "@motifx/core";
            const Pane = (props) => ({ el: "section", view() { return props.toolbar ? [props.toolbar, "Kayıt"] : ["Kayıt"]; } });
            class Host extends Component { view() { return <Pane toolbar={() => s.editing ? <nav class="t">Kaydet</nav> : null} />; } }`, ['Host'], { s });
        const host = mount(new Host());
        await settle();
        expect(clean(host.querySelector('section'))).toBe('Kayıt');
    });

    test('the same toolbar prop renders when the condition holds at build time', async () => {
        const s = reactive({ editing: true });
        const { Host } = load(`import { Component } from "@motifx/core";
            const Pane = (props) => ({ el: "section", view() { return props.toolbar ? [props.toolbar, "Kayıt"] : ["Kayıt"]; } });
            class Host extends Component { view() { return <Pane toolbar={() => s.editing ? <nav class="t">Kaydet</nav> : null} />; } }`, ['Host'], { s });
        const host = mount(new Host());
        await settle();
        expect(clean(host.querySelector('section'))).toBe('<nav class="t">Kaydet</nav>Kayıt');
    });

    test('a class whose view() returns a null-returning function builds without JSX too', () => {
        class Pane extends Component<HTMLElement> {
            constructor() { super('section'); }
            view(): any { return () => null; }
        }
        const host = mount(new Pane());
        expect(clean(host.querySelector('section'))).toBe('');
    });

    test('controls.add(() => null) adds nothing and returns an empty array', () => {
        const host = new Component<HTMLDivElement>('div');
        host.build();
        expect(host.controls.add((() => null) as any)).toEqual([]);
        expect(host.controls.length).toBe(0);
    });

    test('siblings around a null-returning factory are added in order and returned without a hole', () => {
        const host = new Component<HTMLDivElement>('div');
        host.build();
        document.body.appendChild(host.element as unknown as Node);
        const a = li('a'), b = li('b');
        const added = host.controls.add(a, (() => undefined) as any, b);
        expect(added).toEqual([a, b]);
        expect(ids(host.controls.items)).toBe('a,b');
        expect(Array.from((host.element as unknown as HTMLElement).children).map((e) => e.id).join(',')).toBe('a,b');
    });

    test('with an index, the null-returning factory is skipped and the rest land at the index', () => {
        const host = new Component<HTMLDivElement>('div');
        host.build();
        const a = li('a'), x = li('x');
        host.controls.add(a);
        const added = host.controls.add(0, (() => null) as any, x);
        expect(added).toEqual([x]);
        expect(ids(host.controls.items)).toBe('x,a');
    });

    test('a host that is not built yet accepts the factory and builds later without error', () => {
        const host = new Component<HTMLDivElement>('div');
        const a = li('a');
        expect(host.controls.add((() => null) as any, a)).toEqual([a]);
        host.build();
        expect(ids(host.controls.items)).toBe('a');
    });
});
