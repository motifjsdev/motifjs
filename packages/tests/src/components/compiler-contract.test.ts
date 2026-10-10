import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const RUNTIME_IMPORTS = ['FNComponent', 'asyncTracking', 'motifCompiled', 'motifComponent', 'motifFragment'];

const SENDER_MEMBERS = [
    'attr.add',
    'bindings.add',
    'bindings.display',
    'bindings.list',
    'bindings.method',
    'bindings.model',
    'bindings.switchCase',
    'bindings.ternary',
    'bindings.ternaryCall',
    'bindings.wait',
    'bindings.when',
    'class.add',
    'controls.add',
    'motif.on',
    'setText',
    'style',
];

const HIDDEN_KEYS = ['__childExpr', '__isSvgElement', 'childs', 'elementTag', 'initializeComponent', 'onRefCreated', 'runover'];

const ASYNC_TRACKING_METHODS = ['capture', 'end', 'resume', 'suspend'];

const PANEL = `
import { Component, reactive } from '@motifx/core';
export class Panel extends Component<HTMLDivElement> {
    s = reactive({ n: 1, on: true, list: [{ id: 1 }, { id: 2 }], text: 'a' });
    extra = new Component('em');
    field: any = null;
    refs: any[] = [];
    marked: any = null;
    called: any = null;
    mark(c: any) { this.marked = c; }
    view() {
        const extra = this.extra;
        return <>
            <span class={() => this.s.on ? 'a' : 'b'} title={() => String(this.s.n)} style={{ color: 'red' }} onClick={() => this.s.n++}>{() => this.s.n}</span>
            <input x-model={this.s.text} x-wait={() => this.s.on} ref={this.field} />
            <em ref={this.mark} />
            <small ref={(c: any) => { this.called = c; }} />
            {this.s.list.map(item => <b key={item.id}>{item.id}</b>)}
            {this.s.on && <i>when</i>}
            {this.s.on ? <u>yes</u> : this.s.n ? <s>n</s> : <q>no</q>}
            {() => { switch (this.s.n) { case 1: return <b>one</b>; default: return <b>other</b>; } }}
            {extra}
            {this.s.text}
            <svg><path d="M0 0" /></svg>
            <Card x-display={() => this.s.on} onPick={() => this.s.n++}>kid</Card>
        </>;
    }
    onRefCreated(sender: any) { this.refs.push(sender); }
}
export function Card(props: any) { return <article>{props.childs}</article>; }
`;

const GRID = `
import { Virtualization } from '@motifx/core';
export function Grid() {
    return <Virtualization dataRequest={async (q: any) => { const rows = await Promise.resolve([]); return rows; }} />;
}
`;

const compile = (source: string, file: string): string => new compiler.Compiler().start(source, file).code;

function evaluate(code: string, name: string): any {
    const body = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/gm, '').replace(/^export /gm, '');
    const fn = new Function('_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', `"use strict";\n${body}\nreturn ${name};`);
    return fn(motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component, reactive);
}

function mount(child: ComponentBase): Component {
    const root = new Component(document.createElement('div'));
    document.body.appendChild(root.element as HTMLElement);
    root.build();
    root.controls.add(child);
    return root;
}

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

describe('compiler contract', () => {
    const panel = compile(PANEL, 'Panel.tsx');
    const grid = compile(GRID, 'Grid.tsx');
    const both = panel + '\n' + grid;

    afterEach(() => { document.body.innerHTML = ''; });

    test('the compiler imports only the listed runtime exports, and each exists', () => {
        const imported = [...both.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@motifx\/core"/g)]
            .flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
        expect(sorted(imported)).toEqual(RUNTIME_IMPORTS);
        for (const name of RUNTIME_IMPORTS) expect((motif as any)[name]).toBeDefined();
    });

    test('every compiled module is stamped with the contract version', () => {
        expect(panel).toContain(`/*#__PURE__*/_mv(${2});`);
        expect(grid).toContain(`/*#__PURE__*/_mv(${2});`);
    });

    test('the sender members the compiler calls are the listed ones and exist on a component', () => {
        const used = sorted([...both.matchAll(/\bsender\.([A-Za-z_]+(?:\.[A-Za-z_]+)?)/g)].map(m => m[1]));
        expect(used).toEqual(SENDER_MEMBERS);
        const probe = new Component('div');
        for (const member of SENDER_MEMBERS) {
            const [head, tail] = member.split('.');
            const target = tail ? (probe as any)[head] : probe;
            expect(typeof target?.[tail ?? head]).toBe('function');
        }
    });

    test('the hidden keys the compiler emits are the listed ones', () => {
        for (const key of HIDDEN_KEYS) expect(both).toMatch(new RegExp(`\\b${key}\\b`));
        const underscored = sorted([...both.matchAll(/\b(__[A-Za-z]+)\b/g)].map(m => m[1]).filter(k => k !== '__motifAsyncTracking'));
        expect(underscored).toEqual(HIDDEN_KEYS.filter(k => k.startsWith('__')));
    });

    test('asyncTracking calls are the listed ones and exist in the runtime', () => {
        const used = sorted([...grid.matchAll(/__motifAsyncTracking\.([A-Za-z]+)/g)].map(m => m[1]));
        expect(used).toEqual(ASYNC_TRACKING_METHODS);
        for (const method of ASYNC_TRACKING_METHODS) expect(typeof (motif.asyncTracking as any)[method]).toBe('function');
    });

    test('the runtime honours the hidden keys', async () => {
        const Panel = evaluate(panel, 'Panel');
        const panelInstance = new Panel();
        const root = mount(panelInstance);
        const el = panelInstance.element as HTMLElement;

        expect(el.tagName).toBe('DIV');
        expect(el.querySelector('path')!.namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect(el.contains(panelInstance.extra.element)).toBe(true);
        expect(el.querySelector('article')!.textContent).toBe('kid');
        expect(panelInstance.refs).toEqual([panelInstance.field, panelInstance.marked]);
        expect(panelInstance.called).not.toBeNull();
        expect((panelInstance.field.element as HTMLElement).tagName).toBe('INPUT');

        const article = el.querySelector('article')!;
        panelInstance.s.on = false;
        await new Promise(r => setTimeout(r, 0));
        expect(el.contains(article)).toBe(false);
        await root.dispose();
    });
});

const HOOKS = `
import { Component } from '@motifx/core';
export class Hooks extends Component<HTMLDivElement> {
    s = reactive({ on: false });
    x: any = null;
    y: any = null;
    mounted = 0;
    built = 0;
    view() {
        return <>
            <em ref={this.x} x-wait={() => this.s.on} onmounted={() => { this.mounted++; }} transition={{ name: 'fx' }} options={{ hideStrategy: 'detach', disableDisposal: true }} />
            <Card x-display={() => this.s.on} ref={this.y} onBuilt={() => { this.built++; }}>kid</Card>
        </>;
    }
}
export class Dot extends Component<SVGCircleElement> { }
export function Card(props: any) { return <article>{props.childs}</article>; }
`;

const FRAMEWORK_KEYS = ['elementNamespace', 'onmounted', 'options', 'preconfig', 'ref', 'transition'];

describe('compiler contract: framework props', () => {
    const hooks = compile(HOOKS, 'Hooks.tsx');

    afterEach(() => { document.body.innerHTML = ''; });

    test('the framework keys the compiler emits are the listed ones', () => {
        for (const key of FRAMEWORK_KEYS) expect(hooks).toMatch(new RegExp(`\\b${key}\\b`));
        expect(hooks).toMatch(/runover:\s*\{[\s\S]*preconfig[\s\S]*onBuilt/);
        expect(hooks).toContain('Dot.elementNamespace = "http://www.w3.org/2000/svg"');
    });

    test('the runtime honours the framework keys', async () => {
        const Hooks = evaluate(hooks, 'Hooks');
        const Dot = evaluate(hooks, 'Dot');
        const instance = new Hooks();
        const root = mount(instance);
        await new Promise(r => setTimeout(r, 0));
        const el = instance.element as HTMLElement;

        expect(instance.x.element.tagName).toBe('EM');
        expect(instance.y).toBeInstanceOf(Component);
        expect(instance.mounted).toBe(1);
        expect(instance.x.motif.options.transition.classes?.name ?? instance.x.motif.options.transition.name).toBe('fx');
        expect(instance.x.motif.options.hideStrategy).toBe('detach');
        expect(instance.x.motif.options.disableDisposal).toBe(true);
        expect(el.querySelector('article')).toBeNull();
        expect(instance.built).toBe(0);

        instance.s.on = true;
        await new Promise(r => setTimeout(r, 0));
        expect(el.querySelector('article')!.textContent).toBe('kid');
        expect(instance.built).toBe(1);

        expect((new Dot().element as Element).namespaceURI).toBe('http://www.w3.org/2000/svg');
        await root.dispose();
    });

    test('a ternary branch calls navigate on the frame it receives', () => {
        const panel = compile(PANEL, 'Panel.tsx');
        const members = sorted([...panel.matchAll(/\bframe\.([A-Za-z_]+)/g)].map(m => m[1]));
        expect(members).toEqual(['navigate']);
        expect(typeof (motif as any).Frame.prototype.navigate).toBe('function');
    });

    test('a module whose top level is JSX imports Component, and it runs', () => {
        const aio = compile('<div class="top">top</div>', 'Top.aio');
        const imported = [...aio.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@motifx\/core"/g)]
            .flatMap(m => m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
        expect(imported).toContain('Component');
        for (const name of imported) expect((motif as any)[name]).toBeDefined();
        const body = aio.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/gm, '').replace(/^export default /m, '');
        const Top = new Function('_mc', '_mf', '_mfc', '_mv', '_mC', `"use strict";
${body}
return runtimeClass;`)(
            motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component);
        const root = mount(new Top());
        expect(document.querySelector('.top')!.textContent).toBe('top');
        return root.dispose();
    });
});

describe('motifCompiled', () => {
    test('a matching contract is silent', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis as any).__MOTIF_DEV__ = true;
        try {
            motif.motifCompiled(1);
            expect(warn).not.toHaveBeenCalled();
        } finally {
            delete (globalThis as any).__MOTIF_DEV__;
            warn.mockRestore();
        }
    });

    test('a different contract warns once with MJX121 in development', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis as any).__MOTIF_DEV__ = true;
        try {
            motif.motifCompiled(99);
            motif.motifCompiled(99);
            expect(warn.mock.calls.map(c => String(c[0]))).toEqual([
                '[motifjs] MJX121: This code was compiled for compiler contract 99, but the @motifx/core runtime implements contract 2. Install matching versions of @motifx/compiler and @motifx/core, and rebuild packages that ship compiled JSX.',
            ]);
        } finally {
            delete (globalThis as any).__MOTIF_DEV__;
            warn.mockRestore();
        }
    });
});
