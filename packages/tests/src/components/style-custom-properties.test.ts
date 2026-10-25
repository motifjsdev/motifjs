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

describe('CSS custom properties in style objects', () => {
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

    test('a style object writes custom properties next to ordinary ones', async () => {
        const box = new Component('div');
        box.style({ '--gap': '4px', height: '10px' });
        root.controls.add(box);
        await tick();
        const style = (box.element as HTMLElement).style;
        expect(style.getPropertyValue('--gap')).toBe('4px');
        expect(style.height).toBe('10px');
    });

    test('a style getter keeps custom properties live and removes the ones it stops returning', async () => {
        const s = reactive({ gap: 4, wide: true });
        const box = new Component('div');
        box.style(() => (s.wide ? { '--gap': `${s.gap}px`, '--wide': '1' } : { '--gap': `${s.gap}px` }));
        root.controls.add(box);
        await tick();
        const style = (box.element as HTMLElement).style;
        expect(style.getPropertyValue('--gap')).toBe('4px');
        expect(style.getPropertyValue('--wide')).toBe('1');

        s.gap = 8;
        s.wide = false;
        await tick();
        expect(style.getPropertyValue('--gap')).toBe('8px');
        expect(style.getPropertyValue('--wide')).toBe('');
    });

    test('a null custom property value removes it', async () => {
        const s = reactive({ accent: 'red' as string | null });
        const box = new Component('div');
        box.style(() => ({ '--accent': s.accent }));
        root.controls.add(box);
        await tick();
        expect((box.element as HTMLElement).style.getPropertyValue('--accent')).toBe('red');

        s.accent = null;
        await tick();
        expect((box.element as HTMLElement).style.getPropertyValue('--accent')).toBe('');
    });

    test('a JSX style object with a custom property', async () => {
        const { Bar } = evalJsx(`function Bar(){ return <div style={{ '--fill': '30%', width: '100px' }} />; }`, '{ Bar }');
        const bar = Bar();
        root.controls.add(bar);
        await tick();
        expect((bar.element as HTMLElement).style.getPropertyValue('--fill')).toBe('30%');
        expect((bar.element as HTMLElement).style.width).toBe('100px');
    });
});
