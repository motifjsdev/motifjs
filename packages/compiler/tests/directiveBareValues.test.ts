import Compiler from '../src/compiler';

function compile(code: string): string {
    const out = new Compiler().start(code, 'Directives.tsx');
    expect(out).not.toBeNull();
    return out!.code!;
}

const view = (attr: string) => `function A(){ return <section><p ${attr}>x</p></section>; }`;

describe('x-wait / x-display: her değer çalışma anına getter olarak gider', () => {
    test.each([
        ['x-display', '!s.a', /sender\.bindings\.display\(\(\)\s*=>\s*!s\.a\)/],
        ['x-wait', '!s.a', /sender\.bindings\.wait\(\(\)\s*=>\s*!s\.a\)/],
        ['x-display', '!!s.a', /sender\.bindings\.display\(\(\)\s*=>\s*!!s\.a\)/],
        ['x-display', 'false', /sender\.bindings\.display\(\(\)\s*=>\s*false\)/],
        ['x-display', 'true', /sender\.bindings\.display\(\(\)\s*=>\s*true\)/],
        ['x-wait', 'true', /sender\.bindings\.wait\(\(\)\s*=>\s*true\)/],
        ['x-display', 's.box?.open', /sender\.bindings\.display\(\(\)\s*=>\s*typeof s\.box\?\.open === "function" \? s\.box\?\.open\?\.\(\) : s\.box\?\.open\)/],
        ['x-wait', 's.job?.running', /sender\.bindings\.wait\(\(\)\s*=>\s*typeof s\.job\?\.running === "function" \? s\.job\?\.running\?\.\(\) : s\.job\?\.running\)/],
        ['x-wait', 's.job?.isRunning()', /sender\.bindings\.wait\(\(\)\s*=>\s*\{\s*const __ro = s\.job\?\.isRunning\(\);\s*return typeof __ro === "function" \? __ro\(\) : __ro;\s*\}\)/],
        ['x-wait', 's.a ? true : false', /sender\.bindings\.wait\(\(\)\s*=>\s*s\.a\s*\?\s*true\s*:\s*false\)/],
    ])('%s={%s}', (dir, value, shape) => {
        const out = compile(view(`${dir}={${value}}`));
        expect(out).toMatch(shape);
        expect(out).not.toMatch(new RegExp(`sender\\.bindings\\.(wait|display)\\(${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
    });

    test('ok fonksiyonu ikinci kez sarılmaz', () => {
        const out = compile(view('x-display={() => !s.a}'));
        expect(out).toMatch(/sender\.bindings\.display\(\(\)\s*=>\s*!s\.a\)/);
        expect(out).not.toMatch(/\(\)\s*=>\s*\(\)\s*=>/);
    });

    test('function ifadesi olduğu gibi kalır', () => {
        const out = compile(view('x-wait={function () { return s.a; }}'));
        expect(out).toMatch(/sender\.bindings\.wait\(function \(\)\s*\{/);
    });

    test('üye başvurusu korumalı getter olarak kalır ve fonksiyonsa çağrılır', () => {
        const out = compile(`class B { ok(){ return true; } view(){ return <div x-wait={this.ok} />; } }`);
        expect(out).toMatch(/typeof this\.ok === "function" \? this\.ok\(\) : this\.ok/);
    });

    test('bileşen etiketinde runover.preconfig içinde de getter', () => {
        const out = compile(`function Card(){ return <article>c</article>; } function A(){ return <section><Card x-display={!s.a} x-wait={false} /></section>; }`);
        expect(out).toMatch(/preconfig:\s*sender\s*=>\s*\{[\s\S]*sender\.bindings\.display\(\(\)\s*=>\s*!s\.a\)/);
        expect(out).toMatch(/sender\.bindings\.wait\(\(\)\s*=>\s*false\)/);
    });

    test('nesne değişmezi hâlâ MJX012', () => {
        expect(() => compile(view('x-wait={{ a: 1 }}'))).toThrow(/MJX012/);
    });
});
