import * as ts from 'typescript';
import { lintProgram, acceptsFunction } from '../src/lint';

const PRELUDE = `
declare namespace JSX {
    interface ElementAttributesProperty { props: {} }
    interface ElementClass { }
    interface IntrinsicElements { [k: string]: any }
    interface IntrinsicAttributes { key?: any }
}
declare class Component<E, P = {}> { props: P; }
type Bind<T> = T | (() => T);
`;

function program(files: Record<string, string>): ts.Program {
    const all: Record<string, string> = { '/prelude.d.ts': PRELUDE, ...files };
    const options: ts.CompilerOptions = {
        noLib: true, jsx: ts.JsxEmit.Preserve, strict: true, noEmit: true,
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, types: [],
    };
    const host: ts.CompilerHost = {
        getSourceFile: (name) => all[name] !== undefined ? ts.createSourceFile(name, all[name], options.target!, true) : undefined,
        getDefaultLibFileName: () => '/lib.d.ts',
        writeFile: () => undefined,
        getCurrentDirectory: () => '/',
        getCanonicalFileName: (f) => f,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: (f) => all[f] !== undefined,
        readFile: (f) => all[f],
    };
    return ts.createProgram(Object.keys(all), options, host);
}

const lint = (jsxBody: string, extra = '') => {
    const p = program({
        '/comp.tsx': `
${extra}
interface PlainProps { name: string; count?: number; mode?: 'a' | 'b'; cb?: (x: number) => void; anyish?: any; unk?: unknown; obj?: object; fn?: Function; }
class Plain extends Component<any, PlainProps> {}
interface BindProps { name: Bind<string>; mode?: Bind<'a' | 'b'>; }
class Bound extends Component<any, BindProps> {}
function Fn(props: { title: string; live: Bind<string> }) { return null as any; }
const NS = { Inner: Plain };
class Gen<T> extends Component<any, { value: T }> {}
class App extends Component<any> {
    ok = true;
    view() { return (${jsxBody}); }
}`,
    });
    return lintProgram(p);
};

describe('MJX005 — pozitif (bildirilmeli)', () => {
    test('düz string prop', () => {
        const d = lint(`<Plain name={this.ok ? 'a' : 'b'} />`);
        expect(d.map(x => x.code)).toEqual(['MJX005']);
        expect(d[0].message).toContain('"name"');
        expect(d[0].message).toContain('"string"');
        expect(d[0].message).toContain('Bind<T>');
        expect(d[0].file).toBe('/comp.tsx');
        expect(d[0].line).toBe(12);
        expect(d[0].frame).toContain('^');
    });

    test('isteğe bağlı literal union prop (undefined fonksiyon değildir)', () => {
        const d = lint(`<Plain name="x" mode={this.ok ? 'a' : 'b'} />`);
        expect(d.map(x => x.code)).toEqual(['MJX005']);
        expect(d[0].message).toContain('"mode"');
    });

    test('number prop', () => {
        expect(lint(`<Plain name="x" count={this.ok ? 1 : 2} />`).length).toBe(1);
    });

    test('fonksiyon bileşeninin düz prop\'u', () => {
        const d = lint(`<Fn title={this.ok ? 'a' : 'b'} live="x" />`);
        expect(d.length).toBe(1);
        expect(d[0].message).toContain('<Fn');
    });

    test('üye ifadeli etiket (<NS.Inner/>)', () => {
        const d = lint(`<NS.Inner name={this.ok ? 'a' : 'b'} />`);
        expect(d.length).toBe(1);
        expect(d[0].message).toContain('<NS.Inner');
    });

    test('parantezli ternary de yakalanır', () => {
        expect(lint(`<Plain name={(this.ok ? 'a' : 'b')} />`).length).toBe(1);
    });

    test('iç içe ternary', () => {
        expect(lint(`<Plain name={this.ok ? 'a' : this.ok ? 'b' : 'c'} />`).length).toBe(1);
    });

    test('aynı etikette iki ihlal iki bulgu', () => {
        expect(lint(`<Plain name={this.ok ? 'a' : 'b'} count={this.ok ? 1 : 2} />`).length).toBe(2);
    });
});

describe('MJX005 — negatif (sessiz kalmalı)', () => {
    test('Bind<T> prop', () => {
        expect(lint(`<Bound name={this.ok ? 'a' : 'b'} mode={this.ok ? 'a' : 'b'} />`)).toEqual([]);
    });

    test('fonksiyon bileşeninin Bind<T> prop\'u', () => {
        expect(lint(`<Fn title="x" live={this.ok ? 'a' : 'b'} />`)).toEqual([]);
    });

    test('DOM etiketi (öznitelik attr.add getter\'ı olur, sözleşme yok)', () => {
        expect(lint(`<div title={this.ok ? 'a' : 'b'} class={this.ok ? 'x' : 'y'} />`)).toEqual([]);
    });

    test('any / unknown / object / Function prop', () => {
        expect(lint(`<Plain name="x" anyish={this.ok ? 'a' : 'b'} unk={this.ok ? 1 : 2} obj={this.ok ? {} : {}} fn={this.ok ? 1 : 2} />`)).toEqual([]);
    });

    test('geri çağrı prop\'u (zaten fonksiyon tipi)', () => {
        expect(lint(`<Plain name="x" cb={this.ok ? (x) => {} : (x) => {}} />`)).toEqual([]);
    });

    test('ternary olmayan ifadeler', () => {
        expect(lint(`<Plain name={this.ok ? 'a' : 'b'} />`.replace(`this.ok ? 'a' : 'b'`, `this.ok && 'a' || 'b'`))).toEqual([]);
        expect(lint(`<Plain name={\`\${this.ok}\`} count={1 + 2} />`)).toEqual([]);
    });

    test('açık getter yazılmışsa ternary içeride kalır, kural devreye girmez', () => {
        expect(lint(`<Plain name={() => this.ok ? 'a' : 'b'} />` as any)).toEqual([]);
    });

    test('key / x-* / on:* özel adları prop değildir', () => {
        expect(lint(`<Plain name="x" key={this.ok ? 1 : 2} x-wait={this.ok ? true : false} on:save={this.ok ? 1 : 2} />`)).toEqual([]);
    });

    test('bilinmeyen bileşen (tip çözülemez) sessiz', () => {
        expect(lint(`<Unknown name={this.ok ? 'a' : 'b'} />`)).toEqual([]);
    });

    test('generic bileşen: tip parametresi çıkarımı kısıtsızsa sessiz', () => {
        expect(lint(`<Gen value={this.ok ? 'a' : 'b'} />`)).toEqual([]);
    });

    test('.d.ts ve .ts dosyaları taranmaz', () => {
        const p = program({ '/x.ts': `const a = 1;` });
        expect(lintProgram(p)).toEqual([]);
    });
});

describe('acceptsFunction', () => {
    const typeOf = (decl: string): [ts.Type, ts.TypeChecker] => {
        const p = program({ '/t.ts': `type Bind<T> = T | (() => T); ${decl}` });
        const c = p.getTypeChecker();
        const sf = p.getSourceFile('/t.ts')!;
        const alias = sf.statements.find(s => ts.isTypeAliasDeclaration(s) && s.name.text === 'X') as ts.TypeAliasDeclaration;
        return [c.getTypeAtLocation(alias.name), c];
    };
    test.each([
        ['type X = string', false],
        ['type X = number | undefined', false],
        ["type X = 'a' | 'b'", false],
        ['type X = { a: number }', false],
        ['type X = string | (() => string)', true],
        ['type X = Bind<string>', true],
        ['type X = () => void', true],
        ['type X = (x: number) => void', true],
        ['type X = any', true],
        ['type X = unknown', true],
        ['type X = object', true],
        ['type X = {}', true],
    ])('%s → %s', (decl, expected) => {
        const [t, c] = typeOf(decl);
        expect(acceptsFunction(t, c)).toBe(expected);
    });
});