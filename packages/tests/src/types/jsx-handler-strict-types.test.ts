import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const fixture = `
import { Application, Component, ComponentBase, effect, reactive } from '@motifx/core';
type Note = { id: number; title: string };
declare const app: Application;
declare const note: Note;
declare function log(...args: unknown[]): void;
const search = reactive({ query: '', onlyPinned: false });
export class Editor extends Component<HTMLElement> { }
export function A1() { return <a href="/x" onclick:prevent={(sender, e) => { void sender.context.navigate('/x'); return e.clientX; }} />; }
export function A2() { return <input onkeydown:once={(e) => e.key} />; }
export function A3() { return <div on:saved={(saved) => log(saved)} on-click={(sender, e) => log(sender, e)} on_click={(e) => log(e)} />; }
export function A4() { return <Editor on:saved={(saved) => log(saved)} onclick:stop={(sender, e) => sender.element && e.clientX} />; }
export function A5() { return <ul oninitializeComponent={(list) => list.class.add(list.controls.items.length > 5 ? 'many' : 'few')} />; }
export function A6() { return <Editor oninitializeComponent={(editor) => editor.element} />; }
export const s1 = effect(() => search.query, (query: string) => log(encodeURIComponent(query)));
export const s2 = effect(() => search.onlyPinned, (on) => { const b: boolean = on; return b; });
export const s3 = app.onRouterChanged(({ uri, initial, direction }) => { if (!initial) log(uri, direction); });
export const s4 = app.onLifecycle(({ state }) => log(state));
// expect TS2322
export function E1() { return <a onclick:prevent={(e: KeyboardEvent) => e.key} />; }
// expect TS2345
export const e2 = effect(() => search.query, (query: number) => log(query));
`;

function diagnose(source: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-jsx-handler-types-'));
    const file = path.join(dir, 'fixture.tsx');
    fs.writeFileSync(file, source);
    try {
        const program = ts.createProgram([file], {
            target: ts.ScriptTarget.ES2021,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            jsx: ts.JsxEmit.Preserve,
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

describe('strict altında modifier, on:ad, oninitializeComponent, effect ve uygulama olayı işleyici tipleri', () => {
    test('işleyiciler bağlamdan tiplenir, yanlış tip yakalanır', () => {
        const actual = diagnose(fixture);
        const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
        expect([...new Set(actual.map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine))
            .toEqual(expectedFrom(fixture).sort(byLine));
    });
});
