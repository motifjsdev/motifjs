import Compiler from '../src/compiler';

function compile(code: string, filename = 'test.ts'): string {
    const compiler = new Compiler();
    const result = compiler.start(code, filename);
    expect(result).not.toBeNull();
    return result!.code!;
}

describe('elementTag enjeksiyonu', () => {
    test('constructor YOKKEN generic türden tag enjekte edilir', () => {
        const out = compile(`class Kart extends Component<HTMLDivElement> {}`);
        expect(out).toContain('elementTag');
        expect(out).toContain('"div"');
    });

    test('constructor VAR ama tagname vermiyorsa yine enjekte edilir', () => {
        const out = compile(`
            class Kart extends Component<HTMLButtonElement> {
                constructor(props) { super(void 0, props); }
            }
        `);
        expect(out).toContain('elementTag');
        expect(out).toContain('"button"');
    });

    test('farklı DOM tipleri doğru etikete çevrilir', () => {
        expect(compile(`class A extends Component<HTMLInputElement> {}`)).toContain('"input"');
        expect(compile(`class A extends Component<HTMLAnchorElement> {}`)).toContain('"a"');
        expect(compile(`class A extends Component<HTMLUListElement> {}`)).toContain('"ul"');
        expect(compile(`class A extends Component<HTMLTableRowElement> {}`)).toContain('"tr"');
        expect(compile(`class A extends Component<HTMLTextAreaElement> {}`)).toContain('"textarea"');
    });

    test('SVG tiplerinde namespace de enjekte edilir', () => {
        const out = compile(`class Ikon extends Component<SVGSVGElement> {}`);
        expect(out).toContain('elementTag');
        expect(out).toContain('"svg"');
        expect(out).toContain('elementNamespace');
        expect(out).toContain('http://www.w3.org/2000/svg');
    });

    test('kullanıcı elle static elementTag yazmışsa DOKUNULMAZ', () => {
        const out = compile(`
            class Kart extends Component<HTMLDivElement> {
                static elementTag = 'section';
            }
        `);
        expect(out).toContain("'section'");
        expect(out).not.toContain('"div"');
    });

    test('generic verilmemişse enjeksiyon yapılmaz (fragment davranışı korunur)', () => {
        const out = compile(`class Kart extends Component {}`);
        expect(out).not.toContain('elementTag');
    });

    test('fragment türlerinde (Comment) enjeksiyon yapılmaz', () => {
        const out = compile(`class Kart extends Component<Comment> {}`);
        expect(out).not.toContain('elementTag');
    });

    test('Component dışındaki sınıflara dokunulmaz', () => {
        const out = compile(`class Servis extends Base<HTMLDivElement> {}`);
        expect(out).not.toContain('elementTag');
    });

    test('props generic\'i ikinci sırada olsa da ilk argüman element türüdür', () => {
        const out = compile(`class Kart extends Component<HTMLSpanElement, { baslik: string }> {}`);
        expect(out).toContain('"span"');
    });
});