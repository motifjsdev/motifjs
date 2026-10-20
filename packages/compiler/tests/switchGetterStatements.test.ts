import Compiler from '../src/compiler';

function compile(code: string) {
    const c = new Compiler();
    const out = c.start(code, 'SwitchStmts.tsx');
    expect(out).not.toBeNull();
    return { code: out!.code!, diagnostics: c.diagnostics };
}
const flat = (s: string) => s.replace(/\s+/g, ' ');
const child = (getter: string) => `function A(){ return <div>${getter}</div>; }`;
const lowered = (getter: string) => {
    const out = flat(compile(child(getter)).code);
    return out.slice(out.indexOf('sender.bindings.'), out.lastIndexOf('}, 1); }'));
};
const text = (tag: string, value: string, uid: string) =>
    `frame.navigate(_mc("${tag}", { initializeComponent: sender => { const ${uid} = _mc("text", { initializeComponent: sender => { sender.setText("${value}"); } }, 1); sender.controls.add(${uid}); } }, 1));`;

describe('bugün çalışan şekiller: üretilen kod aynı kalır', () => {
    test.each([
        ['her case tek return, default null',
            '{() => { switch (s.k) { case "a": return <i>A</i>; case 1: return <i>B</i>; default: return null; } }}',
            `sender.bindings.switchCase(() => s.k, { "a": frame => { ${text('i', 'A', '_comp')} }, 1: frame => { ${text('i', 'B', '_comp2')} } }, frame => { frame.navigate(_mf()); }); } `],
        ['switch sonrası tek return',
            '{() => { switch (s.k) { case "a": return <i>A</i>; } return <b>F</b>; }}',
            `sender.bindings.switchCase(() => s.k, { "a": frame => { ${text('i', 'A', '_comp')} } }, frame => { ${text('b', 'F', '_comp2')} }); } `],
        ['IIFE biçimi, dallar parametreyi okumuyor',
            '{((x) => { switch (x) { case 1: return <i>one</i>; } })(s.n)}',
            `sender.bindings.switchCase(() => s.n, { 1: frame => { ${text('i', 'one', '_comp')} } }); } `],
        ['return a ? b : c, öncesinde deyim yok',
            '{() => { return s.ok ? <i>A</i> : <b>B</b>; }}',
            `sender.bindings.ternary(() => s.ok, frame => { ${text('i', 'A', '_comp')} }, frame => { ${text('b', 'B', '_comp2')} }); } `],
    ])('%s', (_n, getter, expected) => {
        expect(lowered(getter)).toBe(expected);
    });
});

describe('switch öncesi deyimler korunur', () => {
    test('yerel değişken ayırıcı getter\'ında atanır, dallar aynı kapanıştan okur', () => {
        const { code, diagnostics } = compile(child('{() => { const label = "L" + s.n; switch (s.k) { case "a": return <i>{label}</i>; } }}'));
        const out = flat(code);
        expect(out).toContain('sender.bindings.switchCase(...(() => { let label; return [() => { label = "L" + s.n; return s.k; }, {');
        expect(out).toMatch(/"a": frame => \{ frame\.navigate\(_mc\("i"/);
        expect(diagnostics).toEqual([]);
    });

    test('deyimler sırasıyla ayırıcı getter\'ında çalışır', () => {
        const { code } = compile(child('{() => { const a = s.n * 2; log(a); let b; switch (s.k) { case "a": return <i>{a}</i>; } }}'));
        expect(flat(code)).toContain('let a, b; return [() => { a = s.n * 2; log(a); return s.k; }');
    });

    test('ayrıştırma ve fonksiyon bildirimi', () => {
        const { code } = compile(child('{() => { const { x, y } = s.pos; function row(v) { return <b>{v}</b>; } switch (s.k) { case "a": return row(x); default: return row(y); } }}'));
        const out = flat(code);
        expect(out).toContain('let x, y; function row(v) {');
        expect(out).toContain('({ x, y } = s.pos); return s.k;');
    });
});

describe('case gövdeleri korunur', () => {
    test('blok sarmalı case return\'ünü yerleştirir', () => {
        const { code } = compile(child('{() => { switch (s.k) { case "a": { const t = s.n; return <i>{t}</i>; } } }}'));
        expect(flat(code)).toMatch(/"a": frame => \{ const t = s\.n; frame\.navigate\(_mc\("i"/);
    });

    test('return öncesi deyim dal kurulurken çalışır', () => {
        const { code } = compile(child('{() => { switch (s.k) { case "a": log("a"); return <i>A</i>; } }}'));
        expect(flat(code)).toMatch(/"a": frame => \{ log\("a"\); frame\.navigate\(_mc\("i"/);
    });

    test('if içindeki return akışı korur; sona düşünce boş içerik', () => {
        const { code } = compile(child('{() => { switch (s.k) { case "a": if (s.ok) return <i>A</i>; break; } }}'));
        expect(flat(code)).toMatch(/"a": frame => \{ if \(s\.ok\) \{ frame\.navigate\(_mc\("i"[^]*?\); return; \} frame\.navigate\(_mf\(\)\); \}/);
    });

    test('düşme: boş case sonrakinin gövdesini alır, bitmeyen case eklenir', () => {
        const { code } = compile(child('{() => { switch (s.k) { case "a": case "b": return <i>AB</i>; case "c": log("c"); case "d": return <i>CD</i>; } }}'));
        const out = flat(code);
        expect(out).toMatch(/"a": frame => \{ frame\.navigate\(_mc\("i"[^]*?AB/);
        expect(out).toMatch(/"c": frame => \{ log\("c"\); frame\.navigate\(_mc\("i"[^]*?CD/);
    });
});

describe('switch sonrası deyimler varsayılan yolu oluşturur', () => {
    test('hiçbir case eşleşmeyince deyimler yedek içerikten önce çalışır', () => {
        const { code } = compile(child('{() => { switch (s.k) { case "a": return <i>A</i>; } log("none"); return <b>F</b>; }}'));
        expect(flat(code)).toMatch(/\}, frame => \{ log\("none"\); frame\.navigate\(_mc\("b"/);
    });

    test('break ile çıkan case switch sonrasına düşer', () => {
        const { code } = compile(child('{() => { switch (s.k) { case "a": log("a"); break; } return <b>F</b>; }}'));
        expect(flat(code)).toMatch(/"a": frame => \{ log\("a"\); frame\.navigate\(_mc\("b"/);
    });

    test('switch sonrası yalnız return null: varsayılan dal yok', () => {
        const { code } = compile(child('{() => { switch (s.k) { case "a": return <i>A</i>; } return null; }}'));
        expect((flat(code).match(/frame =>/g) || []).length).toBe(1);
    });
});

describe('yerleştirilemeyen şekil method olarak çalışır ve MJX016 uyarır', () => {
    test.each([
        ['literal olmayan etiket', '{() => { switch (s.k) { case MODE: return <i>A</i>; default: return <i>D</i>; } }}', 'a case label that is not a literal'],
        ['switch öncesi return', '{() => { if (s.loading) return <i>…</i>; switch (s.k) { case "a": return <i>A</i>; } }}', 'a return written outside the branches'],
        ['switch öncesi JSX', '{() => { const spinner = <i>…</i>; switch (s.k) { case "a": return spinner; } }}', 'JSX created outside the branches'],
        ['case içinde erken break', '{() => { switch (s.k) { case "a": if (s.x) break; return <i>A</i>; } }}', 'a break that leaves the switch'],
        ['iki switch', '{() => { switch (s.k) { case "a": return <i>A</i>; } switch (s.j) { case "b": return <i>B</i>; } }}', 'more than one switch'],
    ])('%s', (_n, getter, reason) => {
        const { code, diagnostics } = compile(child(getter));
        expect(flat(code)).toContain('sender.bindings.method(() => {');
        expect(flat(code)).not.toContain('switchCase');
        expect(diagnostics.map(d => d.code)).toEqual(['MJX016']);
        expect(diagnostics[0].message).toContain(reason);
    });

    test('IIFE biçiminde dalın okuduğu parametre ortak kapanışa alınır', () => {
        const { code, diagnostics } = compile(child('{((x) => { switch (x) { case 1: return <i>{x}</i>; } })(s.n)}'));
        expect(flat(code)).toContain('switchCase(...(() => { let x; return [() => { x = s.n; return x; }, {');
        expect(diagnostics).toEqual([]);
    });
});

describe('return a ? b : c öncesi deyimler korunur', () => {
    test('yerel değişken koşul getter\'ında atanır, MJX001 yok', () => {
        const { code, diagnostics } = compile(child('{() => { const label = "L"; return s.ok ? <i>{label}</i> : <b>B</b>; }}'));
        expect(flat(code)).toContain('sender.bindings.ternary(...(() => { let label; return [() => { label = "L"; return s.ok; }, frame => {');
        expect(diagnostics).toEqual([]);
    });

    test('ternary öncesi return: method ve MJX016', () => {
        const { code, diagnostics } = compile(child('{() => { if (s.loading) return null; const label = "L"; return s.ok ? <i>{label}</i> : <b>B</b>; }}'));
        expect(flat(code)).toContain('sender.bindings.method(');
        expect(diagnostics.map(d => d.code)).toEqual(['MJX016']);
    });

    test('parametreli getter bugünkü yolda kalır ve MJX001 uyarır', () => {
        const { diagnostics } = compile(child('{(q) => { const label = "L"; return s.ok ? <i>{label}</i> : <b>B</b>; }}'));
        expect(diagnostics.map(d => d.code)).toEqual(['MJX001']);
    });
});
