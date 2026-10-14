import Compiler from '../src/compiler';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

const FIELD_K = /bindings\.add\("textContent",\s*L,\s*"k"\)/;

describe('metin çocuğunda köşeli parantezli üye erişimi', () => {
    test('{L[k]} anahtarı k değişkeninden okur, "k" adlı alana bağlanmaz', () => {
        const out = compile(`function A(){ const k = 'a'; return <p>{L[k]}</p>; }`);
        expect(out).not.toMatch(FIELD_K);
        expect(out).toMatch(/bindings\.add\("textContent",\s*\(\) => \{[^]*L\[k\]/);
    });

    test('ternary dalında {c ? L[k] : "x"} anahtarı k değişkeninden okur', () => {
        const out = compile(`function A(){ const k = 'a'; return <p>{c ? L[k] : "x"}</p>; }`);
        expect(out).not.toMatch(FIELD_K);
        expect(out).toMatch(/bindings\.add\("textContent",\s*\(\) => \{[^]*L\[k\]/);
    });

    test('ternary dalında {c ? () => L[k] : "x"} anahtarı k değişkeninden okur', () => {
        const out = compile(`function A(){ const k = 'a'; return <p>{c ? () => L[k] : "x"}</p>; }`);
        expect(out).not.toMatch(FIELD_K);
        expect(out).toMatch(/bindings\.add\("textContent",\s*\(\) => \{[^]*L\[k\]/);
    });

    test('{L.k} nesne ve alan adıyla bağlanmaya devam eder', () => {
        const out = compile(`function A(){ return <p>{L.k}</p>; }`);
        expect(out).toMatch(FIELD_K);
    });

    test('ternary dalında {c ? () => L.k : "x"} nesne ve alan adıyla bağlanmaya devam eder', () => {
        const out = compile(`function A(){ return <p>{c ? () => L.k : "x"}</p>; }`);
        expect(out).toMatch(FIELD_K);
    });
});
