import Compiler from '../src/compiler';
import type { MotifDiagnostic } from '../src/diagnostics';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

const diags = (code: string): MotifDiagnostic[] => {
    const c = new Compiler();
    c.start(code, 'F.tsx');
    return c.diagnostics;
};
const codesOf = (code: string): string[] => diags(code).map(d => d.code);

/* ═══════════════════════════════════ Öznitelikteki ternary DAİMA tembel sarılır (tasarım) */

describe('öznitelik/prop konumundaki ternary tembel sarılır', () => {
    test('bileşen prop\'unda sarılır', () => {
        const out = compile(`function A(p){ return <Comp title={p.a ? 'x' : 'y'} />; }`);
        expect(out).toMatch(/title:\s*\(\)\s*=>\s*p\.a \? 'x' : 'y'/);
    });

    test('DOM özniteliğinde sarılır', () => {
        const out = compile(`function A(p){ return <div title={p.a ? 'x' : 'y'} />; }`);
        expect(out).toMatch(/"title":\s*\(\)\s*=>\s*p\.a \? 'x' : 'y'/);
    });

    test('SVG özniteliğinde sarılır', () => {
        const out = compile(`function A(p){ return <circle fill={p.a ? 'red' : 'blue'} />; }`);
        expect(out).toMatch(/"fill":\s*\(\)\s*=>/);
    });

    test('üye ifadeli etikette de sarılır', () => {
        const out = compile(`function A(p){ return <Foo.Bar title={p.a ? 'x' : 'y'} />; }`);
        expect(out).toMatch(/title:\s*\(\)\s*=>/);
    });

    test('iç içe ternary de sarılır', () => {
        const out = compile(`function A(p){ return <Comp v={p.a ? 1 : p.b ? 2 : 3} />; }`);
        expect(out).toMatch(/v:\s*\(\)\s*=>/);
    });

    test('ternary OLMAYAN prop sarılmaz (değer olarak geçer)', () => {
        const out = compile(`function A(p){ return <Comp title={p.a} />; }`);
        expect(out).toMatch(/title:\s*p\.a/);
        expect(out).not.toMatch(/title:\s*\(\)\s*=>/);
    });

    test('açık getter olduğu gibi geçer', () => {
        const out = compile(`function A(p){ return <Comp title={() => p.a ? 'x' : 'y'} />; }`);
        expect(out).toMatch(/title:\s*\(\)\s*=>/);
    });
});

/* ═══════════════════════════════════ Üye ifadeli etiket (<Foo.Bar/>) derlenir */

describe('üye ifadeli etiket', () => {
    // JSXMemberExpression'da bu `undefined` olduğu için `val[0]` TypeError fırlatıyordu.
    test('<Foo.Bar /> derlenir', () => {
        expect(compile(`function A(){ return <Foo.Bar />; }`)).toContain('_mc(Foo.Bar');
    });

    test('iki kademeli üye ifadesi de derlenir', () => {
        expect(compile(`function A(){ return <A.B.C x={1} />; }`)).toContain('_mc(A.B.C');
    });

    test('üye ifadeli etikette değersiz öznitelik de true olur', () => {
        expect(compile(`function A(){ return <Foo.Bar flag />; }`)).toMatch(/flag:\s*true/);
    });
});

/* ══════════════════════════════════════════════════════════ D2 — değersiz öznitelik */

describe('D2: değersiz öznitelik bileşende `true` olur', () => {
    test('bileşen etiketi: prop düşmez, true geçer', () => {
        const out = compile(`function A(){ return <Comp flag />; }`);
        expect(out).toMatch(/flag:\s*true/);
    });

    test('tireli/iki noktalı ad dizge anahtar olur', () => {
        const out = compile(`function A(){ return <Comp data-x />; }`);
        expect(out).toMatch(/"data-x":\s*true/);
    });

    test('değerli prop davranışı değişmedi', () => {
        const out = compile(`function A(){ return <Comp flag={false} />; }`);
        expect(out).toMatch(/flag:\s*false/);
    });

    test('DOM etiketinde eski davranış korunur (öznitelik yazılır)', () => {
        const out = compile(`function A(){ return <input disabled />; }`);
        expect(out).toMatch(/"disabled"/);
    });
});

/* ═══════════════════════════════════════════════════════ Uyarılar (MJX001…MJX004) */

describe('MJX001: blok gövdeli okta yerel değişken + koşul', () => {
    test('yerel değişken varsa uyarır', () => {
        expect(codesOf(`function A(p){ return <div>{() => { const l = f(p.x); return p.ok ? <A t={l}/> : <B/>; }}</div>; }`))
            .toContain('MJX001');
    });

    test('uyarı, kaybolan değişkenin ADINI söyler', () => {
        const d = diags(`function A(p){ return <div>{() => { const etiket = f(p.x); return p.ok ? <A t={etiket}/> : <B/>; }}</div>; }`);
        expect(d.find(x => x.code === 'MJX001')!.message).toContain('"etiket"');
    });

    test('ifade gövdeli ok: uyarı YOK', () => {
        expect(codesOf(`function A(p){ return <div>{() => p.ok ? <A/> : <B/>}</div>; }`)).not.toContain('MJX001');
    });

    test('yerel değişkensiz blok gövde: uyarı YOK', () => {
        expect(codesOf(`function A(p){ return <div>{() => { return p.ok ? <A/> : <B/>; }}</div>; }`)).not.toContain('MJX001');
    });
});

describe('MJX002: bileşen etiketinde camelCase DOM olay adı', () => {
    test('<Comp onChange> uyarır', () => {
        expect(codesOf(`function A(){ return <Comp onChange={(v) => g(v)} />; }`)).toContain('MJX002');
    });

    test('<Comp onClick> uyarır', () => {
        expect(codesOf(`function A(){ return <Comp onClick={() => g()} />; }`)).toContain('MJX002');
    });

    test('<Comp onclick> — küçük harf kasıtlı yazım, uyarı YOK', () => {
        expect(codesOf(`function A(){ return <Comp onclick={() => g()} />; }`)).not.toContain('MJX002');
    });

    test('DOM etiketinde uyarı YOK', () => {
        expect(codesOf(`function A(){ return <button onclick={() => g()} />; }`)).not.toContain('MJX002');
    });

    test('çakışmayan geri çağrı adı: uyarı YOK', () => {
        expect(codesOf(`function A(){ return <Comp onValueChange={(v) => g(v)} />; }`)).not.toContain('MJX002');
    });

    test('yaşam döngüsü prop\'u uyarı üretmez', () => {
        expect(codesOf(`function A(){ return <Comp onbuilt={(s) => g(s)} />; }`)).not.toContain('MJX002');
    });
});

describe('MJX003: anahtarsız liste', () => {
    test('key\'siz .map uyarır', () => {
        expect(codesOf(`function A(p){ return <ul>{p.a.map(x => <li>{x.t}</li>)}</ul>; }`)).toContain('MJX003');
    });

    test('key verilmişse uyarı YOK', () => {
        expect(codesOf(`function A(p){ return <ul>{p.a.map(x => <li key={x.id}>{x.t}</li>)}</ul>; }`)).not.toContain('MJX003');
    });

    test('blok gövdeli mapper + key: uyarı YOK', () => {
        expect(codesOf(`function A(p){ return <ul>{p.a.map(x => { return <li key={x.id}/>; })}</ul>; }`)).not.toContain('MJX003');
    });

    test('blok gövdeli mapper, key YOK: uyarır', () => {
        expect(codesOf(`function A(p){ return <ul>{p.a.map(x => { return <li/>; })}</ul>; }`)).toContain('MJX003');
    });

    test('yayılımlı öğe kökünde karar verilmez (key spread içinde olabilir)', () => {
        expect(codesOf(`function A(p){ return <ul>{p.a.map(x => <li {...x}/>)}</ul>; }`)).not.toContain('MJX003');
    });

    test('bileşen öğesinde de çalışır', () => {
        expect(codesOf(`function A(p){ return <ul>{p.a.map(x => <Row item={x}/>)}</ul>; }`)).toContain('MJX003');
        expect(codesOf(`function A(p){ return <ul>{p.a.map(x => <Row key={x.id} item={x}/>)}</ul>; }`)).not.toContain('MJX003');
    });

    test('filter().map() zincirinde de çalışır', () => {
        expect(codesOf(`function A(p){ return <ul>{p.a.filter(x => x.on).map(x => <li/>)}</ul>; }`)).toContain('MJX003');
    });
});

describe('MJX004: reaktif getter içinde kısa devre yapan dizi yüklemi', () => {
    test('this.state üzerinde some() uyarır', () => {
        expect(codesOf(`class A { view(){ return <div>{() => this.state.rows.some(x => x.on)}</div>; } }`)).toContain('MJX004');
    });

    test('this.props üzerinde every() uyarır', () => {
        expect(codesOf(`class A { view(){ return <div>{() => this.props.rows.every(x => x.on)}</div>; } }`)).toContain('MJX004');
    });

    test('uyarı, hangi metot olduğunu söyler', () => {
        const d = diags(`class A { view(){ return <div>{() => this.state.rows.find(x => x.on)}</div>; } }`);
        expect(d.find(x => x.code === 'MJX004')!.message).toContain('"find()"');
    });

    test('modül sabiti üzerinde: uyarı YOK (gürültü olurdu)', () => {
        expect(codesOf(`function A(){ return <div>{() => NAV.find(x => x.k === 1)}</div>; }`)).not.toContain('MJX004');
    });

    test('filter().length: uyarı YOK (tam gezer)', () => {
        expect(codesOf(`class A { view(){ return <div>{() => this.state.rows.filter(x => x.on).length}</div>; } }`)).not.toContain('MJX004');
    });

    test('map: uyarı YOK', () => {
        expect(codesOf(`function A(p){ return <ul>{p.arr.map(x => <li key={x.id}>{x.t}</li>)}</ul>; }`)).not.toContain('MJX004');
    });

    test('düz alan okuması: uyarı YOK', () => {
        expect(codesOf(`class A { view(){ return <div>{() => this.state.name}</div>; } }`)).not.toContain('MJX004');
    });
});

/* ══════════════════════════════════════════════ Uyarı altyapısı sözleşmesi */

describe('tanı altyapısı', () => {
    test('temiz kaynak hiç uyarı üretmez', () => {
        expect(codesOf(`function A(p){ return <div class="x"><span>{() => p.n}</span></div>; }`)).toEqual([]);
    });

    test('uyarı dosya adı ve satır taşır', () => {
        const d = diags(`function A(){ return <Comp onChange={(v)=>g(v)} />; }`);
        expect(d[0].file).toBe('F.tsx');
        expect(typeof d[0].line).toBe('number');
    });

    test('aynı uyarı aynı satırda tekrarlanmaz', () => {
        const d = diags(`function A(){ return <Comp onChange={(v)=>g(v)} />; }`);
        expect(d.filter(x => x.code === 'MJX002')).toHaveLength(1);
    });

    test('diagnostics her derlemede sıfırlanır', () => {
        const c = new Compiler();
        c.start(`function A(){ return <Comp onChange={(v)=>g(v)} />; }`, 'F.tsx');
        expect(c.diagnostics.length).toBeGreaterThan(0);
        c.start(`function B(){ return <div />; }`, 'G.tsx');
        expect(c.diagnostics).toEqual([]);
    });

    test('uyarılar derlemeyi DURDURMAZ — kod yine üretilir', () => {
        const out = compile(`function A(){ return <Comp onChange={(v)=>g(v)} />; }`);
        expect(out).toContain('_mc(Comp');
    });

    test('bu depodaki idiomatik yazımlar sessiz kalır (gürültü kontrolü)', () => {
        expect(codesOf(`function A(p){ return <Button onclick={() => p.go()} text="Kaydet" />; }`)).toEqual([]);
        expect(codesOf(`function A(p){ return <ul>{p.rows.map(r => <li key={r.id}>{r.t}</li>)}</ul>; }`)).toEqual([]);
        expect(codesOf(`function A(p){ return <Icon name={p.ok ? 'check' : 'error'} size={14} />; }`)).toEqual([]);
        expect(codesOf(`function A(p){ return <Comp mode={p.x ? 'a' : 'b'} />; }`)).toEqual([]);
        expect(codesOf(`function A(p){ return <div x-wait={() => !p.open}><span>{() => p.t}</span></div>; }`)).toEqual([]);
    });
});