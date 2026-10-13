import * as path from 'node:path';
import Compiler from '../src/compiler';
import vitePlugin, { shouldNameStores } from '../src/vitePlugin';

const stores = [
    "import { reactive, createSignal as signal, createComputed } from '@motifx/core';",
    'export const cart = reactive({ items: [] as string[] });',
    "const theme = signal('dark'), plain = 1;",
    'let total = createComputed(() => cart.items.length);',
    'export function make() {',
    '    const inner = reactive({ a: 1 });',
    '    return inner;',
    '}',
].join('\n');

const named = (code: string) => [...code.matchAll(/_motifName\((\w+), "([^"]+)", "([^"]+)"\)/g)].map(m => `${m[1]}:${m[2]}:${m[3]}`);

function compiler(label: string | null) {
    const c = new Compiler();
    c.storeNames = label;
    return c;
}

describe('module store names', () => {
    test('names the top-level stores of a script file', () => {
        const out = compiler('src/stores.ts').nameStores(stores, '/app/src/stores.ts')!.code!;
        expect(named(out)).toEqual(['cart:cart:src/stores.ts', 'theme:theme:src/stores.ts', 'total:total:src/stores.ts']);
        expect(out).toContain('import { nameModuleStore as _motifName } from "@motifx/core/devtools";');
        expect(out).toContain('items: [] as string[]');
    });

    test('names stores in a plain JavaScript file', () => {
        const js = "import { useModel } from '@motifx/core';\nexport const form = useModel({ name: '' });";
        expect(named(compiler('src/form.js').nameStores(js, '/app/src/form.js')!.code!)).toEqual(['form:form:src/form.js']);
    });

    test('leaves stores alone that do not come from @motifx/core', () => {
        const other = "import { reactive } from './my-reactive';\nexport const cart = reactive({});";
        expect(compiler('src/a.ts').nameStores(other, '/app/src/a.ts')).toBeNull();
    });

    test('adds nothing without a label', () => {
        expect(compiler(null).nameStores(stores, '/app/src/stores.ts')).toBeNull();
    });

    test('names stores in a JSX file next to the lowered JSX', () => {
        const tsx = [
            "import { reactive, Component } from '@motifx/core';",
            'export const store = reactive({ open: false });',
            'export class Panel extends Component {',
            '    view() { return <div>{() => String(store.open)}</div>; }',
            '}',
        ].join('\n');
        const out = compiler('src/Panel.tsx').start(tsx, '/app/src/Panel.tsx')!.code!;
        expect(named(out)).toEqual(['store:store:src/Panel.tsx']);
        expect(out).not.toContain('<div>');
    });

    test('names stores in a file whose decorators are lowered', () => {
        const decorated = [
            "import { reactive, Injectable } from '@motifx/core';",
            'export const session = reactive({ user: null as string | null });',
            "@Injectable({ lifetime: 'singleton' })",
            'export class Auth {}',
        ].join('\n');
        const out = compiler('src/auth.ts').lowerDecorators(decorated, '/app/src/auth.ts')!.code!;
        expect(named(out)).toEqual(['session:session:src/auth.ts']);
        expect(out).not.toMatch(/^\s*@Injectable/m);
    });
});

describe('vitePlugin module store names', () => {
    const root = path.resolve('/app');
    const file = (rel: string) => path.join(root, rel).replace(/\\/g, '/');

    function plugin(isProduction: boolean) {
        const p = vitePlugin({ diagnostics: false });
        p.configResolved({ isProduction, root });
        return p;
    }

    test.each([
        ['/app/src/stores.ts', stores],
        ['/app/src/stores.js', "import { reactive } from '@motifx/core';\nexport const a = reactive({});"],
        ['/app/src/stores.mts', stores],
    ])('looks at %s', (id, src) => {
        expect(shouldNameStores(id, src)).toBe(true);
    });

    test.each([
        ['a file without a store factory', '/app/src/util.ts', "import { Component } from '@motifx/core';\nexport const a = 1;"],
        ['a declaration file', '/app/src/stores.d.ts', stores],
        ['a dependency', '/app/node_modules/lib/index.js', stores],
        ['a raw import', '/app/src/stores.ts?raw', stores],
    ])('skips %s', (_name, id, src) => {
        expect(shouldNameStores(id, src)).toBe(false);
    });

    test('names stores of a script file while developing, with a path from the root', () => {
        const out = plugin(false).transform(stores, file('src/stores.ts'));
        expect(named(out!.code)).toEqual(['cart:cart:src/stores.ts', 'theme:theme:src/stores.ts', 'total:total:src/stores.ts']);
        expect(out!.map).toBeTruthy();
    });

    test('names stores of a JSX file while developing', () => {
        const tsx = "import { reactive } from '@motifx/core';\nexport const s = reactive({});\nexport const el = <div />;";
        expect(named(plugin(false).transform(tsx, file('src/App.tsx'))!.code)).toEqual(['s:s:src/App.tsx']);
    });

    test('adds nothing to a production build', () => {
        expect(plugin(true).transform(stores, file('src/stores.ts'))).toBeUndefined();
        const tsx = "import { reactive } from '@motifx/core';\nexport const s = reactive({});\nexport const el = <div />;";
        expect(plugin(true).transform(tsx, file('src/App.tsx'))!.code).not.toContain('_motifName');
    });
});
