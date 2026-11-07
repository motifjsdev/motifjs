import Compiler from '../src/compiler';
import { explain as explainSource } from '../src/index';

const compile = (code: string) => {
    const r = new Compiler().start(code, 'X.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

const diagnosticsOf = (code: string) => {
    const compiler = new Compiler();
    expect(compiler.start(code, 'X.tsx')).not.toBeNull();
    return compiler.diagnostics.map(d => d.code);
};

const onTag = (attr: string) => `function A(s){ return <Chart ${attr} />; }`;

describe('x ile başlayan sıradan prop adları bileşene ulaşır', () => {
    test.each([
        ['xField="date"', /xField:\s*"date"/],
        ['xField={s.field}', /xField:/],
        ['xAxis={{ min: 0 }}', /xAxis:\s*\{\s*min:\s*0/],
        ['x={10}', /\bx:\s*10/],
        ['xs={6}', /\bxs:\s*6/],
        ['xl={3}', /\bxl:\s*3/],
        ['xOffset={4}', /xOffset:\s*4/],
        ['xValues={[1, 2]}', /xValues:\s*\[1,\s*2\]/],
        ['xFormat={(v) => v}', /xFormat:/],
    ])('%s', (attr, shape) => {
        expect(compile(onTag(attr))).toMatch(shape);
    });

    test('değersiz yazım true olur', () => {
        expect(compile(onTag('xStacked'))).toMatch(/xStacked:\s*true/);
    });

    test('üçlü ifade öteki proplar gibi getter olur', () => {
        const x = compile(onTag(`xField={s.a ? 'a' : 'b'}`));
        const y = compile(onTag(`yField={s.a ? 'a' : 'b'}`));
        expect(x.replace(/xField/g, 'yField')).toBe(y);
    });

    test('çıktı adı dışında y ile başlayan propla aynıdır', () => {
        const attr = (name: string) => `${name}={s.field} ${name}Label="t" ${name}Axis={{ min: 0 }}`;
        expect(compile(onTag(attr('xField'))).replace(/xField/g, 'yField')).toBe(compile(onTag(attr('yField'))));
    });

    test('sınıf bileşeninde de ulaşır', () => {
        const out = compile(`class P { view(){ return <Chart xField={this.field} />; } }`);
        expect(out).toMatch(/xField:/);
    });

    test('noktalı etikette de ulaşır', () => {
        expect(compile(`function A(){ return <Ui.Chart xField="date" />; }`)).toMatch(/xField:\s*"date"/);
    });

    test('explain satırı prop olarak çıkar', () => {
        const row = explainSource(onTag('xField={s.field}'), 'X.tsx').find(e => e.source.startsWith('xField='));
        expect(row).toBeDefined();
        expect(row!.site).toBe('prop');
    });

    test('uyarı üretmez', () => {
        expect(diagnosticsOf(onTag('xField="date"'))).toEqual([]);
    });
});

describe('düz etiketlerde değişiklik yok', () => {
    test('svg x özniteliği', () => {
        const out = compile(`function A(){ return <rect x={1} />; }`);
        expect(out).toMatch(/"x"/);
    });
});

describe('çekirdek yönergeleri yönerge kalır', () => {
    test('x-wait bir prop olmaz', () => {
        const out = compile(onTag('x-wait={s.a}'));
        expect(out).toMatch(/sender\.bindings\.wait\(/);
        expect(out).not.toMatch(/"x-wait":/);
    });
    test('x:display bir prop olmaz', () => {
        const out = compile(onTag('x:display={s.a}'));
        expect(out).toMatch(/sender\.bindings\.display\(/);
        expect(out).not.toMatch(/"x:display":/);
    });
    test('x-chunk ayar olarak gider', () => {
        expect(compile(onTag('x-chunk={200}'))).toMatch(/"x-chunk":\s*200/);
    });
    test.each(['x-mounted', 'x-built', 'x-config', 'x-creating', 'x-created', 'x-disposing', 'x-activated', 'x-initializecomponent', 'x:built'])('%s yaşam döngüsü kancası kalır', (attr) => {
        const out = compile(onTag(`${attr}={() => 1}`));
        expect(out).not.toContain(`"${attr}"`);
    });
    test.each(['x-WAIT', 'X-wait'])('%s büyük harfle de yönergedir', (attr) => {
        expect(compile(onTag(`${attr}={s.a}`))).toMatch(/sender\.bindings\.wait\(/);
    });
});

describe('çekirdekte karşılığı olmayan x- ve x: adları dokunulmadan geçer', () => {
    const names = ['x-field', 'x-Field', 'x-chart-type', 'x:field', 'x:Field', 'x-reload', 'x-bind', 'x-effect', 'x-focus', 'x-interrupt', 'x-to', 'x-list', 'x-loop', 'x:focus', 'x:list', 'x-checked', 'x-on:field'];

    test.each(names)('%s bileşene adı bozulmadan gider', (attr) => {
        const out = compile(onTag(`${attr}={s.a}`));
        expect(out).toContain(`"${attr}": s.a`);
        expect(diagnosticsOf(onTag(`${attr}={s.a}`))).toEqual([]);
    });

    test.each(names)('%s değersiz yazımda true olur', (attr) => {
        expect(compile(onTag(attr))).toContain(`"${attr}": true`);
    });

    test('üçlü ifade öteki proplar gibi getter olur', () => {
        const x = compile(onTag(`x-field={s.a ? 'a' : 'b'}`));
        const y = compile(onTag(`y-field={s.a ? 'a' : 'b'}`));
        expect(x.replace(/x-field/g, 'y-field')).toBe(y);
    });

    test.each(names)('%s düz etikette yönergeye dönüşmez', (attr) => {
        const out = compile(`function A(s){ return <span ${attr}={s.a} />; }`);
        expect(out).toContain(`"${attr}"`);
        expect(out).not.toMatch(/\bon[a-z]+:/);
        expect(diagnosticsOf(`function A(s){ return <span ${attr}={s.a} />; }`)).toEqual([]);
    });

    test('explain satırı prop olarak çıkar', () => {
        const row = explainSource(onTag('x-field={s.field}'), 'X.tsx').find(e => e.source.startsWith('x-field='));
        expect(row).toBeDefined();
        expect(row!.site).toBe('prop');
    });
});
