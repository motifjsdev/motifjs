import Compiler from '../src/compiler';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

describe('bileşen prop\'unda JSX dallı ternary canlı bir ternary tutan fragment döndüren getter olur', () => {
    test('getter, koşulu bindings.ternary ile izleyen bir fragment döndürür', () => {
        const out = compile(`function A(p){ return <Pane toolbar={p.a ? <nav>x</nav> : null} />; }`);
        expect(out).toMatch(/toolbar:\s*\(\)\s*=>\s*_mf\(\{\s*initializeComponent:\s*sender\s*=>\s*\{\s*sender\.bindings\.ternary\(\(\)\s*=>\s*p\.a,/);
        expect(out).toMatch(/import\s*\{[^}]*motifFragment as _mf[^}]*\}\s*from\s*["']@motifx\/core["']/);
    });

    test('iç içe ternary dalları ternaryCall ile kurulur', () => {
        const out = compile(`function A(p){ return <Pane toolbar={p.a ? (p.b ? <nav>x</nav> : <i>b</i>) : null} />; }`);
        expect(out).toMatch(/toolbar:\s*\(\)\s*=>\s*_mf\(/);
        expect(out).toMatch(/sender\.bindings\.ternaryCall\(\(\)\s*=>\s*p\.b,/);
    });

    test('üye ifadeli bileşen etiketinde de aynı biçime iner', () => {
        const out = compile(`function A(p){ return <UI.Pane toolbar={p.a ? <nav>x</nav> : <i>y</i>} />; }`);
        expect(out).toMatch(/toolbar:\s*\(\)\s*=>\s*_mf\(/);
    });

    test('metin dallı ternary değişmez', () => {
        const out = compile(`function A(p){ return <Pane label={p.a ? 'x' : 'y'} />; }`);
        expect(out).toMatch(/label:\s*\(\)\s*=>\s*p\.a \? 'x' : 'y'/);
        expect(out).not.toMatch(/_mf\(/);
    });

    test('DOM etiketindeki öznitelik ternary\'si değişmez', () => {
        const out = compile(`function A(p){ return <div title={p.a ? <b>x</b> : null} />; }`);
        expect(out).not.toMatch(/"title":\s*\(\)\s*=>\s*_mf\(/);
    });

    test('elle yazılmış getter prop değişmez', () => {
        const out = compile(`function A(p){ return <Pane toolbar={() => (p.a ? <nav>x</nav> : null)} />; }`);
        expect(out).not.toMatch(/toolbar:\s*\(\)\s*=>\s*_mf\(/);
    });
});
