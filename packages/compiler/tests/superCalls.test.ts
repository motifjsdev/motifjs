import * as path from 'node:path';
import * as coreModule from '../../motifjs/dist/index.cjs';
import { analyzeModule, createComponentResolver, CORE_COMPONENT_CLASSES, mayHaveSuperOverrides, parseModule } from '../src/superCalls';
import vitePlugin, { checkSuperCalls, shouldCheckSuperCalls } from '../src/vitePlugin';

const findings = (code: string, file = 'Card.tsx') => {
    const ast = parseModule(code, file);
    expect(ast).not.toBeNull();
    return analyzeModule(ast!).findings;
};

const body = (method: string, header = 'build(b?: boolean)') =>
    `import { Component } from '@motifx/core';\nclass Card extends Component {\n  ${header} {\n${method}\n  }\n}`;

const verdict = (method: string, header?: string) => {
    const f = findings(body(method, header));
    return f.length === 0 ? 'ok' : f[0].kind;
};

describe('every normal path reaches super', () => {
    test.each([
        ['a straight call', 'super.build(b);', 'ok'],
        ['work before and after', 'this.a = 1; super.build(b); this.b = 2;', 'ok'],
        ['both branches', 'if (x) { super.build(b); } else { y(); super.build(b); }', 'ok'],
        ['an awaited call', 'await super.build(b);', 'ok'],
        ['call through .call', 'super.build.call(this, b);', 'ok'],
        ['in the test of an if', 'if (super.build(b)) { y(); }', 'ok'],
        ['before a return', 'super.build(b); if (x) return; y();', 'ok'],
        ['in finally', 'try { if (x) return; y(); } finally { super.build(b); }', 'ok'],
        ['in try and catch', 'try { super.build(b); } catch (e) { super.build(b); }', 'ok'],
        ['every switch case with default', 'switch (k) { case 1: super.build(b); break; default: super.build(b); }', 'ok'],
        ['do-while body', 'do { super.build(b); } while (x);', 'ok'],
        ['a path that throws', 'if (!x) throw new Error("no"); super.build(b);', 'ok'],
        ['both arms of a ternary', 'x ? super.build(b) : super.build(!b);', 'ok'],
        ['the left side of &&', 'super.build(b) && y();', 'ok'],
    ])('%s', (_label, method, expected) => {
        expect(verdict(method)).toBe(expected);
    });

    test.each([
        ['an early return', 'if (x) return; super.build(b);'],
        ['only one branch', 'if (x) super.build(b);'],
        ['the right side of &&', 'x && super.build(b);'],
        ['one arm of a ternary', 'x ? super.build(b) : null;'],
        ['a loop body', 'for (const i of list) super.build(b);'],
        ['a while body', 'while (x) { super.build(b); x = false; }'],
        ['a catch that returns', 'try { super.build(b); } catch { return; }'],
        ['a switch without default', 'switch (k) { case 1: super.build(b); break; }'],
        ['a case that breaks first', 'switch (k) { case 1: break; default: super.build(b); }'],
        ['a callback', 'setTimeout(() => super.build(b));'],
        ['a returned value before super', 'if (x) { return y(); } super.build(b);'],
        ['optional call argument', 'maybe?.(super.build(b));'],
    ])('%s is reported on a path', (_label, method) => {
        expect(verdict(method)).toBe('path');
    });

    test('no super at all', () => {
        expect(verdict('this.ready = true;')).toBe('never');
        expect(verdict('')).toBe('never');
    });

    test('a super call to another member does not count', () => {
        expect(verdict('super.dispose();')).toBe('never');
    });
});

describe('guards where the base method would do nothing', () => {
    test.each([
        ['if (this.isBuilt) return; super.build(b);', 'ok'],
        ['if (this.isBuilt || this.isDisposed) return; super.build(b);', 'ok'],
        ['if (this.isWait) { return; } super.build(b);', 'ok'],
        ['if (this.ready) return; super.build(b);', 'path'],
        ['if (this.isBuilt) { log(); return; } super.build(b);', 'path'],
    ])('build: %s', (method, expected) => {
        expect(verdict(method)).toBe(expected);
    });

    test('dispose accepts only isDisposed', () => {
        expect(verdict('if (this.isDisposed) return; await super.dispose(o);', 'async dispose(o?: any)')).toBe('ok');
        expect(verdict('if (this.isBuilt) return; await super.dispose(o);', 'async dispose(o?: any)')).toBe('path');
    });
});

describe('members and classes in scope', () => {
    test('accessors read or assign super', () => {
        expect(verdict('return super.context;', 'get context()')).toBe('ok');
        expect(verdict('return null;', 'get context()')).toBe('never');
        expect(verdict('super.isWait = v;', 'set isWait(v: boolean)')).toBe('ok');
        expect(verdict('if (v) super.isWait = v;', 'set isWait(v: boolean)')).toBe('path');
    });

    test('view, hooks, static methods and other names are not checked', () => {
        const f = findings(`import { Component } from '@motifx/core';
class Card extends Component {
  view() { return null; }
  onBuilt() { }
  initializeComponent() { }
  static build() { }
  render() { }
}`);
        expect(f).toEqual([]);
    });

    test('a class without extends is not checked', () => {
        expect(findings(`class Store { dispose() { } build() { } }`)).toEqual([]);
    });

    test('the base is followed through local classes and namespace imports', () => {
        const f = findings(`import * as motif from '@motifx/core';
class Base extends motif.Component { }
class Card extends Base { build() { } }
const Inline = class extends Base { dispose() { } };`);
        expect(f.map(x => [x.className, x.member, x.base])).toEqual([
            ['Card', 'build', { kind: 'import', source: '@motifx/core', name: 'Component' }],
            ['Inline', 'dispose', { kind: 'import', source: '@motifx/core', name: 'Component' }],
        ]);
    });

    test('the quick filter skips files that cannot match', () => {
        expect(mayHaveSuperOverrides(`export class Store { dispose() { } }`)).toBe(false);
        expect(mayHaveSuperOverrides(`export const x = 1;`)).toBe(false);
        expect(mayHaveSuperOverrides(`class A extends B {\n  async dispose() { } }`)).toBe(true);
        expect(mayHaveSuperOverrides(`class A extends B { get context() { return 1; } }`)).toBe(true);
    });

    test('ts and js files are parsed', () => {
        expect(findings(`import { Component } from '@motifx/core';\nexport class A extends Component { build() { } }`, 'A.ts')).toHaveLength(1);
        expect(findings(`import { Component } from '@motifx/core';\nexport class A extends Component { build() { } }`, 'A.js')).toHaveLength(1);
        expect(findings(`import { Component } from '@motifx/core';\nexport class A extends Component { build<T>(x?: T) { } }`, 'A.ts')).toHaveLength(1);
    });
});

describe('component bases across files', () => {
    const files: Record<string, string> = {
        '/p/src/Base.ts': `import { Component } from '@motifx/core';\nexport class Base extends Component { }\nexport default class DefaultBase extends Component { }`,
        '/p/src/Service.ts': `import { Disposable } from '@motifx/core';\nexport class Service extends Disposable { }`,
        '/p/src/index.ts': `export { Base as Renamed } from './Base';\nexport * from './Service';`,
        '/p/src/Deep.ts': `import { Renamed } from './index';\nexport class Deep extends Renamed { }`,
    };
    const resolve = async (source: string, importer: string) => {
        if (!source.startsWith('.')) return null;
        const base = path.posix.join(path.posix.dirname(importer.replace(/\\/g, '/')), source);
        for (const ext of ['', '.ts']) if (files[base + ext]) return base + ext;
        return null;
    };
    const read = async (file: string) => files[file] ?? null;

    const check = (code: string) => checkSuperCalls(code, '/p/src/Card.tsx', createComponentResolver(resolve, read));

    test('a base imported from another file, renamed and re-exported', async () => {
        const out = await check(`import { Deep } from './Deep';\nclass Card extends Deep { build() { } }`);
        expect(out.map(d => d.code)).toEqual(['MJX015']);
        expect(out[0].message).toContain('Card.build overrides a ComponentBase member and does not call super.build');
        expect(out[0].line).toBe(2);
        expect(out[0].frame).toContain('class Card extends Deep');
    });

    test('a default-exported base', async () => {
        const out = await check(`import DefaultBase from './Base';\nclass Card extends DefaultBase { dispose() { } }`);
        expect(out).toHaveLength(1);
    });

    test('a class that is not a component stays silent', async () => {
        const out = await check(`import { Service } from './index';\nimport { Disposable } from '@motifx/core';\nclass S extends Service { dispose() { } }\nclass D extends Disposable { dispose() { } }\nclass H extends HTMLElement { build() { } }`);
        expect(out).toEqual([]);
    });

    test('an unresolved base stays silent', async () => {
        const out = await check(`import { X } from 'some-lib';\nclass Card extends X { build() { } }`);
        expect(out).toEqual([]);
    });

    test('a conditional skip is reported with the path message', async () => {
        const out = await check(`import { Component } from '@motifx/core';\nclass Card extends Component {\n  build(b?: boolean) {\n    if (this.props.lazy) return;\n    super.build(b);\n  }\n}`);
        expect(out).toHaveLength(1);
        expect(out[0].message).toContain('Card.build can finish without reaching super.build');
        expect(out[0].line).toBe(3);
    });
});

describe('plugin file selection', () => {
    test('source files of every kind, never node_modules or declarations', () => {
        const src = `class A extends B { build() { } }`;
        for (const f of ['/p/a.tsx', '/p/a.jsx', '/p/a.ts', '/p/a.js', '/p/a.mts', '/p/a.mjs']) expect(shouldCheckSuperCalls(f, src)).toBe(true);
        expect(shouldCheckSuperCalls('/p/node_modules/x/a.js', src)).toBe(false);
        expect(shouldCheckSuperCalls('D:\\p\\node_modules\\x\\a.js', src)).toBe(false);
        expect(shouldCheckSuperCalls('/p/a.d.ts', src)).toBe(false);
        expect(shouldCheckSuperCalls('/p/a.css', src)).toBe(false);
        expect(shouldCheckSuperCalls('/p/a.ts?raw', src)).toBe(false);
    });
});

describe('core component list', () => {
    test('matches the classes @motifx/core exports that derive from ComponentBase', () => {
        const core: any = coreModule;
        const base = core.ComponentBase.prototype;
        const actual = Object.entries(core)
            .filter(([, v]: [string, any]) => typeof v === 'function' && v.prototype && (v === core.ComponentBase || base.isPrototypeOf(v.prototype)))
            .map(([k]) => k)
            .sort();
        expect([...CORE_COMPONENT_CLASSES].sort()).toEqual(actual);
    });
});

describe('vite plugin', () => {
    test('transform stays synchronous and the warning is printed by buildEnd', async () => {
        const plugin: any = vitePlugin();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        try {
            const ctx = { resolve: async () => null };
            const src = `import { Component } from '@motifx/core';\nexport class Card extends Component {\n  build() { if (this.x) return; super.build(); }\n}`;
            const out = plugin.transform.call(ctx, src, '/p/src/Card.ts');
            expect(out === undefined || typeof (out as any).then !== 'function').toBe(true);
            await plugin.buildEnd();
            const lines = warn.mock.calls.map(c => String(c[0])).filter(l => l.includes('MJX015'));
            expect(lines).toHaveLength(1);
            expect(lines[0]).toContain('Card.build can finish without reaching super.build');
            expect(lines[0]).toContain('/p/src/Card.ts:3');
        } finally {
            warn.mockRestore();
        }
    });

    test('diagnostics: false turns the check off', async () => {
        const plugin: any = vitePlugin({ diagnostics: false });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        try {
            plugin.transform.call({ resolve: async () => null }, `import { Component } from '@motifx/core';\nclass A extends Component { build() { } }`, '/p/a.ts');
            await plugin.buildEnd();
            expect(warn.mock.calls.filter(c => String(c[0]).includes('MJX015'))).toEqual([]);
        } finally {
            warn.mockRestore();
        }
    });
});
