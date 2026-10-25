import * as motif from '@motifx/core';
import { Application, Component, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

function evalJsx(source: string, exportExpr: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'D.tsx');
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportExpr};`)(...values);
}

describe('the last writer of value, checked, selected and a style key owns it', () => {
    let app: Application;
    let host: HTMLElement;
    let root: Component;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = new Component('div');
        app.run(host, root);
    });

    afterEach(() => {
        app.dispose();
        host.remove();
    });

    const mount = async (source: string, s: any) => {
        const { A } = evalJsx(`function A(){ return ${source}; }`, '{ A }', { s });
        const a = A();
        root.controls.add(a);
        await tick();
        return a.element as HTMLElement;
    };

    test('a plain value written after a spread getter stays', async () => {
        const s = reactive({ v: 'g1' });
        const el = await mount('<input {...{ value: () => s.v }} value="plain" />', s) as HTMLInputElement;
        expect(el.value).toBe('plain');
        s.v = 'g2';
        await tick();
        expect(el.value).toBe('plain');
    });

    test('the directly written value wins whatever the source order, as for other attributes', async () => {
        const s = reactive({ v: 'g1' });
        const el = await mount('<input value="plain" {...{ value: () => s.v }} />', s) as HTMLInputElement;
        expect(el.value).toBe('plain');
        s.v = 'g2';
        await tick();
        expect(el.value).toBe('plain');
    });

    test('bindings.add: the later value binding replaces the earlier one', async () => {
        const s = reactive({ v: 'g1' });
        const first = new Component('input');
        first.bindings.add('value', () => s.v);
        first.bindings.add('value', 'plain');
        const second = new Component('input');
        second.bindings.add('value', 'plain');
        second.bindings.add('value', () => s.v);
        root.controls.add(first, second);
        await tick();
        s.v = 'g2';
        await tick();
        expect((first.element as HTMLInputElement).value).toBe('plain');
        expect((second.element as HTMLInputElement).value).toBe('g2');
        expect(first.bindings.items.filter(b => b.propertyName === 'value').length).toBe(1);
    });

    test('checked written after a spread getter stays', async () => {
        const s = reactive({ on: true });
        const el = await mount('<input type="checkbox" {...{ checked: () => s.on }} checked={true} />', s) as HTMLInputElement;
        expect(el.checked).toBe(true);
        s.on = false;
        await tick();
        expect(el.checked).toBe(true);
    });

    test('a style key written after a spread style getter stays, its other keys stay live', async () => {
        const s = reactive({ c: 'red', size: 10 });
        const el = await mount("<div {...{ style: () => ({ color: s.c, fontSize: s.size + 'px' }) }} style={{ color: 'blue' }} />", s);
        expect(el.style.color).toBe('blue');
        expect(el.style.fontSize).toBe('10px');
        s.c = 'green';
        s.size = 12;
        await tick();
        expect(el.style.color).toBe('blue');
        expect(el.style.fontSize).toBe('12px');
    });

    test('the directly written style key wins whatever the source order', async () => {
        const s = reactive({ c: 'red', size: 10 });
        const el = await mount("<div style={{ color: 'blue' }} {...{ style: () => ({ color: s.c, fontSize: s.size + 'px' }) }} />", s);
        expect(el.style.color).toBe('blue');
        s.c = 'green';
        s.size = 12;
        await tick();
        expect(el.style.color).toBe('blue');
        expect(el.style.fontSize).toBe('12px');
    });

    test('style(): a later getter owns every key it returns, a later object owns its keys', async () => {
        const s = reactive({ c: 'red' });
        const first = new Component('div');
        first.style({ color: 'blue', margin: '1px' });
        first.style(() => ({ color: s.c }));
        const second = new Component('div');
        second.style(() => ({ color: s.c }));
        second.style({ color: 'blue' });
        root.controls.add(first, second);
        await tick();
        s.c = 'green';
        await tick();
        expect((first.element as HTMLElement).style.color).toBe('green');
        expect((first.element as HTMLElement).style.margin).toBe('1px');
        expect((second.element as HTMLElement).style.color).toBe('blue');
    });

    test('a style string written after a style getter owns the whole attribute', async () => {
        const s = reactive({ c: 'red' });
        const el = await mount('<div {...{ style: () => ({ color: s.c, fontSize: "10px" }) }} style="color: blue" />', s);
        expect(el.style.color).toBe('blue');
        s.c = 'green';
        await tick();
        expect(el.style.color).toBe('blue');
        expect(el.style.fontSize).toBe('');
    });
});
