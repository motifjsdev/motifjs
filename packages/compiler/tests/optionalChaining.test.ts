import Compiler from '../src/compiler';

function compile(code: string): string {
    const out = new Compiler().start(code, 'Optional.tsx');
    expect(out).not.toBeNull();
    return out!.code!;
}

const view = (jsx: string) => `function A(){ return ${jsx}; }`;

describe('?. içeren ifadeler düz karşılıkları gibi canlı bağ olur', () => {
    test('öznitelik: getter', () => {
        expect(compile(view('<p title={s.sel?.title}>x</p>'))).toMatch(/"title":\s*\(\)\s*=>\s*s\.sel\?\.title/);
        expect(compile(view('<p title={s.a?.b.c}>x</p>'))).toMatch(/"title":\s*\(\)\s*=>\s*s\.a\?\.b\.c/);
        expect(compile(view('<p title={s.sel?.name()}>x</p>'))).toMatch(/"title":\s*\(\)\s*=>\s*s\.sel\?\.name\(\)/);
    });

    test('class: bağ dizisinde getter', () => {
        expect(compile(view('<p class={s.sel?.cls}>x</p>'))).toMatch(/class\.add\(\[\(\)\s*=>\s*s\.sel\?\.cls\]\)/);
        expect(compile(view('<p class={["note", s.sel?.cls]}>x</p>'))).toMatch(/class\.add\(\[\(\)\s*=>\s*s\.sel\?\.cls\]\)/);
    });

    test('x-text: MJX011 vermez, getter olur; fonksiyonsa çağrılır', () => {
        const out = compile(view('<p x-text={s.sel?.title}></p>'));
        expect(out).toMatch(/bindings\.text\(\(\)\s*=>\s*typeof s\.sel\?\.title === "function" \? s\.sel\?\.title\?\.\(\) : s\.sel\?\.title\)/);
    });

    test('x-display / x-wait: getter', () => {
        expect(compile(view('<p x-display={s.sel?.on}>x</p>'))).toMatch(/bindings\.display\(\(\)\s*=>\s*typeof s\.sel\?\.on === "function" \? s\.sel\?\.on\?\.\(\) : s\.sel\?\.on\)/);
    });

    test('metin çocuğu: bindings.method ile canlı', () => {
        const out = compile(view('<p>{s.sel?.title}</p>'));
        expect(out).toMatch(/sender\.bindings\.method\(\(\)\s*=>\s*s\.sel\?\.title\)/);
        expect(out).not.toMatch(/const _comp\d* = s\.sel\?\.title/);
    });

    test('bileşen etiketi yuvasında da canlı', () => {
        const out = compile(view('<Panel>{s.sel?.title}</Panel>'));
        expect(out).toMatch(/childs:\s*\[\s*_mc\(\{\s*initializeComponent:\s*sender\s*=>\s*\{\s*sender\.bindings\.method\(\(\)\s*=>\s*s\.sel\?\.title\)/);
    });

    test('düz üye yolu değişmedi', () => {
        expect(compile(view('<p title={s.sel.title}>x</p>'))).toMatch(/"title":\s*\(\)\s*=>\s*\{\s*if \(s && s\.sel && s\.sel\.title !== null/);
        expect(compile(view('<p>{s.sel.title}</p>'))).toMatch(/bindings\.add\("textContent", s\.sel, "title"\)/);
    });
});
