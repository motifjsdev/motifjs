import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const fixture = `
import { Component } from '@motifx/core';
declare function log(...args: unknown[]): void;
declare const url: string;
export function A1() { return <form action={(data) => log(data.get('q'))} />; }
export function A2() { return <form action={(sender, data) => log(sender.element, data.get('q'))} />; }
export function A3() { return <form action="/search" />; }
export function A4() { return <form action={() => url} />; }
export function A5() { return <form action={async (data) => { await log(data.getAll('q')); }} />; }
export function A6() { return <button type="submit" formAction={(data) => log(data.get('q'))} />; }
export function A7() { return <input type="submit" formaction={(sender, data) => log(sender.element, data)} />; }
export function A8() { return <form action={null} />; }
// expect TS2322
export function E1() { return <form action={(data: number) => log(data)} />; }
// expect TS2322
export function E2() { return <form action={5} />; }
// expect TS2322
export function E3() { return <button formAction={true} />; }
`;

function diagnose(source: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-jsx-form-action-types-'));
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

describe('action and formAction accept a URL or a submit handler under strict', () => {
    test('handlers are typed from FormData, other values are rejected', () => {
        const actual = diagnose(fixture);
        const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
        expect([...new Set(actual.map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine))
            .toEqual(expectedFrom(fixture).sort(byLine));
    });
});
