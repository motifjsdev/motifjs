import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import vitePlugin from '../src/vitePlugin';

const terminal = [
    "import { Component, ComponentBase, motifComponent } from '@motifx/core';",
    'export class BuildTerminal extends Component<HTMLDivElement> {',
    "    override onConfig(): void { this.class.add('term-host'); }",
    '    override view() { return motifComponent("p", (p: ComponentBase) => p.setText("x")); }',
    '}',
].join('\n');

const withState = [
    "import { Component, reactive } from '@motifx/core';",
    'const state = reactive({ open: false });',
    'export class Badge extends Component<HTMLSpanElement> {',
    '    get open(): boolean { return state.open; }',
    '}',
].join('\n');

const withDecorators = [
    "import { Component, Injectable } from '@motifx/core';",
    '@Injectable({ lifetime: "singleton" })',
    'export class Hub { statusOf(p: string): string { return p; } }',
    'export class Packages extends Component<HTMLElement> {',
    '    readonly label: string = "packages";',
    '}',
].join('\n');

const vite = () => vitePlugin({ diagnostics: false });
const tagsOf = (code: string) => [...code.matchAll(/static elementTag = "([^"]+)"/g)].map(m => m[1]);

function tempProject(tsconfig: object) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-ts-element-'));
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
    fs.mkdirSync(path.join(dir, 'src'));
    return { dir, file: path.join(dir, 'src', 'Packages.ts').replace(/\\/g, '/') };
}

describe('element type declared on a class in a .ts file', () => {
    const made: string[] = [];
    afterAll(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });

    test.each([
        '/src/terminal/BuildTerminal.ts',
        '/src/terminal/BuildTerminal.mts',
        '/src/terminal/BuildTerminal.cts',
        '/src/terminal/BuildTerminal.ts?t=1729200000000',
    ])('%s gets its element from the type and keeps TypeScript syntax', (id) => {
        const out = vite().transform(terminal, id);
        expect(out && out.code).toBeTruthy();
        expect(tagsOf(out!.code)).toEqual(['div']);
        expect(out!.code).toContain('override onConfig(): void');
        expect(out!.map).toBeTruthy();
    });

    test('a file with reactive state gets it too', () => {
        const out = vite().transform(withState, '/src/parts/Badge.ts');
        expect(tagsOf(out!.code)).toEqual(['span']);
    });

    test('standard decorators are lowered and the element is declared', () => {
        const { dir, file } = tempProject({ compilerOptions: { target: 'ES2022' } });
        made.push(dir);
        const out = vite().transform(withDecorators, file);
        expect(out!.code).not.toMatch(/^\s*@Injectable/m);
        expect(tagsOf(out!.code)).toEqual(['div']);
    });

    test('legacy decorators are left to TypeScript and the element is declared', () => {
        const { dir, file } = tempProject({ compilerOptions: { target: 'ES2022', experimentalDecorators: true } });
        made.push(dir);
        const out = vite().transform(withDecorators, file);
        expect(out!.code).toMatch(/^\s*@Injectable/m);
        expect(tagsOf(out!.code)).toEqual(['div']);
    });

    test('an SVG type also declares the namespace', () => {
        const src = "import { Component } from '@motifx/core';\nexport class Icon extends Component<SVGSVGElement> {}";
        const out = vite().transform(src, '/src/parts/Icon.ts');
        expect(tagsOf(out!.code)).toEqual(['svg']);
        expect(out!.code).toContain('static elementNamespace = "http://www.w3.org/2000/svg"');
    });

    test('a written static elementTag stays the only one', () => {
        const src = "import { Component } from '@motifx/core';\nexport class Shell extends Component<HTMLDivElement> {\n    static elementTag = 'section';\n}";
        const out = vite().transform(src, '/src/layouts/Shell.ts');
        expect(out && out.code ? (out.code.match(/elementTag/g) || []).length : 1).toBe(1);
    });

    test.each([
        ['a declaration file', '/src/terminal/BuildTerminal.d.ts', terminal],
        ['a dependency', '/app/node_modules/lib/BuildTerminal.ts', terminal],
        ['a JavaScript file', '/src/terminal/build-terminal.js', "export const label = 'Component<HTMLDivElement>';"],
        ['a raw import', '/src/terminal/BuildTerminal.ts?raw', terminal],
        ['a file without a declared element type', '/src/util/format.ts', 'export const pad = (n: number): string => String(n).padStart(2, "0");'],
    ])('leaves %s alone', (_name, id, src) => {
        expect(vite().transform(src, id)).toBeUndefined();
    });
});
