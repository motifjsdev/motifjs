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
    test('yerel değişken korunur, uyarı YOK', () => {
        expect(codesOf(`function A(p){ return <div>{() => { const l = f(p.x); return p.ok ? <A t={l}/> : <B/>; }}</div>; }`))
            .not.toContain('MJX001');
    });

    test('parametreli getter bugünkü yolda kalır; uyarı değişkenin ADINI söyler', () => {
        const d = diags(`function A(p){ return <div>{(q) => { const etiket = f(p.x); return p.ok ? <A t={etiket}/> : <B/>; }}</div>; }`);
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

    test('uyarı geri çağrının nasıl verileceğini ve bileşenin içinde nasıl bağlanacağını söyler', () => {
        const message = diags(`function A(){ return <Comp onClick={() => g()} />; }`).find(x => x.code === 'MJX002')!.message;
        expect(message).toContain('"this.props.onClick" stays undefined');
        expect(message).toContain("component's own element");
        expect(message).toContain('without an element it listens on the content elements');
        expect(message).toContain('"onPress"');
        expect(message).toContain('this.motif.on("click", (_sender, e) => this.props.onPress?.(e))');
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

describe('MJX004: reaktif getter içinde anahtarla arama taraması', () => {
    test('this.state üzerinde find(x => x.id === …) uyarır ve alanı söyler', () => {
        const d = diags(`class A { view(){ return <div>{() => this.state.rows.find(x => x.id === this.props.id)}</div>; } }`);
        const hit = d.find(x => x.code === 'MJX004')!;
        expect(hit.message).toContain('"find()"');
        expect(hit.message).toContain('"id"');
    });

    test('findIndex, some ve every de uyarır; karşılaştırma ters yazılsa da', () => {
        expect(codesOf(`class A { view(){ return <div>{() => this.state.rows.findIndex(x => x.key === k)}</div>; } }`)).toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => this.state.rows.some(x => sel === x.id)}</div>; } }`)).toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => this.state.rows.every(x => { return x.id !== skip; })}</div>; } }`)).toContain('MJX004');
    });

    test('öznitelik getter\'ı, direktif, effect, createComputed ve bindings.add de denetlenir', () => {
        expect(codesOf(`class A { view(){ return <div class={() => this.state.rows.find(x => x.id === this.id) ? 'on' : ''} />; } }`)).toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div x-display={() => !!this.state.rows.find(x => x.id === this.id)} />; } }`)).toContain('MJX004');
        expect(codesOf(`import { reactive, effect } from '@motifx/core'; const store = reactive({ rows: [] }); effect(() => store.rows.find(x => x.id === current));`)).toContain('MJX004');
        expect(codesOf(`import { reactive, createComputed } from '@motifx/core'; const store = reactive({ rows: [] }); const row = createComputed(() => store.rows.find(x => x.id === current));`)).toContain('MJX004');
        expect(codesOf(`class A { onConfigured(){ this.bindings.add('textContent', () => this.state.rows.find(x => x.id === this.id)?.name); } }`)).toContain('MJX004');
    });

    test('yüklem bir alan karşılaştırması değilse uyarı YOK (some(x => x.on), includes, filter, map)', () => {
        expect(codesOf(`class A { view(){ return <div>{() => this.state.rows.some(x => x.on)}</div>; } }`)).not.toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => this.state.ids.includes(this.id)}</div>; } }`)).not.toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => this.state.rows.filter(x => x.id === this.id).length}</div>; } }`)).not.toContain('MJX004');
        expect(codesOf(`function A(p){ return <ul>{p.arr.map(x => <li key={x.id}>{x.t}</li>)}</ul>; }`)).not.toContain('MJX004');
    });

    test('reaktif olmayan kökte, olay işleyicisinde ve untracked içinde uyarı YOK', () => {
        expect(codesOf(`function A(){ return <div>{() => NAV.find(x => x.k === 1)}</div>; }`)).not.toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div onclick={() => this.state.rows.find(x => x.id === this.id)} />; } }`)).not.toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => untracked(() => this.state.rows.find(x => x.id === this.id))}</div>; } }`)).not.toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => this.rows().find(x => x.id === this.id)}</div>; } }`)).not.toContain('MJX004');
    });

    test('düz alan okuması: uyarı YOK', () => {
        expect(codesOf(`class A { view(){ return <div>{() => this.state.name}</div>; } }`)).not.toContain('MJX004');
    });

    test('senkron dizi geri çağrısı içindeki arama da uyarır; setTimeout ve then içindeki uyarmaz', () => {
        expect(codesOf(`class A { view(){ return <div>{() => this.state.ids.map(id => this.state.rows.find(r => r.id === id))}</div>; } }`)).toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => this.state.ids.reduce((n, id) => n + (this.state.rows.find(r => r.id === id) ? 1 : 0), 0)}</div>; } }`)).toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => { setTimeout(() => this.state.rows.find(r => r.id === this.id)); return 1; }}</div>; } }`)).not.toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => { this.load().then(() => this.state.rows.find(r => r.id === this.id)); return 1; }}</div>; } }`)).not.toContain('MJX004');
    });

    test('bileşik yüklemde alan karşılaştırması uyarır ve alanı söyler', () => {
        const d = diags(`class A { view(){ return <div>{() => this.state.rows.find(x => x.id === this.props.id && x.kind === 'a')}</div>; } }`);
        expect(d.find(x => x.code === 'MJX004')!.message).toContain('"id"');
        expect(codesOf(`class A { view(){ return <div>{() => this.state.rows.some(x => x.on || x.id === this.id)}</div>; } }`)).toContain('MJX004');
    });

    test('getter içindeki takma ad ve destructuring reaktif sayılır', () => {
        expect(codesOf(`class A { view(){ return <div>{() => { const list = this.state.rows; return list.find(x => x.id === this.props.id); }}</div>; } }`)).toContain('MJX004');
        expect(codesOf(`class A { view(){ return <div>{() => { const { rows } = this.state; return rows.find(x => x.id === this.props.id); }}</div>; } }`)).toContain('MJX004');
        expect(codesOf(`import { reactive, effect } from '@motifx/core'; const store = reactive({ rows: [] }); effect(() => { const { rows } = store; rows.find(x => x.id === current); });`)).toContain('MJX004');
    });

    test('constructor\'da reactive ile kurulan alan reaktif kök sayılır, düz nesne sayılmaz', () => {
        expect(codesOf(`import { reactive, Component } from '@motifx/core'; class A extends Component { model: any; constructor(){ super('div'); this.model = reactive({ rows: [] }); } view(){ return <div>{() => this.model.rows.find(x => x.id === this.props.id)}</div>; } }`)).toContain('MJX004');
        expect(codesOf(`import { Component } from '@motifx/core'; class A extends Component { model: any; constructor(){ super('div'); this.model = { rows: [] }; } view(){ return <div>{() => this.model.rows.find(x => x.id === this.props.id)}</div>; } }`)).not.toContain('MJX004');
    });
});

describe('MJX017: reaktif getter reaktif değer yazıyor', () => {
    test('++ ve atama uyarır, hedefi ve işleci söyler', () => {
        const d = diags(`class A { view(){ return <div>{() => this.state.n++}</div>; } }`);
        expect(d.find(x => x.code === 'MJX017')!.message).toContain('"this.state.n" (++)');
        expect(codesOf(`class A { view(){ return <div>{() => { if (this.state.seen) return 1; this.state.seen = true; return 0; }}</div>; } }`)).toContain('MJX017');
        expect(codesOf(`import { reactive, effect } from '@motifx/core'; const stats = reactive({ runs: 0 }); effect(() => { stats.runs++; });`)).toContain('MJX017');
    });

    test('olay işleyicisi, untracked içi ve reaktif olmayan kök uyarmaz', () => {
        expect(codesOf(`class A { view(){ return <div onclick={() => this.state.n++} />; } }`)).not.toContain('MJX017');
        expect(codesOf(`class A { view(){ return <div>{() => { untracked(() => { this.state.n++; }); return 1; }}</div>; } }`)).not.toContain('MJX017');
        expect(codesOf(`function A(){ return <div>{() => { let n = 0; n++; return n; }}</div>; }`)).not.toContain('MJX017');
        expect(codesOf(`class A { view(){ return <div>{() => this.state.items.map(x => <b onclick={() => { x.done = true; }}>{x.t}</b>)}</div>; } }`)).not.toContain('MJX017');
    });

    test('düz sınıf alanına yazma ve okunmayan alana yazma uyarmaz; fabrikayla kurulan alan reaktiftir', () => {
        expect(codesOf(`class A { view(){ return <div>{() => { if (this.id === this.loadedId) return ''; this.loadedId = this.id; return this.id; }}</div>; } }`)).not.toContain('MJX017');
        expect(codesOf(`class A { onConfigured(){ this.bindings.watch(() => { const seed = this.state.mode === 'c' ? '>' : ''; this.state.query = seed; }); } }`)).not.toContain('MJX017');
        expect(codesOf(`class A { view(){ return <div>{() => { this.state.count = this.state.count + 1; return 1; }}</div>; } }`)).toContain('MJX017');
        expect(codesOf(`class A { view(){ return <div>{() => { this.state.count += 1; return 1; }}</div>; } }`)).toContain('MJX017');
        expect(codesOf(`import { reactive } from '@motifx/core'; class A { model = reactive({ n: 0 }); view(){ return <div>{() => this.model.n++}</div>; } }`)).toContain('MJX017');
        expect(codesOf(`class A { view(){ return <div>{() => this.cache.n++}</div>; } }`)).not.toContain('MJX017');
    });

    test('untracked yalnız okumayı izlemesiz yapar: içindeki düz yazma dışarıda izlenen okumayla uyarır, okuma untracked ise yazma uyarmaz', () => {
        expect(codesOf(`class A { view(){ return <div>{() => { if (this.state.flag) return 1; untracked(() => { this.state.flag = true; }); return 0; }}</div>; } }`)).toContain('MJX017');
        expect(codesOf(`class A { view(){ return <div>{() => { if (untracked(() => this.state.flag)) return 1; this.state.flag = true; return 0; }}</div>; } }`)).not.toContain('MJX017');
        expect(codesOf(`class A { view(){ return <div>{() => { untracked(() => this.state.items.sort()); return 1; }}</div>; } }`)).not.toContain('MJX018');
        expect(codesOf(`class A { view(){ return <div>{() => { untracked(() => this.state.items.sort()); return this.state.items.length; }}</div>; } }`)).toContain('MJX018');
    });

    test('senkron dizi geri çağrısı içindeki yazma da uyarır', () => {
        expect(codesOf(`class A { view(){ return <div>{() => { this.state.rows.forEach(r => { this.state.total += r.v; }); return this.state.total; }}</div>; } }`)).toContain('MJX017');
        expect(codesOf(`class A { view(){ return <div>{() => { this.state.rows.forEach(r => { this.state.total += r.v; }); return this.state.total; }}</div>; } }`)).not.toContain('MJX018');
    });
});

describe('x-chunk: kabın çocukları dilim dilim kurulur', () => {
    test('x-chunk çalışma zamanına prop olarak geçer, MJX007 vermez', () => {
        const code = `class A { view(){ return <tbody x-chunk={200}>{this.state.rows.map((r) => <tr key={r.id}><td>{r.name}</td></tr>)}</tbody>; } }`;
        expect(compile(code)).toContain('"x-chunk": 200');
        expect(codesOf(code)).not.toContain('MJX007');
        expect(compile(code)).not.toContain('onchunk');
    });
    test('bileşen etiketindeki x-chunk da prop olarak geçer; değer çalışma zamanında okunur', () => {
        const code = `class A { view(){ return <NoteList x-chunk={this.rowsPerFrame} folder="notes"/>; } }`;
        const out = compile(code);
        expect(out).toContain('"x-chunk": this.rowsPerFrame');
        expect(out.indexOf('runover')).toBeGreaterThan(-1);
        expect(out.indexOf('"x-chunk"')).toBeGreaterThan(out.indexOf('runover'));
        expect(codesOf(code)).not.toContain('MJX007');
    });
    test('değersiz x-chunk otomatik dilime iner; true ve false da geçer', () => {
        const rows = `{this.state.rows.map((r) => <tr key={r.id}><td>{r.name}</td></tr>)}`;
        expect(compile(`class A { view(){ return <tbody x-chunk>${rows}</tbody>; } }`)).toContain('"x-chunk": true');
        expect(compile(`class A { view(){ return <NoteList x-chunk folder="notes"/>; } }`)).toContain('"x-chunk": true');
        expect(compile(`class A { view(){ return <tbody x-chunk={true}>${rows}</tbody>; } }`)).toContain('"x-chunk": true');
        expect(compile(`class A { view(){ return <tbody x-chunk={false}>${rows}</tbody>; } }`)).toContain('"x-chunk": false');
    });
    test('sayı olamayacak x-chunk derlemeyi MJX012 ile durdurur', () => {
        const rows = `{this.state.rows.map((r) => <tr key={r.id}><td>{r.name}</td></tr>)}`;
        expect(() => compile(`class A { view(){ return <tbody x-chunk="200">${rows}</tbody>; } }`)).toThrow(/MJX012/);
        expect(() => compile(`class A { view(){ return <tbody x-chunk={{ rows: 200 }}>${rows}</tbody>; } }`)).toThrow(/MJX012/);
        expect(() => compile(`class A { view(){ return <tbody x-chunk={() => 200}>${rows}</tbody>; } }`)).toThrow(/MJX012/);
    });
});

describe('MJX018: reaktif getter listeyi yerinde değiştiriyor', () => {
    test('sort, reverse ve push uyarır', () => {
        const d = diags(`class A { view(){ return <div>{() => this.state.items.sort((a, b) => a.n - b.n).length}</div>; } }`);
        expect(d.find(x => x.code === 'MJX018')!.message).toContain('"sort()"');
        expect(codesOf(`class A { view(){ return <ul x-watch={() => this.state.items.reverse()} />; } }`)).toContain('MJX018');
        expect(codesOf(`import { reactive, effect } from '@motifx/core'; const stats = reactive({ log: [] }); effect(() => { if (stats.log.length > 5) stats.log.shift(); stats.log.push(1); });`)).toContain('MJX018');
    });

    test('kopya üstünde sıralama ve olay işleyicisi uyarmaz', () => {
        expect(codesOf(`class A { view(){ return <div>{() => [...this.state.items].sort().length}</div>; } }`)).not.toContain('MJX018');
        expect(codesOf(`class A { view(){ return <div>{() => this.state.items.slice().sort().length}</div>; } }`)).not.toContain('MJX018');
        expect(codesOf(`class A { view(){ return <div onclick={() => this.state.items.push(1)} />; } }`)).not.toContain('MJX018');
        expect(codesOf(`import { reactive, effect } from '@motifx/core'; const stats = reactive({ log: [] }); effect(() => { stats.log.push(1); });`)).not.toContain('MJX018');
    });

    test('takma ad üzerinden sort gerçek listeyi söyler', () => {
        const d = diags(`class A { view(){ return <div>{() => { const l = this.state.rows; return l.sort().length; }}</div>; } }`);
        expect(d.find(x => x.code === 'MJX018')!.message).toContain('"this.state.rows"');
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