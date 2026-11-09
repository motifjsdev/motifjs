import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const source = `
import { Component, type IBaseBinding, type IDisposable } from '@motifx/core';
const part = new Component('button');
const held: IDisposable = part.attr.hold({ disabled: true, tabindex: -1, 'aria-disabled': 'true' });
part.motif.register(held);
held.dispose();
export const inside: boolean = part.motif.isEventFrom(new MouseEvent('click'));
const binding: IBaseBinding = { propertyName: 'locked', dataSource: null, activate() { }, deactivate() { }, reActivate() { } };
part.bindings.add(binding);
// expect TS2345
part.attr.hold('disabled');
// expect TS2554
part.motif.isEventFrom();
`;

function diagnose(text: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-attr-hold-types-'));
    const file = path.join(dir, 'fixture.ts');
    fs.writeFileSync(file, text);
    try {
        const program = ts.createProgram([file], {
            target: ts.ScriptTarget.ES2021,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
            paths: { '@motifx/core': [coreTypes] }
        });
        const sf = program.getSourceFile(file)!;
        return ts.getPreEmitDiagnostics(program)
            .filter(d => d.file === sf)
            .map(d => ({ line: sf.getLineAndCharacterOfPosition(d.start!).line, code: `TS${d.code}` }));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function expectedFrom(text: string) {
    return text.split('\n').flatMap((row, line) => {
        const m = /^\/\/ expect (TS\d+)/.exec(row);
        return m ? [{ line: line + 1, code: m[1] }] : [];
    });
}

const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;

describe('strict altında attr.hold, motif.isEventFrom ve IBaseBinding tipleri', () => {
    test('tutma serbest bırakılabilir bir nesne döner, olay sorusu boolean döner, IBaseBinding paketten alınır', () => {
        expect(diagnose(source).sort(byLine)).toEqual(expectedFrom(source).sort(byLine));
    });
});
