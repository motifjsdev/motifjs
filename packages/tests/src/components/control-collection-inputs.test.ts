import * as motif from '@motifx/core';
import { Component, ComponentBase } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = async () => {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
    }
};

function load(source: string, names: string[], extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'Unchanged.tsx');
    const code = out.code
        .replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) => 'const {' + list.replace(/\bas\b/g, ':') + '} = motif;')
        .replace(/^export\s+default\s+/gm, '')
        .replace(/^export\s+/gm, '');
    return new Function('motif', ...Object.keys(extra), `${code}\nreturn { ${names.join(', ')} };`)(motif, ...Object.values(extra));
}

function mountJsx(child: any): HTMLElement {
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
const domIds = (host: ComponentBase) => Array.from((host.element as unknown as HTMLElement).children).map((e) => e.id).join(',');

function built(): Component<HTMLDivElement> {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    return host;
}

class Row extends Component<HTMLLIElement> {
    constructor() { super('li'); (this.element as unknown as HTMLElement).id = 'row'; }
}

describe('controls.add and controls.insert handle every non-null input', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a class constructor reference is instantiated once', () => {
        const host = built();
        const added = host.controls.add(Row as any);
        expect(added.length).toBe(1);
        expect(added[0]).toBeInstanceOf(Row);
        expect(host.controls.items[0]).toBe(added[0]);
        expect(domIds(host)).toBe('row');
    });

    test('a function component reference is called once and its component is added', () => {
        const host = built();
        let calls = 0;
        const made = li('f');
        function Fn() { calls++; return made; }
        const added = host.controls.add(Fn as any);
        expect(calls).toBe(1);
        expect(added).toEqual([made]);
        expect(domIds(host)).toBe('f');
    });

    test('a factory that returns a component adds that component', () => {
        const host = built();
        const made = li('g');
        let calls = 0;
        const added = host.controls.add((() => { calls++; return made; }) as any);
        expect(calls).toBe(1);
        expect(added).toEqual([made]);
        expect(host.controls.items[0]).toBe(made);
    });

    test('a ready component instance is added as the same object', () => {
        const host = built();
        const made = li('r');
        expect(host.controls.add(made)).toEqual([made]);
        expect(host.controls.items[0]).toBe(made);
        expect(made.parent).toBe(host);
    });

    test('a disposed component is skipped, alone and among siblings', async () => {
        const host = built();
        const d = li('d');
        await d.dispose();
        expect(d.isDisposed).toBe(true);
        expect(host.controls.add(d)).toEqual([]);
        expect(host.controls.length).toBe(0);
        const a = li('a'), b = li('b');
        expect(host.controls.add(a, d, b)).toEqual([a, b]);
        expect(ids(host.controls.items)).toBe('a,b');
    });

    test('string, number and boolean children become text components', () => {
        const host = built();
        const added = host.controls.add('merhaba' as any, 42 as any, true as any);
        expect(added.length).toBe(3);
        expect(added.map((c) => (c.element as unknown as Node).nodeType)).toEqual([Node.TEXT_NODE, Node.TEXT_NODE, Node.TEXT_NODE]);
        expect((host.element as unknown as HTMLElement).textContent).toBe('merhaba42true');
    });

    test('insert(index, one) and add(index, one) place the child at that index in the list and the DOM', () => {
        const host = built();
        host.controls.add(li('a'), li('b'), li('c'));
        const x = li('x');
        expect(host.controls.insert(1, x)).toEqual([x]);
        expect(ids(host.controls.items)).toBe('a,x,b,c');
        expect(domIds(host)).toBe('a,x,b,c');
        const y = li('y');
        expect(host.controls.add(1, y)).toEqual([y]);
        expect(ids(host.controls.items)).toBe('a,y,x,b,c');
        expect(domIds(host)).toBe('a,y,x,b,c');
    });

    test('insert(index, several) returns them in argument order and places them at the index', () => {
        const host = built();
        host.controls.add(li('a'), li('b'), li('c'));
        const p = li('p'), q = li('q');
        const added = host.controls.insert(2, p, q);
        expect(added).toEqual([p, q]);
        expect(host.controls.length).toBe(5);
        expect(new Set(host.controls.items.slice(2, 4))).toEqual(new Set([p, q]));
        expect(ids(host.controls.items.slice(0, 2))).toBe('a,b');
        expect(ids(host.controls.items.slice(4))).toBe('c');
        expect(domIds(host).split(',').slice(2, 4).sort().join(',')).toBe('p,q');
    });

    test('add(component) takes the one-argument fast path and does not go through insert', () => {
        const host = built();
        const spy = jest.spyOn(host.controls, 'insert');
        const c1 = li('c1');
        expect(host.controls.add(c1)).toEqual([c1]);
        expect(spy).not.toHaveBeenCalled();
        const c2 = li('c2'), c3 = li('c3');
        expect(host.controls.add(c2, c3)).toEqual([c2, c3]);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(ids(host.controls.items)).toBe('c1,c2,c3');
    });

    test('the array add() returns holds every resolved child in argument order', () => {
        const host = built();
        const a = li('a'), b = li('b');
        const added = host.controls.add(a, (() => b) as any, Row as any, 'txt' as any);
        expect(added.length).toBe(4);
        expect(added[0]).toBe(a);
        expect(added[1]).toBe(b);
        expect(added[2]).toBeInstanceOf(Row);
        expect((added[3].element as unknown as Node).nodeType).toBe(Node.TEXT_NODE);
        expect(host.controls.items).toEqual(added);
    });

    test('null and undefined entries are dropped before anything is called', () => {
        const host = built();
        expect(host.controls.add([null] as any)).toEqual([]);
        const a = li('a');
        expect(host.controls.add(null as any, a, undefined as any)).toEqual([a]);
        expect(host.controls.add([null, li('b')] as any).length).toBe(1);
        expect(ids(host.controls.items)).toBe('a,b');
    });

    test('an options view that returns [null] builds an empty element', async () => {
        const { Host } = load(`import { Component } from "@motifx/core";
            const Pane = () => ({ el: "section", view() { return [null]; } });
            class Host extends Component { view() { return <Pane />; } }`, ['Host']);
        const host = mountJsx(new Host());
        await settle();
        expect(clean(host.querySelector('section'))).toBe('');
    });

    test('an options view with a factory that returns markup renders it', async () => {
        const { Host } = load(`import { Component } from "@motifx/core";
            const Pane = () => ({ el: "section", view() { return [() => <b>x</b>]; } });
            class Host extends Component { view() { return <Pane />; } }`, ['Host']);
        const host = mountJsx(new Host());
        await settle();
        expect(clean(host.querySelector('section'))).toBe('<b>x</b>');
    });

    test('a JSX child {() => null} goes through the method slot and renders nothing', async () => {
        const { Host } = load(`import { Component } from "@motifx/core";
            function Pane() { return <section>{() => null}</section>; }
            class Host extends Component { view() { return <Pane />; } }`, ['Host']);
        const host = mountJsx(new Host());
        await settle();
        expect(clean(host.querySelector('section'))).toBe('');
    });

    test('onAdd fires once per child on a built host and onAddBeforeBuild once per child before build', () => {
        const host = built();
        let added = 0;
        const prevAdd = host.controls.onAdd;
        host.controls.onAdd = (c) => { added++; prevAdd && prevAdd.call(host.controls, c); };
        host.controls.add(li('a'), (() => li('b')) as any, 'c' as any);
        expect(added).toBe(3);

        const cold = new Component<HTMLDivElement>('div');
        let before = 0;
        const prevBefore = cold.controls.onAddBeforeBuild;
        cold.controls.onAddBeforeBuild = (c) => { before++; prevBefore && prevBefore.call(cold.controls, c); };
        cold.controls.add(li('a'), li('b'));
        expect(before).toBe(2);
        cold.build();
        expect(ids(cold.controls.items)).toBe('a,b');
    });
});
