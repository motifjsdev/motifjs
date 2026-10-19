import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const fixture = `
import { RouterLink, Component, RouteItem, RouterEvents } from '@motifx/core';
const st = { t: 'x' as string | null };
export function N1() { return <li title={null} hidden={null} tabindex={null} />; }
export function N2() { return <div class={null} style={null} id={null} role={null} />; }
export function N3() { return <input value={null} />; }
export function N4() { return <img src={null} alt={null} />; }
export function N5() { return <li title={() => st.t} />; }
export function N6() { return <RouterLink to="/" class={null} id={null} tabindex={null} />; }
type CardProps = { title: string };
export class Card extends Component<HTMLDivElement, CardProps> { constructor(props: CardProps) { super('div', props); } }
export function N7() { return <Card title="t" class={null} style={null} />; }
// expect TS2322
export function E1() { return <li hidden={{}} />; }
// expect TS2322
export function E2() { return <li title={Symbol()} />; }
export const leave: RouteItem = { path: '/', control: Card, onLeave: (ctx) => { const r: string | undefined = ctx.to.redirectedFrom; const d: string | undefined = ctx.to.direction; const s: any = ctx.to.state; return !!(r || d || s); } };
export const hooks: RouterEvents = { onLeave: (ctx) => ctx.to.redirectedFrom === undefined };
// expect TS2339
export const bad: RouteItem = { path: '/', control: Card, onLeave: (ctx) => ctx.to.nope };
`;

function diagnose(source: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-null-types-'));
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

describe('null attribute values and the onLeave context under strict', () => {
    test('null is accepted wherever the runtime removes the attribute, and onLeave sees the whole target', () => {
        const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
        const actual = [...new Set(diagnose(fixture).map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine);
        expect(actual).toEqual(expectedFrom(fixture).sort(byLine));
    });
});
