import Compiler from '../src/compiler';
import { explain } from '../src/index';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'IR.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

function runoverOf(out: string, tag: string): string {
    const start = out.indexOf(`_mc(${tag}, {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const at = out.indexOf('runover: {', start);
    expect(at).toBeGreaterThan(start);
    let depth = 0;
    for (let i = at + 'runover: '.length; i < out.length; i++) {
        if (out[i] === '{') depth++;
        else if (out[i] === '}') {
            depth--;
            if (depth === 0) return out.slice(at, i + 1);
        }
    }
    throw new Error('runover not closed');
}

function outerOf(out: string, tag: string): string {
    const start = out.indexOf(`_mc(${tag}, {`);
    const at = out.indexOf('runover: {', start);
    return out.slice(start, at);
}

describe('initializeComponent adı', () => {
    test('derleyici hiçbir yerde setup anahtarı üretmez', () => {
        const out = compile(`
            function A(p){
                return <div class="a">
                    <p initializeComponent={p.init}>{p.text}</p>
                    <Box title="t" onclick={p.h}>çocuk {p.n}</Box>
                    <>{p.a}{p.b ?? 'x'}</>
                    {p.rows.map(r => <li key={r.id}>{r.name}</li>)}
                </div>;
            }`);
        expect(out).not.toMatch(/\bsetup\b/);
        expect(out).toMatch(/initializeComponent:/);
    });

    test('metin düğümü, fragment ve bileşen etiketinin derlenmiş kurulumu initializeComponent adını taşır', () => {
        const out = compile(`function A(p){ return <><Box onclick={p.h}>x</Box>{p.v}</>; }`);
        expect(out).toMatch(/_mf\(\{\s*initializeComponent:\s*sender =>/);
        expect(out).toMatch(/_mc\("text",\s*\{\s*initializeComponent:\s*sender =>/);
        expect(runoverOf(out, 'Box')).toMatch(/initializeComponent:\s*sender =>/);
    });

    test('bileşen etiketinde kullanıcının ve derleyicinin initializeComponent\'i runover içinde, kullanıcınınki önce', () => {
        const out = compile(`function A(){ return <Box initializeComponent={init} onclick={h} title="t" />; }`);
        const runover = runoverOf(out, 'Box');
        expect(runover).toMatch(/initializeComponent:\s*\[init,\s*sender => \{/);
        expect(outerOf(out, 'Box')).not.toMatch(/initializeComponent/);
        expect(count(out, /initializeComponent:/g)).toBe(1);
    });

    test('bileşen etiketinde yalnız kullanıcının initializeComponent\'i varsa runover\'da tek değer olur', () => {
        const out = compile(`function A(){ return <Box initializeComponent={init} />; }`);
        expect(runoverOf(out, 'Box')).toMatch(/initializeComponent:\s*init\s*\}/);
    });

    test('üye ifadeli bileşen etiketi de aynı yolu izler', () => {
        const out = compile(`function A(){ return <Ns.Box initializeComponent={init} />; }`);
        expect(runoverOf(out, 'Ns.Box')).toMatch(/initializeComponent:\s*init/);
        expect(outerOf(out, 'Ns.Box')).not.toMatch(/initializeComponent/);
    });

    test('explain bileşen etiketindeki initializeComponent için runover notu verir', () => {
        const list = explain(`function A(){ return <Box initializeComponent={f} />; }`, 'IR.tsx');
        const rec = list.find(e => e.source.startsWith('initializeComponent='))!;
        expect(rec.site).toBe('component-event');
        expect(rec.lowered).toBe('initializeComponent: f');
        expect(rec.note).toContain('runover');
    });
});

describe('ref derleyici çıktısı', () => {
    test('bileşen etiketinde ref + x-ref tek listede dış prop nesnesine iner, runover içinde yer almaz', () => {
        const out = compile(`class A { two: any; view(){ return <Box x-ref={(c) => one(c)} ref={this.two} x:ref={(c) => three(c)} />; } }`);
        expect(outerOf(out, 'Box')).toMatch(/ref:\s*\[c => one\(c\),\s*sender => \{\s*this\.two = sender;[\s\S]*\},\s*c => three\(c\)\]/);
        expect(runoverOf(out, 'Box')).not.toMatch(/ref:/);
        expect(count(out, /ref:/g)).toBe(1);
    });

    test('düz etikette ref dış prop nesnesinde kalır', () => {
        const out = compile(`class A { input: any; view(){ return <input ref={this.input} x-ref={(c) => two(c)} />; } }`);
        expect(out).toMatch(/_mc\("input",\s*\{\s*ref:\s*\[sender => \{/);
        expect(out).not.toMatch(/runover/);
    });
});

describe('fonksiyon bileşeni etiketinde on<kanca> yazımları derlenir', () => {
    test.each([
        ['oninitializing', 'oninitializing'],
        ['onInitializing', 'onInitializing'],
        ['x-initializing', 'oninitializing'],
        ['x:initializing', 'oninitializing'],
        ['oninitialized', 'oninitialized'],
        ['onInitialized', 'onInitialized'],
        ['x-initialized', 'oninitialized'],
        ['x:initialized', 'oninitialized'],
    ])('%s', (attr, key) => {
        const src = `function Inner(props){ return <b />; } function A(){ return <Inner ${attr}={(s, e) => log(s, e)} title="t" />; }`;
        expect(() => compile(src)).not.toThrow();
        expect(() => new Compiler().explain(src, 'IR.tsx')).not.toThrow();
        const out = compile(src);
        expect(runoverOf(out, 'Inner')).toMatch(new RegExp(key + ':\\s*\\(s, e\\) => log\\(s, e\\)'));
    });

    test('aynı kancanın yazımları runover içinde birleşir', () => {
        const out = compile(`function A(){ return <Inner oninitializing={a} x-initializing={b} onInitialized={c} x:initialized={d} />; }`);
        const runover = runoverOf(out, 'Inner');
        expect(runover).toMatch(/oninitializing:\s*\[a,\s*b\]/);
        expect(runover).toMatch(/oninitialized:\s*\[c,\s*d\]/);
    });

    test('blok gövdeli işleyiciler ve üye ifadeleri derlenir', () => {
        const src = `class A { view(){ return <Inner oninitializing={(s) => { this.log.push(s); }} oninitialized={this.onInit} />; } }`;
        expect(() => compile(src)).not.toThrow();
        const runover = runoverOf(compile(src), 'Inner');
        expect(runover).toMatch(/oninitializing:\s*s => \{/);
        expect(runover).toMatch(/oninitialized:\s*this\.onInit/);
    });
});

describe('ref target kind is resolved at compile time where possible', () => {
    const src = `import { ext } from './o';
function declared(c: any) {}
const arrow = (c: any) => {};
let slot: any;
class A {
    field: any;
    empty = null;
    typedFn: (c: any) => void;
    arrowField = (c: any) => {};
    method(c: any) {}
    get g() { return 1; }
    view() {
        return <div>
            <i ref={this.field} /><i ref={this.empty} /><i ref={this.typedFn} /><i ref={this.arrowField} />
            <i ref={this.method} /><i ref={this.g} /><i ref={this.undeclared} />
            <i ref={declared} /><i ref={arrow} /><i ref={slot} /><i ref={ext} />
        </div>;
    }
}`;
    const lowered = (): string[] => (compile(src).match(/ref: sender => \{[^}]*\}/g) ?? []).map(s => s.replace(/\s+/g, ' '));

    test('declared fields and uninitialised variables are assigned', () => {
        const l = lowered();
        expect(l[0]).toContain('this.field = sender;');
        expect(l[1]).toContain('this.empty = sender;');
        expect(l[9]).toContain('slot = sender;');
        for (const i of [0, 1, 9]) expect(l[i]).not.toContain('typeof');
    });

    test('methods, function fields and local functions are called', () => {
        const l = lowered();
        expect(l[3]).toContain('this.arrowField(sender);');
        expect(l[4]).toContain('this.method(sender);');
        expect(l[7]).toContain('declared(sender);');
        expect(l[8]).toContain('arrow(sender);');
        for (const i of [3, 4, 7, 8]) expect(l[i]).not.toContain('typeof');
    });

    test('function-typed fields, getters, undeclared members and imports decide at runtime', () => {
        const l = lowered();
        expect(l[2]).toContain('if (typeof this.typedFn === "function") this.typedFn(sender);else this.typedFn = sender;');
        expect(l[5]).toContain('if (typeof this.g === "function")');
        expect(l[6]).toContain('if (typeof this.undeclared === "function")');
        expect(l[10]).toContain('if (typeof ext === "function") ext(sender);else ext = sender;');
    });

    test('a this member inside a nested regular function decides at runtime', () => {
        const out = compile(`class A { method(c: any) {} view() { const self = this; return [1].map(function () { return <i ref={this.method} />; }); } }`);
        expect(out).toContain('if (typeof this.method === "function")');
    });
});
