import Compiler from '../src/compiler';

const compile = (code: string) => {
    const r = new Compiler().start(code, 'S.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

describe('S7: x-style → sender.style(...)', () => {
    test('getter: initializeComponent içinde sender.style(() => …), onstyle prop\'u yok', () => {
        const out = compile(`function A(s){ return <div x-style={() => ({ color: s.c })} />; }`);
        expect(out).toMatch(/sender\.style\(\(\)\s*=>/);
        expect(out).not.toContain('onstyle');
    });
    test('string: sender.style("…")', () => {
        const out = compile(`function A(){ return <div x-style="color:red" />; }`);
        expect(out).toMatch(/sender\.style\("color:red"\)/);
        expect(out).not.toContain('onstyle');
    });
    test('nesne: sender.style({…})', () => {
        const out = compile(`function A(){ return <div x-style={{ color: 'red' }} />; }`);
        expect(out).toMatch(/sender\.style\(\{/);
        expect(out).not.toContain('onstyle');
    });
    test('x:style biçimi de aynı', () => {
        const out = compile(`function A(s){ return <div x:style={() => ({ color: s.c })} />; }`);
        expect(out).toMatch(/sender\.style\(\(\)\s*=>/);
        expect(out).not.toContain('onstyle');
    });
    test('doğrudan style ile aynı çıktı yolu', () => {
        const a = compile(`function A(s){ return <div style={() => ({ color: s.c })} />; }`);
        const b = compile(`function A(s){ return <div x-style={() => ({ color: s.c })} />; }`);
        expect(a).toBe(b);
    });
});

describe('S6: spread sözleşmesi (derleyici)', () => {
    test('HTML etikette spread {...props} olarak props nesnesine kopyalanır, attr.add(props) üretmez', () => {
        const out = compile(`function A(props){ return <div {...props} />; }`);
        expect(out).toMatch(/_mc\("div",\s*\{\s*\.\.\.props\s*\}\)/);
        expect(out).not.toContain('sender.attr.add(props');
    });
    test('spread + açık öznitelik: açık olan initializeComponent içinde (runtime\'da spread\'ten SONRA çalışır)', () => {
        const out = compile(`function A(props){ return <div {...props} id="x" class="c" />; }`);
        expect(out).toMatch(/\.\.\.props/);
        expect(out).toMatch(/initializeComponent:\s*sender\s*=>/);
        expect(out).toMatch(/sender\.attr\.add\(\{\s*"id":\s*"x"\s*\}\)/);
        expect(out).toMatch(/sender\.class\.add\("c"\)/);
    });
    test('bileşen etiketinde spread {...props} olarak kalır', () => {
        const out = compile(`function A(props){ return <Card {...props} />; }`);
        expect(out).toMatch(/_mc\(Card,\s*\{\s*\.\.\.props/);
    });
});