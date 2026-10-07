import Compiler from '../src/compiler';

function compile(code: string, filename = 'test.tsx'): string {
    const compiler = new Compiler();
    const result = compiler.start(code, filename);
    expect(result).not.toBeNull();
    return result!.code!;
}

const count = (out: string, pattern: RegExp) => (out.match(pattern) || []).length;

describe('sınıf ifadesi', () => {
    test('generic ile bildirilen kök eleman bir kez eklenir', () => {
        const out = compile(`const Panel = class extends Component<HTMLDivElement> { view() { return <div />; } };`);
        expect(count(out, /\.elementTag = "div"/g)).toBe(1);
    });

    test('adlı sınıf ifadesi derlenir', () => {
        const out = compile(`const Panel = class Inner extends Component<HTMLSpanElement> { run() { return 1; } };`);
        expect(count(out, /\.elementTag = "span"/g)).toBe(1);
    });

    test('SVG kökünün ad alanı bir kez eklenir', () => {
        const out = compile(`const Icon = class extends Component<SVGSVGElement> { run() { return 1; } };`);
        expect(count(out, /\.elementTag = "svg"/g)).toBe(1);
        expect(count(out, /\.elementNamespace = "http:\/\/www\.w3\.org\/2000\/svg"/g)).toBe(1);
    });

    test('childs slotu işareti bir kez eklenir', () => {
        const out = compile(`const Box = class extends Component { view() { return <div>{this.childs}</div>; } };`);
        expect(count(out, /\._placesChilds = true/g)).toBe(1);
    });

    test('mixin içindeki sınıf ifadesi derlenir', () => {
        const out = compile(`const withSlot = (Base) => class extends Base { view() { return <div>{this.childs}</div>; } };`);
        expect(count(out, /\._placesChilds = true/g)).toBe(1);
    });

    test('declare alanı sınıf ifadesinde de kod üretmez', () => {
        const out = compile(`const Dialog = class extends Component<HTMLDivElement> { declare props: { title: string }; view() { return <h1>{this.props.title}</h1>; } };`);
        expect(out).not.toMatch(/this\.props\s*=/);
        expect(count(out, /\.elementTag = "div"/g)).toBe(1);
    });
});
