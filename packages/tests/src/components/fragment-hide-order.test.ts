import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { await tick(); await tick(); };

class Part extends Component {
    static log: string[] = [];
    constructor(public tag: string, el?: string) { super(el as any); }
    onActivated() { Part.log.push(this.tag + ':activated'); }
    onDeactivated() { Part.log.push(this.tag + ':deactivated'); }
    onVisibilityChanged(_s: any, e: any) { Part.log.push(this.tag + ':visibility=' + e.visible); }
}

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'FragmentOrder.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

describe('hiding and showing a fragment component', () => {
    let hostEl: HTMLElement;
    let host: Component;

    beforeEach(() => {
        Part.log = [];
        hostEl = document.body.appendChild(document.createElement('section'));
        host = new Component(hostEl);
        host.build();
    });
    afterEach(() => { host.dispose(); document.body.innerHTML = ''; });

    const traces = () => (hostEl.innerHTML.match(/<!--h-->/g) || []).length;

    test('notifies the fragment first, then the visible subtree, and keeps the children\'s own visibility', async () => {
        const root = new Part('root');
        const c1 = new Part('child1', 'span');
        const c2 = new Part('child2', 'span');
        c1.controls.add(new Part('grand', 'i'));
        root.controls.add(c1, c2);
        host.controls.add(root);
        await settle();
        Part.log = [];

        await root.motif.hide();
        await settle();
        expect(Part.log).toEqual(['root:visibility=false', 'root:deactivated', 'child1:deactivated', 'grand:deactivated', 'child2:deactivated']);
        expect(hostEl.querySelector('span')).toBeNull();
        expect(traces()).toBe(2);
        expect(root.isVisible).toBe(false);
        expect(c1.isVisible).toBe(true);
        expect(c2.isVisible).toBe(true);

        Part.log = [];
        await root.motif.show();
        await settle();
        expect(Part.log).toEqual(['root:visibility=true', 'root:activated', 'child1:activated', 'grand:activated', 'child2:activated']);
        expect(hostEl.querySelectorAll('span').length).toBe(2);
        expect(hostEl.querySelector('i')).not.toBeNull();
        expect(traces()).toBe(0);
    });

    test('a child hidden on its own stays hidden through the fragment\'s hide and show', async () => {
        const root = new Part('root');
        const c1 = new Part('child1', 'span');
        const c2 = new Part('child2', 'span');
        root.controls.add(c1, c2);
        host.controls.add(root);
        await settle();
        await c2.motif.hide();
        await settle();
        Part.log = [];

        await root.motif.hide();
        await settle();
        expect(Part.log).toEqual(['root:visibility=false', 'root:deactivated', 'child1:deactivated']);
        expect(traces()).toBe(2);

        Part.log = [];
        await root.motif.show();
        await settle();
        expect(Part.log).toEqual(['root:visibility=true', 'root:activated', 'child1:activated']);
        expect(c2.isVisible).toBe(false);
        expect(hostEl.querySelectorAll('span').length).toBe(1);
        expect(traces()).toBe(1);

        Part.log = [];
        await c2.motif.show();
        await settle();
        expect(Part.log).toEqual(['child2:visibility=true', 'child2:activated']);
        expect(hostEl.querySelectorAll('span').length).toBe(2);
        expect(traces()).toBe(0);
    });

    test('a nested fragment follows the same order and leaves one trace per element', async () => {
        const root = new Part('root');
        const inner = new Part('inner');
        inner.controls.add(new Part('a', 'span'), new Part('b', 'span'));
        root.controls.add(inner);
        host.controls.add(root);
        await settle();
        Part.log = [];

        await root.motif.hide();
        await settle();
        expect(Part.log).toEqual(['root:visibility=false', 'root:deactivated', 'inner:deactivated', 'a:deactivated', 'b:deactivated']);
        expect(traces()).toBe(2);
        expect(inner.isVisible).toBe(true);

        Part.log = [];
        await root.motif.show();
        await settle();
        expect(Part.log).toEqual(['root:visibility=true', 'root:activated', 'inner:activated', 'a:activated', 'b:activated']);
        expect(hostEl.querySelectorAll('span').length).toBe(2);
        expect(traces()).toBe(0);
    });

    test('x-display on a fragment class tag in compiled JSX notifies the fragment first', async () => {
        const st = reactive({ open: true });
        const log: string[] = [];
        const A = evalJsx(`
            class Item extends Component {
                constructor(p) { super('span', p); }
                onActivated() { log.push(this.props.tag + ':activated'); }
                onDeactivated() { log.push(this.props.tag + ':deactivated'); }
            }
            class Group extends Component {
                onActivated() { log.push('group:activated'); }
                onDeactivated() { log.push('group:deactivated'); }
            }
            function A() { return <main><Group x-display={() => st.open}><Item tag="a" /><Item tag="b" /></Group></main>; }
        `, 'A', { st, log });
        host.controls.add(A());
        await settle();
        const main = hostEl.querySelector('main')!;
        expect(main.querySelectorAll('span').length).toBe(2);

        st.open = false;
        await settle();
        expect(log).toEqual(['group:deactivated', 'a:deactivated', 'b:deactivated']);
        expect(main.querySelectorAll('span').length).toBe(0);

        log.length = 0;
        st.open = true;
        await settle();
        expect(log).toEqual(['group:activated', 'a:activated', 'b:activated']);
        expect(main.querySelectorAll('span').length).toBe(2);
    });

    test('a child added while the fragment is hidden takes a trace and appears in order on show', async () => {
        const root = new Part('root');
        const inner = new Part('inner');
        const a = new Part('a', 'span');
        inner.controls.add(a);
        root.controls.add(inner);
        host.controls.add(root);
        await settle();
        await root.motif.hide();
        await settle();
        expect(traces()).toBe(1);

        const b = new Part('b', 'span');
        const c = new Part('c', 'em');
        inner.controls.add(b);
        root.controls.add(c);
        await settle();
        expect(hostEl.querySelector('span')).toBeNull();
        expect(hostEl.querySelector('em')).toBeNull();
        expect(traces()).toBe(2);
        expect(b.isBuilt).toBe(true);
        expect(b.isVisible).toBe(true);
        expect(c.isBuilt).toBe(false);

        Part.log = [];
        await root.motif.show();
        await settle();
        expect(Part.log).toEqual(['root:visibility=true', 'root:activated', 'inner:activated', 'a:activated']);
        expect(traces()).toBe(0);
        const tags = Array.from(hostEl.querySelectorAll('span, em')).map(e => e.tagName.toLowerCase());
        expect(tags).toEqual(['span', 'span', 'em']);
    });
});
