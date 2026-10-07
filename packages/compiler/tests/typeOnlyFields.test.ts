import Compiler from '../src/compiler';

function compile(code: string, filename = 'test.tsx'): string {
    const compiler = new Compiler();
    const result = compiler.start(code, filename);
    expect(result).not.toBeNull();
    return result!.code!;
}

describe('yalnız tip bildiren sınıf alanları', () => {
    test('declare alanı .tsx dosyasında derlenir ve kod üretmez', () => {
        const out = compile(`
            class Dialog extends Component<HTMLDivElement> {
                declare props: { title: string };
                view() { return <h1>{this.props.title}</h1>; }
            }
        `);
        expect(out).not.toMatch(/this\.props\s*=/);
        expect(out).not.toContain('constructor');
        expect(out).toContain('Dialog.elementTag = "div"');
    });

    test('declare alanı .ts dosyasında derlenir ve kod üretmez', () => {
        const out = compile(`
            class Store extends Base {
                declare items: string[];
                count() { return this.items.length; }
            }
        `, 'store.ts');
        expect(out).not.toMatch(/this\.items\s*=/);
        expect(out).not.toContain('constructor');
    });

    test('static ve readonly declare alanları kod üretmez', () => {
        const out = compile(`
            class Store extends Base {
                declare static kind: string;
                declare readonly id: number;
                run() { return 1; }
            }
        `, 'store.ts');
        expect(out).not.toMatch(/Store\.kind\s*=/);
        expect(out).not.toMatch(/this\.id\s*=/);
    });

    test('abstract alan kod üretmez', () => {
        const out = compile(`
            abstract class Shape extends Base {
                abstract title: string;
                run() { return this.title; }
            }
        `, 'shape.ts');
        expect(out).not.toMatch(/this\.title\s*=/);
        expect(out).not.toContain('constructor');
    });

    test('declare yanındaki gerçek alanlar ve childs slotu aynen derlenir', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                declare props: { title: string };
                count = 1;
                view() { return <div>{this.childs}</div>; }
            }
        `);
        expect(out).not.toMatch(/this\.props\s*=/);
        expect(out).toContain('this.count = 1');
        expect(out).toMatch(/_placesChilds = true/);
    });

    test('ilk değeri olmayan sıradan alan alan olarak kalır', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                title: string;
                view() { return <div />; }
            }
        `);
        expect(out).toContain('this.title = void 0');
    });
});
