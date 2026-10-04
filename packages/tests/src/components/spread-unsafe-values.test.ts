/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise(r => setTimeout(r, 0));

function evalJsx(source: string, exportName: string) {
    const out = new CompilerCtor().start(source, 'SU.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', 'Component', 'reactive'];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive];
    const fn = new Function(...names, `${code}\nreturn ${exportName};`);
    return fn(...values);
}

function mount(child: any): { host: HTMLElement; root: Component } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

const Anchor = () => evalJsx(`function A(p){ return <a {...p}>link</a>; }`, 'A');
const Box = () => evalJsx(`function A(p){ return <div {...p} />; }`, 'A');
const Frame = () => evalJsx(`function A(p){ return <iframe {...p} />; }`, 'A');

describe('spread on a DOM tag: innerHTML, srcdoc and javascript: URLs', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        (globalThis as any).__MOTIF_DEV__ = true;
        warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        warn.mockRestore();
        delete (globalThis as any).__MOTIF_DEV__;
        document.body.innerHTML = '';
    });

    const warned = (code: string) => warn.mock.calls.some(c => String(c[0]).includes(code));

    test('innerHTML in a spread object is not written', async () => {
        const { host, root } = mount(Box()({ innerHTML: '<img src=x onerror="window.__pwned=1">', id: 'b' }));
        const el = host.firstElementChild as HTMLElement;
        expect(el.id).toBe('b');
        expect(el.innerHTML).toBe('');
        expect(el.hasAttribute('innerHTML')).toBe(false);
        expect(warned('MJX124')).toBe(true);
        await root.dispose();
    });

    test('an innerHTML getter in a spread object is not written', async () => {
        const state = reactive({ html: '<b>x</b>' });
        const { host, root } = mount(Box()({ innerHTML: () => state.html }));
        const el = host.firstElementChild as HTMLElement;
        expect(el.innerHTML).toBe('');
        state.html = '<i>y</i>';
        await tick();
        expect(el.innerHTML).toBe('');
        await root.dispose();
    });

    test.each(['srcdoc', 'srcDoc', 'SRCDOC'])('%s in a spread object is not written', async (key) => {
        const { host, root } = mount(Frame()({ [key]: '<script>parent.__pwned=1</script>', title: 'f' }));
        const el = host.firstElementChild as HTMLIFrameElement;
        expect(el.hasAttribute('srcdoc')).toBe(false);
        expect(el.getAttribute('title')).toBe('f');
        expect(warn.mock.calls.some(c => String(c[0]).includes('MJX124') && String(c[0]).includes(key))).toBe(true);
        await root.dispose();
    });

    test('a srcdoc getter in a spread object is not written', async () => {
        const state = reactive({ html: '<b>x</b>' });
        const { host, root } = mount(Frame()({ srcdoc: () => state.html }));
        const el = host.firstElementChild as HTMLIFrameElement;
        expect(el.hasAttribute('srcdoc')).toBe(false);
        state.html = '<i>y</i>';
        await tick();
        expect(el.hasAttribute('srcdoc')).toBe(false);
        await root.dispose();
    });

    test('srcdoc written on the tag is kept', async () => {
        const F = evalJsx(`function F(){ return <iframe srcdoc="<p>ok</p>" />; }`, 'F');
        const { host, root } = mount(F());
        expect(host.firstElementChild!.getAttribute('srcdoc')).toBe('<p>ok</p>');
        expect(warned('MJX124')).toBe(false);
        await root.dispose();
    });

    test.each([
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        '  javascript:alert(1)',
        '\u0001javascript:alert(1)',
        'java\tscript:alert(1)',
        'java\nscript:alert(1)',
    ])('href %j is dropped', async (href) => {
        const { host, root } = mount(Anchor()({ href, title: 't' }));
        const el = host.firstElementChild as HTMLAnchorElement;
        expect(el.hasAttribute('href')).toBe(false);
        expect(el.getAttribute('title')).toBe('t');
        expect(warned('MJX125')).toBe(true);
        await root.dispose();
    });

    test.each(['https://example.com/', '/path?q=1', '#top', 'mailto:a@b.c', 'notjavascript:x'])('href %j is kept', async (href) => {
        const { host, root } = mount(Anchor()({ href }));
        const el = host.firstElementChild as HTMLAnchorElement;
        expect(el.getAttribute('href')).toBe(href);
        expect(warned('MJX125')).toBe(false);
        await root.dispose();
    });

    test('src, action, formaction and xlink:href are guarded, other keys are not', async () => {
        const { host, root } = mount(Box()({
            src: 'javascript:a()',
            action: 'javascript:a()',
            formaction: 'javascript:a()',
            'xlink:href': 'javascript:a()',
            title: 'javascript: tips',
            'data-url': 'javascript:a()',
        }));
        const el = host.firstElementChild as HTMLElement;
        expect(el.hasAttribute('src')).toBe(false);
        expect(el.hasAttribute('action')).toBe(false);
        expect(el.hasAttribute('formaction')).toBe(false);
        expect(el.hasAttribute('xlink:href')).toBe(false);
        expect(el.getAttribute('title')).toBe('javascript: tips');
        expect(el.getAttribute('data-url')).toBe('javascript:a()');
        await root.dispose();
    });

    test('an href getter is checked on every change', async () => {
        const state = reactive({ url: '/a' });
        const { host, root } = mount(Anchor()({ href: () => state.url }));
        const el = host.firstElementChild as HTMLAnchorElement;
        expect(el.getAttribute('href')).toBe('/a');

        state.url = 'javascript:alert(1)';
        await tick();
        expect(el.hasAttribute('href')).toBe(false);

        state.url = '/b';
        await tick();
        expect(el.getAttribute('href')).toBe('/b');
        await root.dispose();
    });

    test('a URL object holding javascript: is dropped', async () => {
        const { host, root } = mount(Anchor()({ href: new URL('javascript:alert(1)') }));
        const el = host.firstElementChild as HTMLAnchorElement;
        expect(el.hasAttribute('href')).toBe(false);
        await root.dispose();
    });

    test('an attribute written on the tag is not affected', async () => {
        const A = evalJsx(`function A(){ return <a href="javascript:void 0" x-html={() => '<b>x</b>'}></a>; }`, 'A');
        const { host, root } = mount(A());
        const el = host.firstElementChild as HTMLAnchorElement;
        expect(el.getAttribute('href')).toBe('javascript:void 0');
        expect(el.innerHTML).toBe('<b>x</b>');
        await root.dispose();
    });

    test('no warning outside dev mode, the value is still dropped', async () => {
        delete (globalThis as any).__MOTIF_DEV__;
        const { host, root } = mount(Anchor()({ href: 'javascript:alert(1)', innerHTML: '<b>x</b>' }));
        const el = host.firstElementChild as HTMLAnchorElement;
        expect(el.hasAttribute('href')).toBe(false);
        expect(el.textContent).toBe('link');
        expect(warned('MJX124')).toBe(false);
        expect(warned('MJX125')).toBe(false);
        await root.dispose();
    });
});
