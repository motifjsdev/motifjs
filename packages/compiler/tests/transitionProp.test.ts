import Compiler from '../src/compiler';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

describe('düz DOM etiketinde transition prop olarak geçer', () => {
    test('dizge biçimi _mc prop nesnesine yazılır, attr.add üretilmez', () => {
        const out = compile(`function A(){ return <div transition="fade">a</div>; }`);
        expect(out).toMatch(/_mc\("div",\s*\{[\s\S]*transition:\s*"fade"/);
        expect(out).not.toMatch(/attr\.add\(\{\s*"transition"/);
    });

    test('nesne biçimi olduğu gibi prop olarak geçer', () => {
        const out = compile(`function A(){ return <div transition={{ name: 'slide', duration: 300 }}>a</div>; }`);
        expect(out).toMatch(/transition:\s*\{\s*name:\s*'slide',\s*duration:\s*300\s*\}/);
        expect(out).not.toMatch(/"transition"/);
    });

    test('bileşen etiketindeki davranış değişmedi', () => {
        const out = compile(`function A(){ return <Box transition="fade" />; }`);
        expect(out).toMatch(/transition:\s*"fade"/);
    });

    test('diğer öznitelikler yine attr.add ile yazılır', () => {
        const out = compile(`function A(){ return <div title="t" transition="fade" />; }`);
        expect(out).toMatch(/attr\.add\(\{\s*"title":\s*"t"\s*\}\)/);
    });
});
