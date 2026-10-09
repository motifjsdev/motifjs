import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = () => new Promise(r => setTimeout(r, 0));
const SVG = 'http://www.w3.org/2000/svg';

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'CF.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

const cls = (c: Component<any>) => (c.element as Element).getAttribute('class');

describe('static classes on a fresh element', () => {
    test('names are written in order, duplicates once', () => {
        const c = new Component<HTMLDivElement>('div', {});
        c.class.add('a b a c');
        expect(cls(c)).toBe('a b c');
        expect((c.element as HTMLElement).classList.length).toBe(3);
    });

    test('a second add appends to the first', () => {
        const c = new Component<HTMLDivElement>('div', {});
        c.class.add('a b');
        c.class.add('c a');
        expect(cls(c)).toBe('a b c');
    });

    test('an empty string leaves the element without a class attribute', () => {
        const c = new Component<HTMLDivElement>('div', {});
        c.class.add('   ');
        expect((c.element as HTMLElement).hasAttribute('class')).toBe(false);
        c.class.add('x');
        expect(cls(c)).toBe('x');
    });

    test('remove and has work after the first write', () => {
        const c = new Component<HTMLDivElement>('div', {});
        c.class.add('a b c');
        c.class.remove('b');
        expect(cls(c)).toBe('a c');
        expect(c.class.has('a')).toBe(true);
        expect(c.class.has('b')).toBe(false);
        c.class.remove('**');
        expect((c.element as HTMLElement).className).toBe('');
    });

    test('a static name shared with a reactive source stays until both let go', async () => {
        const st = reactive({ on: true });
        const c = new Component<HTMLDivElement>('div', {});
        c.build();
        c.class.add('a b');
        c.class.add(() => (st.on ? 'a d' : ''));
        await settle();
        expect(cls(c)).toBe('a b d');
        c.class.remove('a');
        expect(cls(c)).toBe('a b d');
        st.on = false;
        await settle();
        expect(cls(c)).toBe('b');
    });

    test('array and object forms still work after a string add', () => {
        const c = new Component<HTMLDivElement>('div', {});
        c.class.add('a');
        c.class.add(['b', 'c']);
        c.class.add({ d: true, e: false });
        expect(cls(c)).toBe('a b c d');
    });
});

describe('static classes on an element that already has classes', () => {
    test('a given element keeps its classes', () => {
        const el = document.createElement('section');
        el.className = 'x y';
        const c = new Component<HTMLElement>(el);
        c.class.add('a x');
        expect(cls(c)).toBe('x y a');
    });

    test('an element from onElementCreating keeps its classes', () => {
        const c = new Component<HTMLElement>('div', {
            onElementCreating: () => { const el = document.createElement('nav'); el.className = 'n'; return el; },
        } as any);
        c.class.add('a');
        expect(cls(c)).toBe('n a');
    });

    test('an empty class attribute is treated as present', () => {
        const el = document.createElement('p');
        el.setAttribute('class', '');
        const c = new Component<HTMLElement>(el);
        c.class.add('a b');
        expect(cls(c)).toBe('a b');
    });
});

describe('static classes on other element kinds', () => {
    test('an SVG element gets its classes', () => {
        const svg = document.createElementNS(SVG, 'svg');
        const c = new Component<any>(svg);
        c.class.add('icon big');
        expect(svg.getAttribute('class')).toBe('icon big');
        expect(svg.classList.contains('big')).toBe(true);
        c.class.remove('icon');
        expect(svg.getAttribute('class')).toBe('big');
    });

    test('a comment root ignores classes without throwing', () => {
        const c = new Component<any>(document.createComment(''));
        expect(() => c.class.add('a b')).not.toThrow();
    });
});

describe('static classes from JSX', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('class attributes on tags land as written', async () => {
        const A = evalJsx(`function A(){ return <ul class="list main"><li class="c c-id mono">1</li><li class="c">2</li><li>3</li></ul>; }`, 'A');
        const el = document.createElement('div');
        document.body.appendChild(el);
        const root = new Component(el);
        root.build();
        root.controls.add(A());
        await settle();
        expect(el.innerHTML).toBe('<ul class="list main"><li class="c c-id mono">1</li><li class="c">2</li><li>3</li></ul>');
    });

    test('a reactive class getter on a fresh element', async () => {
        const st = reactive({ active: false });
        const A = evalJsx(`function A(){ return <button class={() => \`btn \${st.active ? 'active' : ''}\`}>x</button>; }`, 'A', { st });
        const el = document.createElement('div');
        document.body.appendChild(el);
        const root = new Component(el);
        root.build();
        root.controls.add(A());
        await settle();
        const btn = el.querySelector('button')!;
        expect(btn.className).toBe('btn');
        st.active = true;
        await settle();
        expect(btn.className).toBe('btn active');
    });
});
