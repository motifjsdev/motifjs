import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const fixture = `
import { RouterLink, ContentBlock, ContentBody, Virtualization, Transport, Frame, RouterView, Component } from '@motifx/core';
const flag = { on: true };
export function L1() { return <RouterLink to="/" el="a" class="brand" id="x" style="color:red" tabindex={0} role="link">Home</RouterLink>; }
export function L2() { return <RouterLink to="/" class={() => flag.on ? 'on' : ''} onclick={(e) => e.clientX} aria-label="home" data-x="1">Home</RouterLink>; }
export function C1() { return <ContentBlock target="t" class="b" />; }
export function C2() { return <ContentBody name="n" style="display:block" />; }
export function T1() { return <Transport name="n" id="t" />; }
export function V1() { return <Virtualization class="v" id="list" itemHeight={20} itemTemplate={(i: any) => i} dataRequest={async () => ({ items: [], hasMore: false } as any)} />; }
export function F1() { return <Frame class="f" />; }
export function R1() { return <RouterView class="outlet" />; }
type CardProps = { title: string };
export class Card extends Component<HTMLDivElement, CardProps> { constructor(props: CardProps) { super('div', props); } }
export function U1() { return <Card title="t" class="card" onclick={(s, e) => { s.element; e.clientX; }} />; }
type GaugeProps = { value: number; style: number };
export class Gauge extends Component<HTMLDivElement, GaugeProps> { constructor(props: GaugeProps) { super('div', props as any); } }
export function U2() { return <Gauge value={1} style={3} />; }
function Fc(props: { title: string }) { return <h1>{props.title}</h1>; }
export function U3() { return <Fc title="t" class="fc" id="f" />; }
// expect TS2322
export function E1() { return <RouterLink class="x">Home</RouterLink>; }
// expect TS2322
export function E2() { return <Card title="t" class={5} />; }
// expect TS2322
export function E3() { return <Gauge value={1} style="color:red" />; }
// expect TS2322
export function E4() { return <Fc title={5} class="x" />; }
`;

function diagnose(source: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-jsx-tag-types-'));
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

describe('fallthrough props on component tags under strict', () => {
    test('class, id, style, tabindex, role and DOM events are accepted on every component tag', () => {
        const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
        const actual = [...new Set(diagnose(fixture).map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine);
        expect(actual).toEqual(expectedFrom(fixture).sort(byLine));
    });
});
