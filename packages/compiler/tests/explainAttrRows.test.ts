import Compiler from '../src/compiler';

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

function explainWithCode(jsx: string) {
    const c = new Compiler();
    const src = `class A { x = 1; k = 'b'; c = 'red'; s = {}; ok = true; view(){ const fn = () => 1; return ${jsx}; } }`;
    const result = c.explain(src, 'E.tsx');
    return { rows: c.explanations.filter(e => e.site === 'attr'), code: flat(result!.code!) };
}

describe('explain: every attr row shows the call that is really generated', () => {
    test.each([
        '<div title={`a ${this.x}`} />',
        '<div title={`t`} />',
        '<div class={`a ${this.k}`} />',
        '<div style={`color: ${this.c}`} />',
        '<div x-style={`color: ${this.c}`} />',
        '<input value={this.x} />',
        '<input checked={this.ok} />',
        '<option selected={this.ok} />',
        '<input value={`a ${this.x}`} />',
        '<div title={this.x} />',
        '<div class="a" />',
        '<div style={{ color: this.c }} />',
        '<div hidden />',
        '<div data-n={fn} />',
        '<div class={["a", this.k]} />',
        '<div class={{ on: this.x }} />',
        '<div title={this.ok ? "a" : "b"} />',
        '<div title={fn(this.x)} />',
        '<div hidden={!this.x} style={this.s} />',
    ])('%s', (jsx) => {
        const { rows, code } = explainWithCode(jsx);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            for (const call of row.lowered.split('; ')) expect(code).toContain(flat(call));
        }
    });

    test('a template literal with expressions is a live getter on title, class and style', () => {
        for (const jsx of ['<div title={`a ${this.x}`} />', '<div class={`a ${this.k}`} />', '<div style={`color: ${this.c}`} />']) {
            const [row] = explainWithCode(jsx).rows;
            expect(row.shape).toBe('attr.template');
            expect(row.reactive).toBe('live');
        }
        const [title] = explainWithCode('<div title={`a ${this.x}`} />').rows;
        expect(title.lowered).toBe('sender.attr.add({ "title": () => `a ${this.x}` })');
        const [cls] = explainWithCode('<div class={`a ${this.k}`} />').rows;
        expect(cls.lowered).toBe('sender.class.add([() => `a ${this.k}`])');
    });

    test('a template literal without expressions is a static string', () => {
        const [row] = explainWithCode('<div title={`t`} />').rows;
        expect(row.lowered).toBe('sender.attr.add({ "title": "t" })');
        expect(row.reactive).toBe('static');
    });

    test('value, checked and selected show the bindings.add call', () => {
        const [row] = explainWithCode('<input value={this.x} />').rows;
        expect(row.lowered).toMatch(/^sender\.bindings\.add\("value", \(\) => /);
        expect(row.reactive).toBe('live');
        const [tpl] = explainWithCode('<input value={`a ${this.x}`} />').rows;
        expect(tpl.lowered).toBe('sender.bindings.add("value", () => `a ${this.x}`)');
        expect(tpl.reactive).toBe('live');
    });

    test('x-style is recorded from the generated call', () => {
        const [row] = explainWithCode('<div x-style={`color: ${this.c}`} />').rows;
        expect(row.shape).toBe('style');
        expect(row.lowered).toBe('sender.style(() => `color: ${this.c}`)');
        expect(row.reactive).toBe('live');
    });

    test('a flag attribute is recorded from the generated call', () => {
        const [row] = explainWithCode('<div hidden />').rows;
        expect(row.shape).toBe('attr.flag');
        expect(row.lowered).toBe('sender.attr.add({ "hidden": true })');
    });
});
