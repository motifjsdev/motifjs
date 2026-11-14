import Compiler from '../src/compiler';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

const child = (jsx: string): string => `function A(s, p){ return <section>${jsx}</section>; }`;
const flat = (code: string): string => code.replace(/\s+/g, ' ');
const branch = (inner: string): RegExp => new RegExp(`sender\\.bindings\\.ternary\\(\\(\\) => s\\.on, frame => \\{ frame\\.navigate\\(_mf\\(\\{ initializeComponent: sender => \\{ ${inner}`);
const method = (call: string): string => `sender\\.bindings\\.method\\(\\(\\) => \\{ try \\{ return ${call}; \\} catch \\(__e\\) \\{ _mr\\(__e\\); return undefined; \\} \\}\\);`;

describe('ternary dalı tek başına yazılmış gibi iner', () => {
    test.each([
        ['üye çağrısı', `{s.on ? p.notice('a') : null}`, `p\\.notice\\('a'\\)`],
        ['düz çağrı', `{s.on ? notice('a') : null}`, `notice\\('a'\\)`],
        ['isteğe bağlı çağrı', `{s.on ? p.notice?.('a') : null}`, `p\\.notice\\?\\.\\('a'\\)`],
    ])('%s dalı fragment içinde bindings.method olur', (_label, jsx, call) => {
        const out = compile(child(jsx));
        expect(flat(out)).toMatch(branch(method(call)));
        expect(out).toMatch(/import\s*\{[^}]*motifReport as _mr[^}]*\}\s*from\s*["']@motifx\/core["']/);
    });

    test('getter içindeki ve iç içe ternary\'deki çağrı dalı da aynı biçime iner', () => {
        expect(flat(compile(child(`{() => s.on ? p.notice('a') : null}`)))).toMatch(branch(method(`p\\.notice\\('a'\\)`)));
        const nested = flat(compile(child(`{s.on ? (s.alt ? p.notice('a') : <i>x</i>) : null}`)));
        expect(nested).toMatch(new RegExp(`sender\\.bindings\\.ternaryCall\\(\\(\\) => s\\.alt, \\(\\) => \\{ frame\\.navigate\\(_mf\\(\\{ initializeComponent: sender => \\{ ${method(`p\\.notice\\('a'\\)`)}`));
    });

    test('.map dalı fragment içinde bindings.list olur', () => {
        const out = flat(compile(child(`{s.on ? s.items.map(i => <li>{i}</li>) : null}`)));
        expect(out).toMatch(branch('sender\\.bindings\\.list\\(\\(\\) => \\{ if \\(s && s\\.items !== null && s\\.items !== undefined\\) \\{ return s\\.items; \\} return \\[\\]; \\}, i => _mc\\("li"'));
    });

    test('&& dalı fragment içinde bindings.when olur', () => {
        const out = flat(compile(child(`{s.on ? (s.alt && <i>x</i>) : null}`)));
        expect(out).toMatch(branch('sender\\.bindings\\.when\\('));
        expect(out).not.toMatch(/_mc\("text", \{ initializeComponent: sender => \{ sender\.bindings\.when/);
    });

    test.each([
        ['??', `{s.on ? (s.word ?? <i>x</i>) : null}`, '\\?\\?'],
        ['||', `{s.on ? (s.word || <i>x</i>) : null}`, '\\|\\|'],
    ])('%s dalı fragment içinde yedeği gösterebilen bindings.method olur', (_label, jsx, operator) => {
        const out = flat(compile(child(jsx)));
        expect(out).toMatch(branch(`sender\\.bindings\\.method\\(\\(\\) => \\{ let __l; try \\{ __l = s\\.word; \\} catch \\(__e\\) \\{ _mr\\(__e\\); __l = undefined; \\} return __l ${operator} _mc\\("i"`));
    });

    test.each([
        ['JSX', `{s.on ? () => <i>x</i> : null}`, 'sender\\.bindings\\.method\\(\\(\\) => _mc\\("i"'],
        ['çağrı', `{s.on ? () => p.notice() : null}`, 'sender\\.bindings\\.method\\(\\(\\) => p\\.notice\\(\\)\\);'],
        ['&& ile JSX', `{s.on ? () => s.alt && <i>x</i> : null}`, 'sender\\.bindings\\.method\\(\\(\\) => s\\.alt && _mc\\("i"'],
    ])('%s döndüren ok fonksiyonu dalı fragment içinde bindings.method olur', (_label, jsx, inner) => {
        expect(flat(compile(child(jsx)))).toMatch(branch(inner));
    });

    test('metin döndüren ok fonksiyonu dalı eskisi gibi metin bağı kalır', () => {
        const out = flat(compile(child(`{s.on ? () => s.text : null}`)));
        expect(out).toContain('sender.bindings.add("textContent", s, "text")');
        expect(out).not.toContain('sender.bindings.method');
    });

    test.each([
        ['dizi', `{s.on ? [<b>x</b>] : null}`, /frame\.navigate\(\[_mc\("b"/],
        ['new', `{s.on ? new Panel() : null}`, /frame\.navigate\(new Panel\(\)\);/],
    ])('%s dalı olduğu gibi yerleşir', (_label, jsx, expected) => {
        const out = flat(compile(child(jsx)));
        expect(out).toMatch(expected);
        expect(out).not.toMatch(/_mc\("text", \{ initializeComponent: sender => \{ sender\.bindings\.add\("textContent", \(\) => \{ let __r1; if \(\(__r1 = (new|\[)/);
    });

    test('bileşen prop\'undaki JSX dallı ternary\'de çağrı dalı da aynı biçime iner', () => {
        const out = flat(compile(`function A(p){ return <Pane toolbar={p.a ? <nav>x</nav> : p.fallback()} />; }`));
        expect(out).toMatch(new RegExp(`toolbar: \\(\\) => _mf\\(\\{ initializeComponent: sender => \\{ sender\\.bindings\\.ternary\\(\\(\\) => p\\.a, frame => \\{ frame\\.navigate\\(_mc\\("nav"`));
        expect(out).toMatch(new RegExp(`frame => \\{ frame\\.navigate\\(_mf\\(\\{ initializeComponent: sender => \\{ ${method(`p\\.fallback\\(\\)`)}`));
    });

    test.each([
        ['JSX dalı', `{s.on ? <i>x</i> : null}`],
        ['metin dalı', `{s.on ? 'a' : 'b'}`],
        ['şablon dizesi dalı', '{s.on ? `a${s.n}` : null}'],
        ['üye dalı', `{s.on ? s.text : null}`],
        ['değişken dalı', `{s.on ? label : null}`],
    ])('%s değişmez', (_label, jsx) => {
        const out = compile(child(jsx));
        expect(out).not.toMatch(/frame\.navigate\(_mf\(\{/);
        expect(out).not.toContain('sender.bindings.method');
    });
});

describe('switch dalı değişmez', () => {
    test('çağrı dalı eskisi gibi doğrudan navigate edilir', () => {
        const out = flat(compile(child(`{() => { switch (s.k) { case "a": return p.label(); case "b": return 'Metin'; } return null; }}`)));
        expect(out).toContain(`"a": frame => { frame.navigate(p.label() ?? _mf()); }`);
        expect(out).toContain(`"b": frame => { frame.navigate('Metin' ?? _mf()); }`);
        expect(out).not.toContain('sender.bindings.method');
    });
});
