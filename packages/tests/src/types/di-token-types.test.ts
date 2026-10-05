import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const fixture = `
import { Component, FromService, ServiceProvider } from '@motifx/core';
class AuthService { user = 'me'; }
abstract class Store { abstract items: number[]; }
const TOKEN = Symbol('cfg');
declare const provider: ServiceProvider;
export class Page extends Component<HTMLDivElement> {
    auth = this.getService(AuthService);
    store = this.getService(Store);
    cfg = this.getService<{ url: string }>(TOKEN);
    named = this.getService('name');
    explicit = this.getService<AuthService>(AuthService);
}
declare const page: Page;
export const a: AuthService | null = page.auth;
export const s: Store | null = page.store;
export const c: { url: string } | null = page.cfg;
export const n: number = page.named;
export const e: AuthService | null = page.explicit;
export const f1: AuthService = FromService(AuthService);
export const f2: { url: string } = FromService<{ url: string }>(TOKEN);
export const g1: AuthService = provider.get(AuthService);
export const g2: Store = provider.get(Store);
export const g3: Promise<AuthService> = provider.getAsync(AuthService);
export const g4: Promise<{ url: string }> = provider.getAsync<{ url: string }>('cfg');
// expect TS2322
export const w1: string | null = page.auth;
// expect TS2322
export const w2: number = FromService(AuthService);
// expect TS2322
export const w3: Promise<string> = provider.getAsync(Store);
`;

function diagnose(source: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-di-types-'));
    const file = path.join(dir, 'fixture.ts');
    fs.writeFileSync(file, source);
    try {
        const program = ts.createProgram([file], {
            target: ts.ScriptTarget.ES2021,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
            paths: { '@motifx/core': [coreTypes] },
        });
        const sf = program.getSourceFile(file)!;
        return ts.getPreEmitDiagnostics(program)
            .filter(d => d.file === sf)
            .map(d => ({ line: sf.getLineAndCharacterOfPosition(d.start!).line, code: `TS${d.code}` }));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function expectedFrom(source: string) {
    return source.split('\n').flatMap((text, line) => {
        const m = /^\/\/ expect (TS\d+)/.exec(text);
        return m ? [{ line: line + 1, code: m[1] }] : [];
    });
}

describe('DI token types under strict', () => {
    test('a class token types the result; string and symbol tokens take an explicit generic', () => {
        const actual = diagnose(fixture);
        const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
        expect(actual.filter(d => d.code === 'TS7006')).toEqual([]);
        expect([...new Set(actual.map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine))
            .toEqual(expectedFrom(fixture).sort(byLine));
    });
});
