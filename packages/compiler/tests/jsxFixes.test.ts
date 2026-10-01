import Compiler from '../src/compiler';
import { explain } from '../src/index';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

describe('view sıradan bir prop', () => {
    test('düz etikette view öznitelik olarak yazılır', () => {
        const out = compile(`function A(){ return <div view="grid" />; }`);
        expect(out).toMatch(/attr\.add\(\{\s*"view":\s*"grid"\s*\}\)/);
    });

    test('bileşen etiketinde view prop olarak geçer', () => {
        const out = compile(`function A(){ return <Card view="grid" />; }`);
        expect(out).toMatch(/_mc\(Card,\s*\{\s*view:\s*"grid"/);
    });
});

describe('düz DOM etiketinde initializeComponent ve ref', () => {
    test('initializeComponent öznitelik getter\'ı olarak DERLENMEZ; tek başına initializeComponent prop\'u olur', () => {
        const out = compile(`function A(){ return <hr initializeComponent={(s) => init(s)} />; }`);
        expect(out).toMatch(/_mc\("hr",\s*\{\s*initializeComponent:\s*s => init\(s\)\s*\}\)/);
        expect(out).not.toMatch(/"initializeComponent"/);
    });

    test('derleyicinin kendi initializeComponent\'i varsa kullanıcınınki önce gelen bir listede birleşir', () => {
        const out = compile(`function A(){ return <p initializeComponent={this.init} class="a">x</p>; }`);
        expect(out).toMatch(/initializeComponent:\s*\[this\.init,\s*sender => \{/);
        expect(count(out, /initializeComponent:/g)).toBe(2);
    });

    test('ref={this.x} atama biçimine iner', () => {
        const out = compile(`class A { input: any; view(){ return <input ref={this.input} />; } }`);
        expect(out).toMatch(/ref:\s*sender => \{\s*this\.input = sender;/);
        expect(out).not.toMatch(/"ref"/);
    });

    test('ref={(c) => …} fonksiyon olarak geçer', () => {
        const out = compile(`class A { view(){ return <input ref={(c) => this.box = c} />; } }`);
        expect(out).toMatch(/ref:\s*c => this\.box = c/);
        expect(out).not.toMatch(/"ref"/);
    });

    test('bileşen etiketindeki initializeComponent runover içinde geçer', () => {
        const out = compile(`function A(){ return <Box initializeComponent={f} title="t" />; }`);
        expect(out).toMatch(/_mc\(Box,\s*\{\s*title:\s*"t",\s*runover:\s*\{\s*initializeComponent:\s*f\s*\}/);
        expect(count(out, /initializeComponent:/g)).toBe(1);
    });

    test('explain initializeComponent ve ref kaydı üretir', () => {
        const list = explain(`function A(){ return <p initializeComponent={f} ref={g} />; }`, 'F.tsx');
        const init = list.find(e => e.source.startsWith('initializeComponent='))!;
        const ref = list.find(e => e.source.startsWith('ref='))!;
        expect(init.site).toBe('component-event');
        expect(init.lowered).toBe('initializeComponent: f');
        expect(ref.shape).toBe('ref');
        expect(ref.lowered).toContain('ref:');
    });
});

describe('aynı kancanın iki yazımı birleşir', () => {
    test('düz etikette onbuilt + x-built + x:built tek anahtarda kaynak sırasıyla', () => {
        const out = compile(`function A(){ return <div x-built={b} onbuilt={a} x:built={c} />; }`);
        expect(count(out, /onbuilt:/g)).toBe(1);
        expect(out).toContain('onbuilt: [b, a, c]');
    });

    test('büyük/küçük harf farkı birleşir (onBuilt + x-built)', () => {
        const out = compile(`function A(){ return <div onBuilt={a} x-built={b} />; }`);
        expect(out).toContain('onbuilt: [a, b]');
        expect(out).not.toMatch(/onBuilt:/);
    });

    test('bileşen etiketinde birleşik liste runover içinde', () => {
        const out = compile(`function A(){ return <Box x-mounted={b} onmounted={a} />; }`);
        expect(out).toMatch(/runover:\s*\{\s*onmounted:\s*\[b, a\]\s*\}/);
        expect(count(out, /onmounted:/g)).toBe(1);
    });

    test('kapsamdaki her kanca birleşir', () => {
        const hooks = ['built', 'building', 'mounted', 'config', 'configured', 'initializing', 'initialized', 'disposing', 'disposed', 'visibilitychanged', 'activated', 'deactivated'];
        for (const h of hooks) {
            const out = compile(`function A(){ return <div on${h}={a} x-${h}={b} />; }`);
            expect(count(out, new RegExp(`on${h}:`, 'g'))).toBe(1);
            expect(out).toContain(`on${h}: [a, b]`);
        }
    });

    test('tek yazım eskisi gibi derlenir', () => {
        const out = compile(`function A(){ return <div onbuilt={a} x-mounted={b} />; }`);
        expect(out).toMatch(/onbuilt:\s*a/);
        expect(out).toMatch(/onmounted:\s*b/);
        expect(out).not.toMatch(/\[a\]|\[b\]/);
    });

    test('explain birleşen her yazım için kayıt tutar', () => {
        const list = explain(`function A(){ return <div onbuilt={a} x-built={b} />; }`, 'F.tsx');
        const recs = list.filter(e => e.site === 'component-event');
        expect(recs.length).toBe(2);
        expect(recs.every(e => e.lowered === 'onbuilt: [a, b]')).toBe(true);
    });
});

describe('on:x / on-x / on_x işleyicisi doğrudan motif.on\'a geçer', () => {
    test.each([
        ['on:click', 'click'],
        ['on-click', 'click'],
        ['on_click', 'click'],
    ])('%s', (attr, ev) => {
        const out = compile(`function A(){ return <button ${attr}={(e) => f(e)} />; }`);
        expect(out).toContain(`sender.motif.on("${ev}", e => f(e))`);
        expect(out).not.toContain('...args');
    });

    test('iki parametreli işleyici sarılmaz', () => {
        const out = compile(`function A(){ return <Box on:save={(s, e) => f(s, e)} />; }`);
        expect(out).toContain('sender.motif.on("save", (s, e) => f(s, e))');
    });

    test('işlev olmayan ifade olduğu gibi geçer', () => {
        const out = compile(`class A { view(){ return <button on:click={this.handle} />; } }`);
        expect(out).toContain('sender.motif.on("click", this.handle)');
    });
});

describe('bileşen etiketinde ref atama biçimi', () => {
    test('ref={this.x} bileşen etiketinde atamaya iner', () => {
        const out = compile(`class A { box: any; view(){ return <Box ref={this.box} />; } }`);
        expect(out).toMatch(/_mc\(Box,\s*\{\s*ref:\s*sender => \{\s*this\.box = sender;/);
        expect(out).not.toMatch(/ref:\s*this\.box/);
    });

    test('ref={(c) => …} bileşen etiketinde fonksiyon olarak geçer', () => {
        const out = compile(`class A { view(){ return <Box ref={(c) => this.box = c} />; } }`);
        expect(out).toMatch(/ref:\s*c => this\.box = c/);
    });

    test('üye ifadeli etiket (<Ns.Box>) de atamaya iner', () => {
        const out = compile(`class A { box: any; view(){ return <Ns.Box ref={this.box} />; } }`);
        expect(out).toMatch(/ref:\s*sender => \{\s*this\.box = sender;/);
    });
});

describe('ref ve x-ref birlikte', () => {
    test('düz etikette ref + x-ref tek listede kaynak sırasıyla', () => {
        const out = compile(`class A { two: any; view(){ return <div x-ref={(c) => one(c)} ref={this.two} />; } }`);
        expect(count(out, /ref:/g)).toBe(1);
        expect(out).toMatch(/ref:\s*\[c => one\(c\),\s*sender => \{\s*this\.two = sender;/);
    });

    test('bileşen etiketinde ref + x:ref tek listede kaynak sırasıyla', () => {
        const out = compile(`class A { view(){ return <Box ref={(c) => one(c)} x:ref={(c) => two(c)} />; } }`);
        expect(count(out, /ref:/g)).toBe(1);
        expect(out).toContain('ref: [c => one(c), c => two(c)]');
    });

    test('tek yazım liste üretmez', () => {
        const out = compile(`class A { view(){ return <Box x-ref={(c) => one(c)} />; } }`);
        expect(out).toContain('ref: c => one(c)');
    });

    test('explain her ref yazımı için kayıt tutar', () => {
        const list = explain(`function A(){ return <Box ref={f} x-ref={g} />; }`, 'F.tsx');
        const recs = list.filter(e => e.shape === 'ref');
        expect(recs.length).toBe(2);
        expect(recs[0].note).toContain('in source order');
    });
});

describe('tireli ve alt çizgili özel olay adları', () => {
    test.each([
        ['on-my-event', 'my-event'],
        ['on_my_event', 'my_event'],
        ['on:my-event', 'my-event'],
        ['on-myEvent', 'myEvent'],
    ])('%s → %s', (attr, ev) => {
        const out = compile(`function A(){ return <Box ${attr}={h} />; }`);
        expect(out).toContain(`sender.motif.on("${ev}", h)`);
    });
});

describe('bileşen etiketinde tek yaşam döngüsü yazımı runover\'a gider', () => {
    test.each([
        ['x-mounted', 'onmounted'],
        ['x:configured', 'onconfigured'],
        ['onactivated', 'onactivated'],
        ['onDeactivated', 'onDeactivated'],
        ['x-built', 'onbuilt'],
    ])('%s', (attr, key) => {
        const out = compile(`function A(){ return <Box ${attr}={h} title="t" />; }`);
        expect(out).toMatch(new RegExp('runover:\\s*\\{[\\s\\S]*' + key + ':\\s*h'));
        expect(out).toMatch(/_mc\(Box,\s*\{\s*title:\s*"t",\s*runover:/);
        expect(count(out, new RegExp(`${key}:`, 'g'))).toBe(1);
    });

    test('düz etikette tek yazım yerinde kalır', () => {
        const out = compile(`function A(){ return <div x-mounted={h} />; }`);
        expect(out).toMatch(/_mc\("div",\s*\{\s*onmounted:\s*h\s*\}\)/);
        expect(out).not.toMatch(/runover/);
    });
});

describe('erişilemeyen ref dalı', () => {
    test('derleyici hiçbir yerde sender.bindings.ref üretmez', () => {
        const out = compile(`class A { a: any; b: any; c: any; d: any; view(){ return <div ref={this.a} x-ref={this.b}><Box ref={this.c} x:ref={this.d} /></div>; } }`);
        expect(out).not.toContain('bindings.ref');
    });
});
