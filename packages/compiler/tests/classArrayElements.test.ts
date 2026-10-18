import Compiler from '../src/compiler';

function compile(code: string): string {
    const out = new Compiler().start(code, 'ClassArray.tsx');
    expect(out).not.toBeNull();
    return out!.code!;
}

const view = (cls: string) => `function A(){ return <p class={${cls}}>x</p>; }`;
const classCalls = (out: string) => out.split('\n').map(l => l.trim()).filter(l => l.startsWith('sender.class.add('));

describe('class dizisinin her öğesi düz değerle aynı kurala göre iner', () => {
    test('üye yolu: korumalı getter olarak bağ dizisine girer', () => {
        const out = compile(view('["note", s.cls]'));
        expect(out).toMatch(/sender\.class\.add\(\[\(\)\s*=>\s*\{[\s\S]*return s\.cls;[\s\S]*\]\)/);
        expect(out).toMatch(/sender\.class\.add\("note"\)/);
    });

    test('tanımlayıcı: olduğu gibi bağ dizisine girer', () => {
        expect(compile(view('["note", v]'))).toMatch(/sender\.class\.add\(\[v\]\)/);
    });

    test('düz çağrı: olduğu gibi bağ dizisine girer (bir kez değerlenir)', () => {
        expect(compile(view('["note", f()]'))).toMatch(/sender\.class\.add\(\[f\(\)\]\)/);
    });

    test('ternary: getter olur', () => {
        expect(compile(view('["note", a ? "x" : "y"]'))).toMatch(/sender\.class\.add\(\[\(\)\s*=>\s*a \? "x" : "y"\]\)/);
    });

    test('&&: getter olur', () => {
        const out = compile(view('["note", s.on && "z"]'));
        expect(out).toMatch(/sender\.class\.add\(\[\(\)\s*=>\s*\{[\s\S]*return s\.on && "z";[\s\S]*\]\)/);
    });

    test('olumsuzlama: getter olur', () => {
        expect(compile(view('["note", !a && "q"]'))).toMatch(/sender\.class\.add\(\[\(\)\s*=>\s*\{[\s\S]*!a && "q"/);
    });

    test('yayma: bağ dizisine olduğu gibi girer', () => {
        expect(compile(view('["note", ...extra]'))).toMatch(/sender\.class\.add\(\[\.\.\.extra\]\)/);
    });

    test('bulgudaki dizi: altı öğenin hepsi üretimde ve sırası korunur', () => {
        const out = compile(view('["note", s.cls, v, a ? "x" : "y", s.on && "z", f()]'));
        const calls = classCalls(out);
        expect(calls.some(c => c === 'sender.class.add("note");')).toBe(true);
        const bind = out.slice(out.indexOf('sender.class.add(['));
        const order = ['s.cls', ', v,', 'a ? "x" : "y"', 's.on && "z"', 'f()'].map(n => bind.indexOf(n));
        expect(order.every(i => i > -1)).toBe(true);
        expect([...order].sort((x, y) => x - y)).toEqual(order);
    });

    test('nesne, dizge ve şablon öğeleri eskisi gibi', () => {
        const out = compile(view('["note", { on: s.on, pinned: true }, `n-${s.cls}`, "extra"]'));
        expect(out).toMatch(/sender\.class\.add\("note", "pinned", "extra"\)/);
        expect(out).toMatch(/\{\s*"on":\s*\(\)\s*=>\s*s\.on\s*\}/);
        expect(out).toMatch(/\(\)\s*=>\s*`n-\$\{s\.cls\}`/);
    });

    test('düz değer kuralları değişmedi', () => {
        expect(compile(view('s.cls'))).toMatch(/sender\.class\.add\(\[\(\)\s*=>\s*\{[\s\S]*return s\.cls;/);
        expect(compile(view('v'))).toMatch(/sender\.class\.add\(\[v\]\)/);
        expect(compile(view('f()'))).toMatch(/sender\.class\.add\(\[f\(\)\]\)/);
        expect(compile(view('"note pinned"'))).toMatch(/sender\.class\.add\("note pinned"\)/);
    });

    test('motif-explain dizi öğelerini canlı sayar', () => {
        const { explain } = require('../src/index');
        const list = explain(view('["note", s.cls, v]'), 'ClassArray.tsx');
        const e = list.find((x: any) => x.site === 'attr' && x.shape === 'class.object');
        expect(e).toBeDefined();
        expect(e.reactive).toBe('live');
        expect(e.lowered).toContain('s.cls');
        expect(e.lowered).toContain('v');
    });
});
