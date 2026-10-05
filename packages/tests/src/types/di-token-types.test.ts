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

const constructorFixture = `
import { Component, FromService, ServiceProvider, inject } from '@motifx/core';
type Same<A, B> = (<G>() => G extends A ? 1 : 2) extends (<G>() => G extends B ? 1 : 2) ? true : false;
declare function check<T extends true>(): void;
interface ILogger { log(m: string): void; }
class NoParams { a = 1; }
class WithParams { constructor(public api: NoParams, n: number) { } b = 1; }
class Optional { constructor(x?: string) { } c = 1; }
class RestParams { constructor(...xs: number[]) { } d = 1; }
abstract class Repo { constructor(n: number) { } abstract find(): number; }
class Guarded { protected constructor(x: number) { } e = 1; }
class Box<T> { constructor(public v: T) { } }
class Logger implements ILogger { constructor(p: string) { } log(m: string) { } }
declare const provider: ServiceProvider;
declare const host: Component;
const f1 = FromService(WithParams);
const f1t = FromService<WithParams>(WithParams);
const f2 = FromService(Repo);
const f2t = FromService<Repo>(Repo);
const f3 = FromService(Guarded);
const f4 = FromService(Box);
const f4t = FromService<Box<string>>(Box);
const f5 = FromService<ILogger>(Logger);
const f6 = FromService(Logger);
const s1 = host.getService(WithParams);
const s1t = host.getService<WithParams>(WithParams);
const s2 = host.getService(Optional);
const g1 = provider.get(RestParams);
const g1t = provider.get<RestParams>(RestParams);
const g2 = provider.getAsync(WithParams);
const g2t = provider.getAsync<WithParams>(WithParams);
const i1 = inject(WithParams);
const i1t = inject<WithParams>(WithParams);
const n1 = FromService(NoParams);
check<Same<typeof f1, WithParams>>();
check<Same<typeof f1, typeof f1t>>();
check<Same<typeof f2, Repo>>();
check<Same<typeof f2, typeof f2t>>();
check<Same<typeof f3, Guarded>>();
check<Same<typeof f4, Box<any>>>();
check<Same<typeof f4t, Box<string>>>();
check<Same<typeof f5, ILogger>>();
check<Same<typeof f6, Logger>>();
check<Same<typeof s1, WithParams | null>>();
check<Same<typeof s1, typeof s1t>>();
check<Same<typeof s2, Optional | null>>();
check<Same<typeof g1, RestParams>>();
check<Same<typeof g1, typeof g1t>>();
check<Same<typeof g2, Promise<WithParams>>>();
check<Same<typeof g2, typeof g2t>>();
check<Same<typeof i1, WithParams>>();
check<Same<typeof i1, typeof i1t>>();
check<Same<typeof n1, NoParams>>();
`;

describe('DI token types under strict', () => {
    test('a class token types the result; string and symbol tokens take an explicit generic', () => {
        const actual = diagnose(fixture);
        const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
        expect(actual.filter(d => d.code === 'TS7006')).toEqual([]);
        expect([...new Set(actual.map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine))
            .toEqual(expectedFrom(fixture).sort(byLine));
    });

    test('a class whose constructor takes parameters is typed the same with or without the generic', () => {
        expect(diagnose(constructorFixture)).toEqual([]);
    });
});
