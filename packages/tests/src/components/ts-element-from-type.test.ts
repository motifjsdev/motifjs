/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';
import * as ts from 'typescript';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const compiler = require('../../../compiler/dist/index.cjs');
const vitePlugin = compiler.default || compiler;

function loadTs(source: string, id: string): Record<string, any> {
    const out = vitePlugin({ diagnostics: false }).transform(source, id);
    const code: string = out && out.code ? out.code : source;
    const js = ts.transpileModule(code, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, useDefineForClassFields: true },
    }).outputText;
    const mod: any = { exports: {} };
    const requireCore = (name: string) => {
        if (name === '@motifx/core') return motif;
        throw new Error(`unexpected import ${name}`);
    };
    new Function('module', 'exports', 'require', js)(mod, mod.exports, requireCore);
    return mod.exports;
}

const settle = async () => {
    for (let i = 0; i < 3; i++) {
        await Promise.resolve();
        await new Promise(r => setTimeout(r, 0));
    }
};

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

describe('a class in a .ts file gets its element from the declared type', () => {
    test('the terminal host is a div that takes classes and child nodes', async () => {
        const { BuildTerminal } = loadTs([
            "import { Component, ComponentBase, motifComponent } from '@motifx/core';",
            'export class BuildTerminal extends Component<HTMLDivElement> {',
            "    override onConfig(): void { this.class.add('term-host'); }",
            "    override onMounted(): void { const screen = document.createElement('pre'); screen.textContent = 'ready'; this.element.appendChild(screen); }",
            '}',
        ].join('\n'), '/src/terminal/BuildTerminal.ts');
        const terminal = new BuildTerminal();
        root.controls.add(terminal);
        await settle();
        expect(terminal.element.nodeType).toBe(Node.ELEMENT_NODE);
        expect(terminal.element.tagName).toBe('DIV');
        expect(host.innerHTML).toContain('<div class="term-host"><pre>ready</pre></div>');
    });

    test('a tag passed to super still wins over the declared type', async () => {
        const { Shell } = loadTs([
            "import { Component } from '@motifx/core';",
            'export class Shell extends Component<HTMLDivElement> {',
            "    constructor() { super('section'); }",
            '}',
        ].join('\n'), '/src/layouts/Shell.ts');
        const shell = new Shell();
        root.controls.add(shell);
        await settle();
        expect(shell.element.tagName).toBe('SECTION');
    });

    test('a class with no declared type stays a fragment', async () => {
        const { Page } = loadTs([
            "import { Component, ComponentBase, motifComponent } from '@motifx/core';",
            'export class Page extends Component {',
            '    override view() { return motifComponent("main", (m: ComponentBase) => m.setText("x")); }',
            '}',
        ].join('\n'), '/src/pages/Page.ts');
        const page = new Page();
        root.controls.add(page);
        await settle();
        expect(page.element.nodeType).toBe(Node.COMMENT_NODE);
        expect(host.querySelector('main')).not.toBeNull();
    });
});
