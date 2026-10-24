import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const fixture = `
import { Component, ComponentBase, ContentBlock, ContentBody, Transport, TransportTo } from '@motifx/core';
const pin = new Component('button');
let kept: ComponentBase | undefined;
export const a1 = new TransportTo({ name: 'page-actions', childs: [pin], class: 'actions', ref: (c: ComponentBase) => (kept = c), onBuilt: (sender) => sender.element });
export const a2 = new ContentBlock({ target: 'status', childs: [pin], onConfig: (sender) => sender.class.add('status') });
export const a3 = new Transport({ name: 'page-actions', mode: 'merge', childs: [pin], initializeComponent: (sender) => sender.element });
export const a4 = new ContentBody({ name: 'status', childs: [pin], onConfigured: (sender) => sender.element });
// expect TS2345
export const e1 = new TransportTo({ childs: [pin] });
// expect TS2345
export const e2 = new ContentBlock({ childs: [pin] });
// expect TS2322
export const e3 = new Transport({ name: 'page-actions', mode: 'swap' });
`;

function diagnose(source: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-slot-constructor-types-'));
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

describe('slot and sender constructors take the common component props under strict', () => {
    test('childs, class, ref and lifecycle hooks are accepted, their own props are still checked', () => {
        const actual = diagnose(fixture);
        const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
        expect([...new Set(actual.map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine))
            .toEqual(expectedFrom(fixture).sort(byLine));
    });
});
