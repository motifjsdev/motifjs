import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const fixture = `
import { Component, ComponentBase, RouterLink } from '@motifx/core';
const user = { name: '' };
const onMouse = (e: MouseEvent) => e.clientX;
const onSender = (s: ComponentBase, e: MouseEvent) => s.element && e.clientX;
export function A1() { return <input oninput={(e) => (user.name = (e.target as HTMLInputElement).value)} />; }
export function A2() { return <button onclick={(s, e) => { s.element; e.clientX; }} />; }
export function A3() { return <div onkeydown={(e) => e.key === 'Enter' && user.name} />; }
export function A4() { return <div onclick={onMouse} ondblclick={onSender} />; }
export function A5() { return <div onclick={async (e) => { await Promise.resolve(e.clientX); }} />; }
export function A6() { return <form onsubmit={(e) => { e.preventDefault(); }} />; }
export function A7() { return <div onpointerdown={(e) => e.pointerId} onwheel={(e) => e.deltaY} />; }
export class C1 extends Component { handle(e: MouseEvent) { return e.clientX; } view() { return <input onkeyup={(e) => e.key} onclick={this.handle} />; } }
export class Box extends Component { }
export class Typed extends Component<HTMLDivElement, { label: string }> { }
export function B1() { return <Box onclick={(e) => e.clientX} />; }
export function B2() { return <Box onclick={(s, e) => { s.element; e.clientX; }} />; }
export function B3() { return <Typed label="x" onkeydown={(e) => e.key} />; }
export function B4() { return <Typed label="x" onConfigured={(s) => s.element} />; }
export function B5() { return <Box anything={1} childs={[]} />; }
function Fc(props: { title: string }) { return <h1>{props.title}</h1>; }
export function B6() { return <Fc title="t" />; }
export function B7() { return <RouterLink to="/" el="a">Home</RouterLink>; }
// expect TS2322
export function E1() { return <div onclick={(e: KeyboardEvent) => e.key} />; }
// expect TS2769
export function E2() { return <Typed label={5} />; }
// expect TS2322
export function E3() { return <Fc title={5} />; }
`;

function diagnose(source: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-jsx-types-'));
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

describe('JSX DOM event handler types under strict', () => {
    test('handlers are contextually typed on plain tags and component tags', () => {
        const actual = diagnose(fixture);
        const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
        expect(actual.filter(d => d.code === 'TS7006')).toEqual([]);
        expect([...new Set(actual.map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine))
            .toEqual(expectedFrom(fixture).sort(byLine));
    });
});
