import Compiler from '../src/compiler';
import { explain, formatExplanations } from '../src/index';
import type { MotifExplanation } from '../src/explain';

const wrap = (jsx: string) =>
    `import { Component } from '@motifx/core';
export default class A extends Component<HTMLDivElement> {
    state: any = {};
    view() { return (${jsx}); }
}`;

const ex = (jsx: string): MotifExplanation[] => explain(wrap(jsx), 'F.tsx');
const find = (list: MotifExplanation[], source: string, site?: string): MotifExplanation => {
    const ok = (e: MotifExplanation) => !site || e.site === site;
    const hit = list.find(e => e.source === source && ok(e)) ?? list.find(e => e.source.includes(source) && ok(e));
    if (!hit) throw new Error(`kayıt yok: ${source}\n` + formatExplanations(list));
    return hit;
};

/* ═══════════════════════════════════════════════════════ altyapı */

describe('explain altyapısı', () => {
    test('start() kayıt tutmaz, explain() tutar; iki yol AYNI kodu üretir', () => {
        const src = wrap(`<div title={this.state.a}>{this.state.b}{() => this.state.c}</div>`);
        const a = new Compiler();
        const ra = a.start(src, 'F.tsx');
        expect(a.explanations).toEqual([]);
        const b = new Compiler();
        const rb = b.explain(src, 'F.tsx');
        expect(b.explanations.length).toBeGreaterThan(0);
        expect(rb!.code).toBe(ra!.code);
    });

    test('kayıtlar kaynak sırasındadır (satır, sütun)', () => {
        const list = ex(`<div title={this.state.a}>
            <p>{this.state.b}</p>
            <span>{() => this.state.c}</span>
        </div>`);
        const keys = list.map(e => (e.line ?? 0) * 10000 + (e.column ?? 0));
        expect([...keys].sort((x, y) => x - y)).toEqual(keys);
        expect(list.every(e => e.line !== null)).toBe(true);
    });

    test('iç içe elemanın konumu korunur (çocuk ebeveynden önce değiştirilse de)', () => {
        const list = ex(`<div>
            <section>
                <p>{this.state.x}</p>
            </section>
        </div>`);
        const p = list.find(e => e.site === 'element' && e.source === '<p>')!;
        expect(p).toBeDefined();
        expect(p.line).toBe(6);
        expect(p.lowered).toContain('sender.controls.add(_mc(<p>');
    });

    test('her kayıtta dosya, konum türü, şekil, reaktiflik ve bağımlılık vardır', () => {
        for (const e of ex(`<div class="a" title={() => this.state.t}>{this.state.x}{this.state.ok && <i/>}</div>`)) {
            expect(e.file).toBe('F.tsx');
            expect(e.site).toBeTruthy();
            expect(e.shape).toBeTruthy();
            expect(['live', 'static', 'once', 'receiver', 'runtime', 'n/a']).toContain(e.reactive);
            expect(e.deps.length).toBeGreaterThan(0);
            expect(e.lowered.length).toBeGreaterThan(0);
        }
    });

    test('kayıt derlemeyi değiştirmez: derleme hatası explain ile de aynı şekilde fırlar', () => {
        expect(() => new Compiler().explain(wrap(`<div onclick="x" />`), 'F.tsx')).toThrow();
        expect(() => new Compiler().start(wrap(`<div onclick="x" />`), 'F.tsx')).toThrow();
    });

    test('formatExplanations dosya başlığı, konum ve indiği çağrıyı yazar', () => {
        const out = formatExplanations(ex(`<div>{this.state.ad}</div>`));
        expect(out).toContain('[motifjs explain] F.tsx');
        expect(out).toMatch(/\d+:\d+\s+child\/text\.field\s+\{this\.state\.ad\}/);
        expect(out).toContain('=> sender.bindings.add("textContent", this.state, "ad")');
        expect(out).toContain('LIVE');
    });
});

/* ═══════════════════════════════════════════════════════ çocuk ifadeleri */

describe('çocuk ifadeleri', () => {
    test('{state.alan} → text.field, kesin tek alan bağı', () => {
        const e = find(ex(`<p>{this.state.ad}</p>`), '{this.state.ad}');
        expect(e.site).toBe('child');
        expect(e.shape).toBe('text.field');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toBe('sender.bindings.add("textContent", this.state, "ad")');
        expect(e.deps).toContain('this.state.ad');
        expect(e.deps).toContain('this field only');
    });

    test('{() => …} → method (getter; sonuç metinse metin, bileşense Frame)', () => {
        const e = find(ex(`<p>{() => this.state.ad + '!'}</p>`), "{() => this.state.ad + '!'}");
        expect(e.shape).toBe('method');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toBe("sender.bindings.method(() => this.state.ad + '!')");
        expect(e.deps).toContain('ALL reactive fields');
    });

    test('{a + b} → text.getter (getter\'a sarılı metin bağı)', () => {
        const e = find(ex(`<p>{this.state.n + 1}</p>`), '{this.state.n + 1}');
        expect(e.shape).toBe('text.getter');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toMatch(/^sender\.bindings\.add\("textContent", \(\) =>/);
    });

    test('{"sabit"} → text.static, bağ yok', () => {
        const e = find(ex(`<p>{"sabit"}</p>`), '{"sabit"}');
        expect(e.shape).toBe('text.static');
        expect(e.reactive).toBe('static');
        expect(e.lowered).toBe('sender.setText("sabit")');
    });

    test('{this.f()} → method (try/catch içinde çağrı)', () => {
        const e = find(ex(`<p>{this.f()}</p>`), '{this.f()}');
        expect(e.shape).toBe('method');
        expect(e.lowered).toContain('sender.bindings.method(() => { try { return this.f(); }');
    });

    test('{a ?? b} → coalesce (when DEĞİL)', () => {
        const e = find(ex(`<p>{this.state.a ?? 'yok'}</p>`), "{this.state.a ?? 'yok'}");
        expect(e.shape).toBe('coalesce');
        expect(e.lowered).toMatch(/^sender\.bindings\.method\(/);
    });

    test('{cond && <X/>} → when; not x-wait\'e yönlendirir', () => {
        const e = find(ex(`<div>{this.state.ok && <i/>}</div>`), '{this.state.ok && <i/>}');
        expect(e.shape).toBe('when');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toMatch(/^sender\.bindings\.when\(/);
        expect(e.note).toContain('x-wait');
        expect(e.note).toContain('NEW instance');
    });

    test('{c ? <A/> : <B/>} → ternary (Frame, ilk dal senkron)', () => {
        const e = find(ex(`<div>{this.state.ok ? <em/> : <b/>}</div>`), '{this.state.ok ? <em/> : <b/>}');
        expect(e.shape).toBe('ternary');
        expect(e.lowered).toMatch(/^sender\.bindings\.ternary\(\(\) => this\.state\.ok, frame =>/);
        expect(e.note).toContain('SYNCHRONOUSLY');
    });

    test('{arr.map(…)} → list; key ayrı kayıt', () => {
        const list = ex(`<ul>{this.state.items.map(i => <li key={i.id}>{i.t}</li>)}</ul>`);
        const l = find(list, '.map(');
        expect(l.shape).toBe('list');
        expect(l.reactive).toBe('live');
        expect(l.lowered).toMatch(/^sender\.bindings\.list\(/);
        expect(l.deps).toContain('key');
        const k = find(list, 'key={i.id}', 'key');
        expect(k.site).toBe('key');
        expect(k.lowered).toBe('indexkey: () => { return i.id; }');
        const t = find(list, '{i.t}');
        expect(t.shape).toBe('text.field');
        expect(t.lowered).toBe('sender.bindings.add("textContent", i, "t")');
    });

    test('{this.childs} → value: controls.add, bir kez', () => {
        const e = find(ex(`<div>{this.childs}</div>`), '{this.childs}');
        expect(e.shape).toBe('value');
        expect(e.reactive).toBe('once');
        expect(e.lowered).toBe('sender.controls.add(this.childs)');
    });

    test('fragment kökünde {cond && <X/>} → when', () => {
        const e = find(ex(`<>{this.state.ok && <i/>}<p/></>`), '{this.state.ok && <i/>}');
        expect(e.shape).toBe('when');
        expect(e.note).toContain('fragment');
    });

    test('bileşen etiketinin çocukları childs slotuna gider', () => {
        const list = ex(`<Card><p>{this.state.x}</p>{() => this.state.y}</Card>`);
        const p = find(list, '<p>');
        expect(p.site).toBe('element');
        expect(p.lowered).toContain('childs');
        const y = find(list, '{() => this.state.y}');
        expect(y.shape).toBe('method');
        expect(y.lowered).toContain('childs');
    });
});

/* ═══════════════════════════════════════════════════════ öznitelikler ve prop'lar */

describe('DOM öznitelikleri', () => {
    test('class="a" → class.add, statik', () => {
        const e = find(ex(`<div class="a" />`), 'class="a"');
        expect(e.site).toBe('attr');
        expect(e.shape).toBe('attr.literal');
        expect(e.reactive).toBe('static');
        expect(e.lowered).toBe('sender.class.add("a")');
    });

    test('title={state.x} → korumalı getter, canlı', () => {
        const e = find(ex(`<div title={this.state.x} />`), 'title={this.state.x}');
        expect(e.shape).toBe('attr.expr');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toMatch(/^sender\.attr\.add\(\{ "title": \(\) =>/);
    });

    test('title={() => …} → getter, canlı', () => {
        const e = find(ex(`<div title={() => this.state.x} />`), 'title={() => this.state.x}');
        expect(e.shape).toBe('attr.getter');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toBe('sender.attr.add({ "title": () => this.state.x })');
    });

    test('title={c ? a : b} → tembel sarıldı, canlı (tasarım)', () => {
        const e = find(ex(`<div title={this.state.ok ? 'a' : 'b'} />`), "title={this.state.ok ? 'a' : 'b'}");
        expect(e.shape).toBe('attr.ternary');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toBe(`sender.attr.add({ "title": () => this.state.ok ? 'a' : 'b' })`);
        expect(e.note).toContain('by design');
    });

    test('data-n={f(x)} → düz çağrı DEĞER olarak geçer, BİR KEZ', () => {
        const e = find(ex(`<div data-n={fmt(this.state.n)} />`), 'data-n={fmt(this.state.n)}');
        expect(e.shape).toBe('attr.call');
        expect(e.reactive).toBe('once');
        expect(e.lowered).toBe('sender.attr.add({ "data-n": fmt(this.state.n) })');
        expect(e.note).toContain('() => f(x)');
    });

    test('hidden={deg} (tanımlayıcı) → çalışma anında karar', () => {
        const e = find(ex(`<div hidden={gizli} />`), 'hidden={gizli}');
        expect(e.shape).toBe('attr.identifier');
        expect(e.reactive).toBe('runtime');
    });

    test('değersiz öznitelik → true, statik', () => {
        const e = find(ex(`<input disabled />`), 'disabled');
        expect(e.shape).toBe('attr.flag');
        expect(e.reactive).toBe('static');
    });

    test('x-wait → bindings.wait (preconfig), not: başlangıçta true ise hiç kurulmaz', () => {
        const e = find(ex(`<div x-wait={() => !this.state.ok} />`), 'x-wait=');
        expect(e.site).toBe('directive');
        expect(e.shape).toBe('directive.wait');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toBe('sender.bindings.wait(() => !this.state.ok)');
        expect(e.note).toContain('never built');
    });

    test('x-display → bindings.display, örnek korunur', () => {
        const e = find(ex(`<div x-display={() => this.state.ok} />`), 'x-display=');
        expect(e.shape).toBe('directive.display');
        expect(e.lowered).toMatch(/^sender\.bindings\.display\(/);
        expect(e.note).toContain('instance is kept');
    });

    test('x-model → bindings.model, iki yönlü', () => {
        const e = find(ex(`<input x-model={this.state.ad} />`), 'x-model=');
        expect(e.shape).toBe('directive.model');
        expect(e.lowered).toMatch(/^sender\.bindings\.model\(/);
        expect(e.deps).toContain('two-way');
    });

    test('onclick → sender.motif.on("click", …), reaktiflik uygulanmaz', () => {
        const e = find(ex(`<button onclick={() => this.f()} />`), 'onclick=');
        expect(e.site).toBe('event');
        expect(e.shape).toBe('event.dom');
        expect(e.reactive).toBe('n/a');
        expect(e.lowered).toMatch(/^sender\.motif\.on\("click", \(\) =>/);
        expect(e.note).toBeUndefined();
    });

    test('on:custom → bağlam olayı, işleyici olduğu gibi motif.on\'a geçer', () => {
        const e = find(ex(`<Comp on:save={(s, a) => this.f(a)} />`), 'on:save=');
        expect(e.shape).toBe('event.context');
        expect(e.lowered).toBe('sender.motif.on("save", (s, a) => this.f(a))');
        expect(e.note).toContain('fn(event)');
        expect(e.note).toContain('fn(sender, event)');
    });

    test('oncreated → yaşam döngüsü tuzağı', () => {
        const e = find(ex(`<div oncreated={(s) => this.f(s)} />`), 'oncreated=');
        expect(e.site).toBe('component-event');
        expect(e.reactive).toBe('n/a');
    });
});

describe('bileşen prop\'ları', () => {
    test('mode={c ? a : b} → prop.ternary, ALICIYA BAĞLI; not Bind<T> sözleşmesini söyler', () => {
        const e = find(ex(`<Comp mode={this.state.ok ? 'a' : 'b'} />`), "mode={this.state.ok ? 'a' : 'b'}");
        expect(e.site).toBe('prop');
        expect(e.shape).toBe('prop.ternary');
        expect(e.reactive).toBe('receiver');
        expect(e.lowered).toBe("mode: () => this.state.ok ? 'a' : 'b'");
        expect(e.note).toContain('Bind<T>');
    });

    test('text={() => …} → prop.getter, ALICIYA BAĞLI', () => {
        const e = find(ex(`<Comp text={() => this.state.t} />`), 'text={() => this.state.t}');
        expect(e.shape).toBe('prop.getter');
        expect(e.reactive).toBe('receiver');
        expect(e.lowered).toBe('text: () => this.state.t');
    });

    test('size={16} / appearance="x" → prop.literal, statik', () => {
        const list = ex(`<Comp size={16} appearance="accent" />`);
        expect(find(list, 'size={16}').shape).toBe('prop.literal');
        expect(find(list, 'appearance="accent"').lowered).toBe('appearance: "accent"');
    });

    test('items={this.state.rows} → prop.value, BİR KEZ (nesne proxy ise alıcı canlı okuyabilir)', () => {
        const e = find(ex(`<Comp items={this.state.rows} />`), 'items={this.state.rows}');
        expect(e.shape).toBe('prop.value');
        expect(e.reactive).toBe('once');
        expect(e.lowered).toBe('items: this.state.rows');
        expect(e.note).toContain('proxy');
    });

    test('pane={<X/>} → prop.element', () => {
        const e = find(ex(`<Comp pane={<span/>} />`), 'pane={<span/>}');
        expect(e.shape).toBe('prop.element');
    });

    test('flag (değersiz) → prop.flag true', () => {
        const e = find(ex(`<Comp flag />`), 'flag');
        expect(e.shape).toBe('prop.flag');
        expect(e.lowered).toBe('flag: true');
    });

    test('bileşen etiketinde onclick → DOM olayı; not this.props\'a ulaşmadığını söyler', () => {
        const e = find(ex(`<Button onclick={() => this.f()} />`), 'onclick=');
        expect(e.shape).toBe('event.dom');
        expect(e.note).toContain('this.props');
    });

    test('üye ifadeli etikette de prop kaydı çıkar', () => {
        const e = find(ex(`<Foo.Bar mode={this.state.ok ? 'a' : 'b'} />`), 'mode=');
        expect(e.shape).toBe('prop.ternary');
    });
});