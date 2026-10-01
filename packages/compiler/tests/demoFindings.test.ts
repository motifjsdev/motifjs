import Compiler from '../src/compiler';

const compile = (code: string) => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

describe('C1: {a ?? b} / {a || b}', () => {
    test('?? metin: when üretmez, method + ?? üretir', () => {
        const out = compile(`function A(props){ return <span>{props.text ?? 'Loading'}</span>; }`);
        expect(out).not.toContain('bindings.when');
        expect(out).toContain('sender.bindings.method');
        expect(out).toMatch(/__l \?\? 'Loading'/);
    });
    test('|| metin: when üretmez', () => {
        const out = compile(`function A(props){ return <span>{props.text || 'x'}</span>; }`);
        expect(out).not.toContain('bindings.when');
        expect(out).toMatch(/__l \|\| 'x'/);
    });
    test('?? sağ taraf JSX: method içinde _mc', () => {
        const out = compile(`function A(props){ return <div>{props.item ?? <b>none</b>}</div>; }`);
        expect(out).not.toContain('bindings.when');
        expect(out).toMatch(/__l \?\? _mc\("b"/);
    });
    test('&& davranışı korunur (when)', () => {
        const out = compile(`function A(props){ return <div>{props.ok && <b>yes</b>}</div>; }`);
        expect(out).toContain('sender.bindings.when');
    });
    test('fragment kökünde de ?? when üretmez', () => {
        const out = compile(`function A(props){ return <>{props.text ?? 'L'}</>; }`);
        expect(out).not.toContain('bindings.when');
        expect(out).toContain('sender.bindings.method');
    });
    test('ternary dalında ?? metin bağı (when yok)', () => {
        const out = compile(`function A(props){ return <span>{props.a ? (props.b ?? 'z') : 'q'}</span>; }`);
        expect(out).not.toContain('bindings.when');
        expect(out).toMatch(/__l \?\? 'z'/);
    });
});

describe('C2: {this.metod(x)} üye çağrısı', () => {
    test('textContent bağı değil, bindings.method üretir', () => {
        const out = compile(`class A extends Component { view(){ return <ul>{this.navItem(this.x)}</ul>; } }`);
        expect(out).not.toContain('textContent');
        expect(out).toContain('sender.bindings.method');
        expect(out).toContain('this.navItem(this.x)');
    });
    test('tanımlayıcı çağrısı eskisi gibi controls.add ile yerleşir', () => {
        const out = compile(`function A(props){ return <ul>{glyph(props.x)}</ul>; }`);
        expect(out).toContain('sender.controls.add');
        expect(out).toContain('glyph(props.x)');
    });
    test('.map hâlâ bindings.list', () => {
        const out = compile(`function A(props){ return <ul>{props.items.map(e => <li/>)}</ul>; }`);
        expect(out).toContain('sender.bindings.list');
    });
});

describe('C3: dizi literali .map', () => {
    test('[X].map → list(() => [X])', () => {
        const out = compile(`function A(){ return <ul>{[ITEM].map(e => <li>{e.name}</li>)}</ul>; }`);
        expect(out).toMatch(/bindings\.list\(\(\) => \[ITEM\]/);
    });
    test('ITEMS.map guard zinciri korunur', () => {
        const out = compile(`function A(){ return <ul>{ITEMS.map(e => <li/>)}</ul>; }`);
        expect(out).toContain('ITEMS !== null');
    });
    test('koşullu kaynak: (a ? x : y).map', () => {
        const out = compile(`function A(p){ return <ul>{(p.a ? X : Y).map(e => <li/>)}</ul>; }`);
        expect(out).toMatch(/bindings\.list\(\(\) => p\.a \? X : Y/);
    });
});

describe('C4: SVG namespace', () => {
    const count = (s: string) => (s.match(/__isSvgElement: true/g) || []).length;
    test('ayrı fonksiyondan dönen <g><path/></g> SVG olarak işaretlenir', () => {
        const out = compile(`function Icon(){ return <g><path d="M0"/></g>; }`);
        expect(count(out)).toBe(2);
    });
    test('<svg> altında derin iç içe her element işaretlenir', () => {
        const out = compile(`function Icon(){ return <svg><g><path d="M0"/><circle r="1"/></g></svg>; }`);
        expect(count(out)).toBe(4);
    });
    test('HTML <a>/<title> işaretlenmez, SVG içindeki <a>/<title> işaretlenir', () => {
        const html = compile(`function A(){ return <div><a href="#">x</a><title>t</title></div>; }`);
        expect(count(html)).toBe(0);
        const svg = compile(`function A(){ return <svg><a href="#"><title>t</title></a></svg>; }`);
        expect(count(svg)).toBe(3);
    });
    test('svg kardeşi olan HTML elementi işaretlenmez (derinlik sıfırlanır)', () => {
        const out = compile(`function A(){ return <div><svg><path/></svg><a href="#">x</a></div>; }`);
        expect(count(out)).toBe(2);
    });
    test('svg içinde koşullu JSX dalı da işaretlenir', () => {
        const out = compile(`function A(p){ return <svg>{p.on && <g/>}</svg>; }`);
        expect(count(out)).toBe(2);
    });
});