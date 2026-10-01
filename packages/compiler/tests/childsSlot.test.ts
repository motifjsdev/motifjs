import Compiler from '../src/compiler';

function compile(code: string, filename = 'test.tsx'): string {
    const compiler = new Compiler();
    const result = compiler.start(code, filename);
    expect(result).not.toBeNull();
    return result!.code!;
}

describe('childs içerik slotu', () => {
    test('{this.childs} HTML elemanı altında controls.add üretir, metin bağlaması ÜRETMEZ', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                view() { return <div class="body">{this.childs}</div>; }
            }
        `);
        expect(out).toContain('sender.controls.add');
        expect(out).toContain('this.childs');
        expect(out).not.toContain('textContent');
        expect(out).not.toContain('_mc("text"');
    });

    test('{props.childs} aynı şekilde slot olarak yerleşir', () => {
        const out = compile(`function Panel(props) { return <div>{props.childs}</div>; }`);
        expect(out).toContain('sender.controls.add');
        expect(out).toContain('props.childs');
        expect(out).not.toContain('textContent');
    });

    test('{this.props.childs} (iç içe member) slot olarak yerleşir', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                view() { return <div>{this.props.childs}</div>; }
            }
        `);
        expect(out).toContain('sender.controls.add');
        expect(out).toContain('this.props.childs');
        expect(out).not.toContain('textContent');
    });

    test('bare {childs} (destructure edilmiş) slot olarak yerleşir', () => {
        const out = compile(`function Panel({ childs }) { return <div>{childs}</div>; }`);
        expect(out).toContain('sender.controls.add');
        expect(out).not.toContain('textContent');
    });

    test('fragment içinde {this.childs} slot olarak yerleşir', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                view() { return <><span/>{this.childs}</>; }
            }
        `);
        expect(out).toContain('sender.controls.add');
        expect(out).toContain('this.childs');
        expect(out).not.toContain('textContent');
    });

    test('bileşen etiketi altında {this.childs} childs prop olarak aktarılır (forwarding)', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                view() { return <Card>{this.childs}</Card>; }
            }
        `);
        expect(out).toContain('childs: [this.childs]');
        expect(out).not.toContain('textContent');
        expect(out).not.toContain('sender.bindings');
    });

    test('{() => this.childs} getter biçimi bindings.method yolunda kalır', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                view() { return <div>{() => this.childs}</div>; }
            }
        `);
        expect(out).toContain('sender.bindings.method');
        expect(out).not.toContain('textContent');
    });

    test('{[compA, compB]} dizi çocuğu controls.add ile yerleşir', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                view() { return <div>{[a, b]}</div>; }
            }
        `);
        expect(out).toContain('sender.controls.add([a, b])');
    });

    describe('regresyon: metin bağlamaları bozulmadı', () => {
        test('{this.state.title} hâlâ textContent bağlaması', () => {
            const out = compile(`
                class Panel extends Component<HTMLDivElement> {
                    view() { return <div>{this.state.title}</div>; }
                }
            `);
            expect(out).toContain('sender.bindings.add("textContent", this.state, "title")');
        });

        test('childs ile başlayan farklı isimler etkilenmez (tam eşleşme)', () => {
            const out = compile(`
                class Panel extends Component<HTMLDivElement> {
                    view() { return <div>{this.childsCount}</div>; }
                }
            `);
            expect(out).toContain('sender.bindings.add("textContent", this, "childsCount")');
        });

        test('computed erişim x["childs"] slot sayılmaz', () => {
            const out = compile(`
                class Panel extends Component<HTMLDivElement> {
                    view() { return <div>{this["childs"]}</div>; }
                }
            `);
            expect(out).toContain('textContent');
        });
    });
});

describe('childs slotunun JSX konumu korunur', () => {
    test('kardeşler arasındaki slot, kaynak sırasıyla aynı yere eklenir', () => {
        const out = compile(`
            class Panel extends Component<HTMLDivElement> {
                view() {
                    return <div class="panel">
                        <b class="once">ONCE</b>
                        {this.childs}
                        <b class="sonra">SONRA</b>
                    </div>;
                }
            }
        `);

        const onceIdx = out.indexOf('"once"');
        const childsIdx = out.indexOf('this.childs');
        const sonraIdx = out.indexOf('"sonra"');

        expect(onceIdx).toBeGreaterThan(-1);
        expect(childsIdx).toBeGreaterThan(-1);
        expect(sonraIdx).toBeGreaterThan(-1);
        expect(onceIdx).toBeLessThan(childsIdx);
        expect(childsIdx).toBeLessThan(sonraIdx);
    });
});