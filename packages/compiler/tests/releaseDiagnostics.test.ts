import fs from 'fs';
import os from 'os';
import path from 'path';
import Compiler from '../src/compiler';
import { lintProject } from '../src/lint';

const view = (jsx: string) => `class A { x = 1; view(){ return ${jsx}; } }`;

function compileError(code: string): Error & { code?: string } {
    try {
        new Compiler().start(code, 'R.tsx');
    } catch (error) {
        return error as Error & { code?: string };
    }
    throw new Error('expected a compile error');
}

function warningsOf(code: string): { code: string; message: string }[] {
    const c = new Compiler();
    c.start(code, 'R.tsx');
    return c.diagnostics;
}

function evaluate(code: string, name: string): any {
    const body = code.split('\n').filter(line => !line.startsWith('import ')).join('\n');
    return new Function('_mv', `${body}\nreturn ${name};`)(() => { });
}

describe('MJX006: unsupported directives fail the build', () => {
    test.each(['x-reload', 'x-bind', 'x-effect', 'x-focus', 'x-interrupt', 'x-to', 'x-list', 'x-loop', 'x:focus', 'x:list'])('%s', (attr) => {
        const error = compileError(view(`<div ${attr}={this.x}></div>`));
        expect(error.code).toBe('MJX006');
        expect(error.message).toContain(`[motifjs] MJX006: Directive "${attr}" is not supported.`);
        expect(error.message).toContain('x-wait');
    });

    test('a valueless unsupported directive also fails', () => {
        expect(compileError(view('<ul x-list><li/></ul>')).code).toBe('MJX006');
    });

    test('supported directives and lifecycle hooks still compile', () => {
        const c = new Compiler();
        const out = c.start(view('<span x-text={() => this.x} x-html={() => "<b/>"} x-value={() => this.x} x-watch={() => this.x} x-display={this.x} x-wait={this.x} x-mounted={() => 1} x:built={() => 1} />'), 'R.tsx')!.code!;
        expect(out).toContain('sender.bindings.text(');
        expect(out).toContain('sender.bindings.html(');
        expect(out).toContain('sender.bindings.value(');
        expect(out).toContain('sender.bindings.watch(');
        expect(out).toContain('sender.bindings.display(');
        expect(out).toContain('sender.bindings.wait(');
        expect(c.diagnostics).toEqual([]);
    });
});

describe('MJX007: unknown x-* attribute', () => {
    test('warns and keeps passing it on as an on* prop', () => {
        const c = new Compiler();
        const out = c.start(view('<span x-checked={this.x} />'), 'R.tsx')!.code!;
        expect(out).toContain('onchecked: this.x');
        const warning = c.diagnostics.find(d => d.code === 'MJX007')!;
        expect(warning.message).toContain('Unknown directive "x-checked"');
        expect(warning.message).toContain('"onchecked"');
    });

    test.each(['x-mounted', 'x-built', 'x-config', 'x-creating', 'x-created', 'x-disposing', 'x-activated', 'x-initializecomponent'])('%s is a known hook and does not warn', (attr) => {
        expect(warningsOf(view(`<Box ${attr}={() => 1} />`)).map(d => d.code)).not.toContain('MJX007');
        expect(warningsOf(view(`<div ${attr}={() => 1} />`)).map(d => d.code)).not.toContain('MJX007');
    });
});

describe('coded compile errors', () => {
    test('MJX008: function expression as a child', () => {
        const error = compileError(view('<div>{function(){ return 1; }}</div>'));
        expect(error.code).toBe('MJX008');
        expect(error.message).toContain('use an arrow function');
    });

    test('MJX009: string event handler', () => {
        const error = compileError(view('<button onclick="go()" />'));
        expect(error.code).toBe('MJX009');
        expect(error.message).toContain('Event handler "onclick" must be a function');
    });

    test('MJX010: lifecycle hook that is not a function', () => {
        const error = compileError(view('<div onbuilt="x" />'));
        expect(error.code).toBe('MJX010');
        expect(error.message).toContain('Lifecycle hook "onbuilt"');
    });

    test('MJX011: directive value that cannot become a getter', () => {
        const error = compileError(view('<span x-text="plain" />'));
        expect(error.code).toBe('MJX011');
        expect(error.message).toContain('Directive "x-text" does not accept this value');
    });

    test('MJX012: object literal in x-wait', () => {
        const error = compileError(view('<span x-wait={{ a: 1 }} />'));
        expect(error.code).toBe('MJX012');
    });

    test('MJX014: unreadable tsconfig for motif-lint', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mjx014-'));
        const file = path.join(dir, 'tsconfig.json');
        fs.writeFileSync(file, '{ "compilerOptions": ');
        try {
            let caught: (Error & { code?: string }) | undefined;
            try { lintProject({ project: file }); } catch (error) { caught = error as Error & { code?: string }; }
            expect(caught?.code).toBe('MJX014');
            expect(caught?.message).toContain('[motifjs] MJX014: Cannot read');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('warning messages are English', () => {
    test('MJX001-MJX004 and MJX007 contain no Turkish text', () => {
        const all = [
            ...warningsOf(`function A(p){ return <div>{() => { const etiket = 1; return p.ok ? <A t={etiket}/> : <B/>; }}</div>; }`),
            ...warningsOf(`function A(){ return <Comp onChange={(v) => g(v)} />; }`),
            ...warningsOf(`function A(p){ return <ul>{p.a.map(x => <li>{x.t}</li>)}</ul>; }`),
            ...warningsOf(`class A { view(){ return <div>{() => this.state.rows.some(x => x.on)}</div>; } }`),
            ...warningsOf(view('<span x-foo={this.x} />')),
        ];
        expect(all.map(d => d.code).sort()).toEqual(['MJX001', 'MJX002', 'MJX003', 'MJX004', 'MJX007']);
        for (const d of all) expect(d.message).not.toMatch(/[çğışöüÇĞİŞÖÜ]/);
    });
});

describe('standard decorators', () => {
    test('a class decorator receives the class and a class context', () => {
        const code = new Compiler().start(`
            const seen: any[] = [];
            function Dec() { return (value: any, context: any) => { seen.push(value, context.kind); }; }
            class Svc {}
            @Dec() class B { constructor(public s: Svc) {} }
            const result = { B, seen };
        `, 'R.tsx')!.code!;
        const { B, seen } = evaluate(code, 'result');
        expect(seen).toEqual([B, 'class']);
        expect(new B('s').s).toBe('s');
    });

    test('no design metadata is emitted', () => {
        const code = new Compiler().start(`
            function Dec() { return (value: any) => { }; }
            class Svc {}
            @Dec() class B { constructor(public s: Svc) {} }
        `, 'R.tsx')!.code!;
        expect(code).not.toMatch(/Reflect\.metadata|design:paramtypes/);
    });

    test('parameter decorators do not compile', () => {
        expect(() => new Compiler().start(`
            function Inject(t: any) { return () => { }; }
            class Svc {}
            class B { constructor(@Inject(Svc) public s: Svc) {} }
        `, 'R.tsx')).toThrow(/decorate parameters/);
    });

    test('class fields are still assigned through inherited setters', () => {
        const code = new Compiler().start(`
            class Base { log: any[] = []; set isWait(v: boolean) { this.log.push(v); } get isWait() { return this.log[this.log.length - 1]; } }
            class Page extends Base { isWait = true; }
            const page = new Page();
            const result = { own: Object.prototype.hasOwnProperty.call(page, 'isWait'), log: page.log };
        `, 'R.tsx')!.code!;
        expect(evaluate(code, 'result')).toEqual({ own: false, log: [true] });
    });
});
