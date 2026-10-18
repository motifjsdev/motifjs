import Compiler from '../src/compiler';

function compile(code: string): string {
    const out = new Compiler().start(code, 'Slots.tsx');
    expect(out).not.toBeNull();
    return out!.code!;
}

function page(child: string): string {
    return `
        class Panel extends Component<HTMLDivElement> {
            view() { return <div><span class="slot">{this.childs}</span></div>; }
        }
        class Page extends Component<HTMLElement> {
            badge() { return this.state.flag ? <b>R</b> : "yok"; }
            view() { return <main><Panel>${child}</Panel></main>; }
        }
    `;
}

const count = (s: string, needle: string) => s.split(needle).length - 1;

/** Bileşen etiketinin `childs` dizisindeki sarmalayıcı: `_mc({ initializeComponent: sender => { sender.bindings.X(…) } })`. */
const slotWrapper = (binding: string) => new RegExp(`childs:\\s*\\[\\s*_mc\\(\\{\\s*initializeComponent:\\s*sender\\s*=>\\s*\\{\\s*sender\\.bindings\\.${binding}\\(`);

describe('bileşen etiketinin çocuğu olan bağ ifadeleri childs yuvasına gider', () => {
    test.each([
        ['ternary', '{this.state.flag ? <b>A</b> : <i>B</i>}', 'ternary'],
        ['&&', '{this.state.flag && <b>A</b>}', 'when'],
        ['??', '{this.state.title ?? <i>Adsiz</i>}', 'method'],
        ['||', '{this.state.title || <i>Adsiz</i>}', 'method'],
        ['üye çağrısı', '{this.badge()}', 'method'],
        ['ok fonksiyonu', '{() => this.state.title}', 'method'],
        ['şablon dizesi', '{`baslik: ${this.state.title}`}', 'method'],
    ])('%s: bir kez, yuva sarmalayıcısında, runover boş', (_name, child, binding) => {
        const out = compile(page(child));
        expect(out).toMatch(slotWrapper(binding));
        expect(count(out, `sender.bindings.${binding}(`)).toBe(1);
        expect(out).toMatch(/runover:\s*\{\s*\}/);
        expect(out).not.toMatch(/runover:\s*\{\s*initializeComponent/);
    });

    test('&& ham ifade olarak childs dizisine yazılmaz (false metni üretmez)', () => {
        const out = compile(page('{this.state.flag && <b>A</b>}'));
        expect(out).not.toMatch(/childs:\s*\[\s*this\.state\.flag\s*&&/);
    });

    test('?? ham ifade olarak childs dizisine yazılmaz', () => {
        const out = compile(page('{this.state.title ?? <i>Adsiz</i>}'));
        expect(out).not.toMatch(/childs:\s*\[\s*this\.state\.title\s*\?\?/);
    });

    test('ok fonksiyonu childs dizisine çıplak girmez', () => {
        const out = compile(page('{() => this.state.title}'));
        expect(out).not.toMatch(/childs:\s*\[\s*\(\)\s*=>/);
    });

    test('hazır bileşen ve dizi çocukları olduğu gibi childs dizisinde kalır', () => {
        const out = compile(page('<p>x</p>{this.childs}{[this.a, this.b]}'));
        expect(out).toMatch(/childs:\s*\[\s*_mc\("p"/);
        expect(out).toMatch(/this\.childs,\s*\[this\.a,\s*this\.b\]\s*\]/);
        expect(out).toMatch(/runover:\s*\{\s*\}/);
    });

    test('bağ ifadeleri ile hazır bileşenler aynı dizide sırayı korur', () => {
        const out = compile(page('<p>x</p>{this.state.flag && <b>A</b>}<q>y</q>'));
        const p = out.indexOf('_mc("p"');
        const when = out.indexOf('sender.bindings.when(');
        const q = out.indexOf('_mc("q"');
        expect(p).toBeGreaterThan(-1);
        expect(when).toBeGreaterThan(p);
        expect(q).toBeGreaterThan(when);
    });

    test('düz HTML etiketinin çocukları değişmez: bağ initializeComponent içinde kurulur', () => {
        const out = compile(`
            class Page extends Component<HTMLElement> {
                view() { return <main>{this.state.flag ? <b>A</b> : <i>B</i>}{this.state.ok && <u/>}</main>; }
            }
        `);
        expect(out).toMatch(/initializeComponent:\s*sender\s*=>\s*\{\s*sender\.bindings\.ternary\(/);
        expect(count(out, 'sender.bindings.ternary(')).toBe(1);
        expect(count(out, 'sender.bindings.when(')).toBe(1);
        expect(out).not.toContain('childs');
    });

    test('{items.map(…)} bileşen etiketinde eskisi gibi liste sarmalayıcısıyla gider', () => {
        const out = compile(page('{this.state.items.map(i => <li>{i}</li>)}'));
        expect(out).toMatch(slotWrapper('list'));
        expect(count(out, 'sender.bindings.list(')).toBe(1);
    });
});
