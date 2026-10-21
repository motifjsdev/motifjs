import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

const coreTypes = path.resolve(__dirname, '../../../motifjs/dist/index.d.ts');

const wrapped = `
import { ComponentBase, motifComponent, motifOptions, reactive } from '@motifx/core';
declare function log(...args: unknown[]): void;
export const NoteFilter = () => motifOptions({
  el: 'div',
  data: reactive({ query: '' }),
  view() {
    this.class.add('search');
    const field = motifComponent('input', (input: ComponentBase) => {
      input.bindings.model(() => this.data.query, (value: string) => (this.data.query = value));
    });
    this.motif.on('click', () => (this.data.query = ''));
    log(this.props, this.element, this.controls.items.length);
    return [field];
  },
  ctor(props?: { initial?: string }) {
    if (props?.initial) this.data.query = props.initial;
  },
});
export const Empty = () => motifOptions({ el: undefined, view() { return [this.attr]; } });
export const Board = () => motifOptions({
  el: 'section',
  head() { return motifComponent('h1'); },
  rows() { return [motifComponent('li'), motifComponent('li')]; },
  view() { this.class.add('board'); return [this.head(), ...this.rows()]; },
});
// expect TS2551
export const Typo = () => motifOptions({ el: 'div', view() { this.clas.add('x'); return []; } });
// expect TS2322
export const Wrong = () => motifOptions({ el: 'div', data: reactive({ query: '' }), view() { this.data.query = 5; return []; } });
`;

const plain = `
import { reactive } from '@motifx/core';
export const NoteFilter = () => ({
  el: 'div',
  data: reactive({ query: '' }),
  view() {
// expect TS2339
    this.class.add('search');
    return [];
  },
});
`;

function diagnose(source: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-options-this-types-'));
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

const byLine = (a: { line: number }, b: { line: number }) => a.line - b.line;
const unique = (list: { line: number; code: string }[]) => [...new Set(list.map(d => JSON.stringify(d)))].map(s => JSON.parse(s)).sort(byLine);

describe('strict altında Options nesnesinde this tipi', () => {
    test('motifOptions ile sarılan nesnede this bileşendir: üyeler tiplenir, yanlış ad ve yanlış tip yakalanır', () => {
        expect(unique(diagnose(wrapped))).toEqual(expectedFrom(wrapped).sort(byLine));
    });

    test('sarmalayıcısız düz nesnede this nesnenin kendisidir: this.class TS2339 verir', () => {
        expect(unique(diagnose(plain))).toEqual(expectedFrom(plain).sort(byLine));
    });
});
