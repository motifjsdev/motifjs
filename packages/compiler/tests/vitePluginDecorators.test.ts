import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import vitePlugin, { shouldLowerDecorators } from '../src/vitePlugin';

const service = [
    "import { Injectable } from '@motifx/core';",
    '',
    '@Injectable({ lifetime: "singleton" })',
    'export class Api {',
    '    private readonly base: string = "/api";',
    '    url(p: string): string { return this.base + p; }',
    '}',
].join('\n');

const runnable = [
    'const seen: string[] = [];',
    'function Injectable(options: { lifetime: string }) {',
    '    return (value: Function, context: { kind: string; name?: string }) => { seen.push(context.kind + ":" + context.name + ":" + options.lifetime); };',
    '}',
    '@Injectable({ lifetime: "singleton" })',
    'class Api {',
    '    private readonly base: string = "/api";',
    '    url(p: string): string { return this.base + p; }',
    '}',
    'module.exports = { seen, url: new Api().url("/x") };',
].join('\n');

function tempProject(tsconfig: object | null) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-decorators-'));
    if (tsconfig) fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig));
    fs.mkdirSync(path.join(dir, 'src'));
    return { dir, file: path.join(dir, 'src', 'Api.ts').replace(/\\/g, '/') };
}

describe('vitePlugin decorators in plain script files', () => {
    const made: string[] = [];
    afterAll(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });

    test.each([
        '/src/services/Api.ts',
        '/src/services/Api.mts',
        '/src/services/Api.js',
        '/src/services/Api.mjs',
        '/src/services/Api.ts?t=1727353200000',
    ])('lowers decorators in %s', (id) => {
        expect(shouldLowerDecorators(id, service)).toBe(true);
    });

    test.each([
        ['a file without decorators', '/src/Api.ts', "import { x } from '@motifx/core';\nexport const a = '@b';"],
        ['a declaration file', '/src/Api.d.ts', service],
        ['a dependency', '/project/node_modules/lib/index.js', service],
        ['a raw import', '/src/Api.ts?raw', service],
        ['a virtual module', '\0virtual:Api.ts', service],
        ['a JSX file', '/src/App.tsx', service],
    ])('leaves %s alone', (_name, id, src) => {
        expect(shouldLowerDecorators(id, src)).toBe(false);
    });

    test('the decorator is gone and the TypeScript syntax is kept', () => {
        const { dir, file } = tempProject({ compilerOptions: { target: 'ES2022' } });
        made.push(dir);
        const out = vitePlugin({ diagnostics: false }).transform(service, file);
        expect(out && out.code).toBeTruthy();
        expect(out!.code).not.toMatch(/^\s*@Injectable/m);
        expect(out!.code).toContain('private readonly base: string');
        expect(out!.map).toBeTruthy();
    });

    test('the lowered class runs with standard decorator semantics', () => {
        const { dir, file } = tempProject({ compilerOptions: { target: 'ES2022' } });
        made.push(dir);
        const out = vitePlugin({ diagnostics: false }).transform(runnable, file);
        const js = ts.transpileModule(out!.code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
        const mod: any = { exports: {} };
        new Function('module', 'exports', js)(mod, mod.exports);
        expect(mod.exports.seen).toEqual(['class:Api:singleton']);
        expect(mod.exports.url).toBe('/api/x');
    });

    test('files under a tsconfig with experimentalDecorators are left to the TypeScript transform', () => {
        const { dir, file } = tempProject({ compilerOptions: { experimentalDecorators: true } });
        made.push(dir);
        expect(vitePlugin({ diagnostics: false }).transform(service, file)).toBeUndefined();
    });

    test('experimentalDecorators is read through extends', () => {
        const { dir, file } = tempProject({ extends: './tsconfig.base.json' });
        made.push(dir);
        fs.writeFileSync(path.join(dir, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { experimentalDecorators: true } }));
        expect(vitePlugin({ diagnostics: false }).transform(service, file)).toBeUndefined();
    });
});
