/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function mountWith(cb: () => any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host, {
        initializeComponent: (s: ComponentBase) => {
            s.controls.add(new Component('i'));
            s.bindings.method(cb);
            s.controls.add(new Component('b'));
        },
    } as any);
    root.build();
    return { host, root };
}

const shape = (host: HTMLElement) => Array.from(host.childNodes)
    .filter(n => n.nodeType !== Node.COMMENT_NODE)
    .map(n => n.nodeType === Node.TEXT_NODE ? `"${n.textContent}"` : (n as Element).tagName.toLowerCase());

describe('bindings.method evaluates its function once per run', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a component result: one call and one component on the first render', async () => {
        const made: ComponentBase[] = [];
        let calls = 0;
        const { host, root } = mountWith(() => { calls++; const c = new Component('em'); made.push(c); return c; });
        await tick();
        expect(calls).toBe(1);
        expect(made.length).toBe(1);
        expect(host.querySelectorAll('em').length).toBe(1);
        await root.dispose();
    });

    test('a text result: one call on the first render and one per change', async () => {
        const s = reactive({ n: 1 });
        let calls = 0;
        const { host, root } = mountWith(() => { calls++; return `n=${s.n}`; });
        await tick();
        expect(calls).toBe(1);
        expect(shape(host)).toEqual(['i', '"n=1"', 'b']);
        s.n = 2;
        await tick();
        expect(calls).toBe(2);
        expect(shape(host)).toEqual(['i', '"n=2"', 'b']);
        await root.dispose();
    });

    test('a component result: one call per change', async () => {
        const s = reactive({ n: 1 });
        let calls = 0;
        const { host, root } = mountWith(() => { calls++; const c = new Component('em'); (c.element as HTMLElement).textContent = String(s.n); return c; });
        await tick();
        s.n = 2;
        await tick(20);
        expect(calls).toBe(2);
        expect(host.querySelector('em')!.textContent).toBe('2');
        expect(host.querySelectorAll('em').length).toBe(1);
        await root.dispose();
    });
});

describe('bindings.method switches between text and component in place', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('text, then a component, then text again', async () => {
        const s = reactive({ mode: 'text' as 'text' | 'comp' });
        const made: ComponentBase[] = [];
        const { host, root } = mountWith(() => {
            if (s.mode === 'text') return 'hello';
            const c = new Component('em');
            made.push(c);
            return c;
        });
        await tick();
        expect(shape(host)).toEqual(['i', '"hello"', 'b']);

        s.mode = 'comp';
        await tick(20);
        expect(shape(host)).toEqual(['i', 'em', 'b']);

        s.mode = 'text';
        await tick(20);
        expect(shape(host)).toEqual(['i', '"hello"', 'b']);
        expect(made.length).toBe(1);
        expect(made[0].isDisposed).toBe(true);
        await root.dispose();
    });

    test('a component first, then text', async () => {
        const s = reactive({ comp: true });
        const made: ComponentBase[] = [];
        const { host, root } = mountWith(() => {
            if (!s.comp) return 42;
            const c = new Component('em');
            made.push(c);
            return c;
        });
        await tick();
        expect(shape(host)).toEqual(['i', 'em', 'b']);

        s.comp = false;
        await tick(20);
        expect(shape(host)).toEqual(['i', '"42"', 'b']);
        expect(made[0].isDisposed).toBe(true);
        await root.dispose();
    });

    test('null in component mode empties the place, a later component fills it again', async () => {
        const s = reactive({ show: true });
        const made: ComponentBase[] = [];
        const { host, root } = mountWith(() => {
            if (!s.show) return null;
            const c = new Component('em');
            made.push(c);
            return c;
        });
        await tick();
        expect(shape(host)).toEqual(['i', 'em', 'b']);

        s.show = false;
        await tick(20);
        expect(shape(host)).toEqual(['i', 'b']);
        expect(made[0].isDisposed).toBe(true);

        s.show = true;
        await tick(20);
        expect(shape(host)).toEqual(['i', 'em', 'b']);
        await root.dispose();
    });

    test('null in text mode writes empty text', async () => {
        const s = reactive({ v: 'x' as string | null });
        const { host, root } = mountWith(() => s.v);
        await tick();
        s.v = null;
        await tick();
        expect(shape(host)).toEqual(['i', '""', 'b']);
        await root.dispose();
    });
});

describe('a compiled member-call child', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('{this.part()} builds one component', async () => {
        const out = new compiler.Compiler().start(`
            class App extends Component {
                calls = 0;
                constructor(p){ super('section', p); }
                part(){ this.calls++; return <b />; }
                view(){ return <div>{this.part()}</div>; }
            }`, 'M.tsx');
        const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
        const App = new Function('_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', `"use strict";\n${code}\nreturn App;`)(
            motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component, reactive);
        const app = new App({});
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        root.controls.add(app);
        await tick();
        expect(app.calls).toBe(1);
        expect(host.querySelectorAll('b').length).toBe(1);
        await root.dispose();
    });
});
