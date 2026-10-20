import Compiler from '../src/compiler';

function compile(code: string): string {
    const out = new Compiler().start(code, 'Switch.tsx');
    expect(out).not.toBeNull();
    return out!.code!;
}

const inElement = (cases: string) => `function A(){ return <div>{() => { switch (s.on) { ${cases} } }}</div>; }`;
const inComponentTag = (cases: string) => `function A(){ return <Panel>{() => { switch (s.on) { ${cases} } }}</Panel>; }`;

describe('switch: boolean case etiketleri', () => {
    test.each([
        ['düz etikette case true', inElement('case true: return <b>acik</b>; default: return <i>kapali</i>;'), /switchCase\(\(\)\s*=>\s*s\.on,\s*\{\s*"true":\s*frame\s*=>/],
        ['düz etikette case false', inElement('case false: return <i>kapali</i>; default: return <b>acik</b>;'), /switchCase\(\(\)\s*=>\s*s\.on,\s*\{\s*"false":\s*frame\s*=>/],
        ['bileşen etiketinde case true', inComponentTag('case true: return <b>acik</b>; default: return <i>kapali</i>;'), /switchCase\(\(\)\s*=>\s*s\.on,\s*\{\s*"true":\s*frame\s*=>/],
    ])('%s: derlenir ve anahtar dizge olur', (_name, src, shape) => {
        expect(() => compile(src)).not.toThrow();
        expect(compile(src)).toMatch(shape);
    });

    test('true ve false dalları birlikte', () => {
        const out = compile(inElement('case true: return <b>acik</b>; case false: return <i>kapali</i>;'));
        expect(out).toMatch(/"true":\s*frame\s*=>/);
        expect(out).toMatch(/"false":\s*frame\s*=>/);
    });

    test('sayı ve dizge etiketleri değişmedi', () => {
        const out = compile(inElement('case 1: return <b>bir</b>; case "a": return <i>a</i>; default: return null;'));
        expect(out).toMatch(/\{\s*1:\s*frame\s*=>[\s\S]*"a":\s*frame\s*=>/);
    });

    test('değişken etiket: switch method olarak çalışır ve MJX016 uyarır', () => {
        const c = new Compiler();
        const out = c.start(inElement('case MODE.on: return <b>a</b>; default: return <i>d</i>;'), 'Switch.tsx')!.code!;
        expect(out).not.toContain('switchCase');
        expect(out).toMatch(/sender\.bindings\.method\(\(\)\s*=>\s*\{/);
        expect(c.diagnostics.map(d => d.code)).toEqual(['MJX016']);
    });
});

describe('switch: switch sonrası yedek return', () => {
    test('default yoksa switch sonrası return üçüncü argüman olur', () => {
        const out = compile(`function A(){ return <div>{() => { switch (s.on) { case "a": return <b>A</b>; } return <i>yedek</i>; }}</div>; }`);
        expect(out).toMatch(/switchCase\(\(\)\s*=>\s*s\.on,\s*\{[\s\S]*\},\s*frame\s*=>\s*\{\s*frame\.navigate\(_mc\("i"/);
        expect(out).toContain('yedek');
    });

    test('bileşen etiketinde de yedek return üçüncü argüman olur', () => {
        const out = compile(`function A(){ return <Panel>{() => { switch (s.on) { case "a": return <b>A</b>; } return <i>yedek</i>; }}</Panel>; }`);
        expect(out).toMatch(/\},\s*frame\s*=>\s*\{\s*frame\.navigate\(_mc\("i"/);
        expect(out).toContain('yedek');
    });

    test('default varsa switch sonrası return yok sayılır', () => {
        const out = compile(`function A(){ return <div>{() => { switch (s.on) { case "a": return <b>A</b>; default: return <u>varsayilan</u>; } return <i>yedek</i>; }}</div>; }`);
        expect(out).toContain('varsayilan');
        expect(out).not.toContain('yedek');
    });

    test('switch sonrası return null yedek sayılmaz', () => {
        const out = compile(`function A(){ return <div>{() => { switch (s.on) { case "a": return <b>A</b>; } return null; }}</div>; }`);
        expect(out).toMatch(/switchCase\(\(\)\s*=>\s*s\.on,\s*\{[\s\S]*\}\s*\)\s*;?/);
        expect(out).not.toMatch(/\},\s*frame\s*=>\s*\{\s*frame\.navigate\(null/);
    });
});
