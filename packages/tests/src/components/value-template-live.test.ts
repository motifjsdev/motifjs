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

describe('a template string in value, checked and selected is live like in other attributes', () => {
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

    test('value follows the values read in the template', async () => {
        const s = reactive({ name: 'Ada', count: 1 });
        const { Field } = evalJsx(`function Field(){ return <input value={\`\${s.name} (\${s.count})\`} />; }`, '{ Field }', { s });
        const field = Field();
        root.controls.add(field);
        await tick();
        expect((field.element as HTMLInputElement).value).toBe('Ada (1)');

        s.name = 'Lin';
        s.count = 2;
        await tick();
        expect((field.element as HTMLInputElement).value).toBe('Lin (2)');
    });

    test('a template without expressions is written once as a plain string', async () => {
        const { Field } = evalJsx('function Field(){ return <input value={`fixed`} />; }', '{ Field }');
        const field = Field();
        root.controls.add(field);
        await tick();
        expect((field.element as HTMLInputElement).value).toBe('fixed');
    });

    test('a textarea value follows its template', async () => {
        const s = reactive({ body: 'one' });
        const { Body } = evalJsx(`function Body(){ return <textarea value={\`# \${s.body}\`} />; }`, '{ Body }', { s });
        const body = Body();
        root.controls.add(body);
        await tick();
        expect((body.element as HTMLTextAreaElement).value).toBe('# one');

        s.body = 'two';
        await tick();
        expect((body.element as HTMLTextAreaElement).value).toBe('# two');
    });
});
