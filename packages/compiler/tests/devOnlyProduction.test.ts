import vitePlugin from '../src/vitePlugin';

const CORE = `import { treeChanged, componentEvent, navigationStarted, navigationFinished } from "./devtools.js";
class ControlCollection {
    add(item) {
        this.items.push(item);
        /* @DEV-ONLY */ treeChanged(this.owner);
        return item;
    }
    set waiting(value) {
        /* @DEV-ONLY */ if (this.waiting !== value) componentEvent('component:wait', this, { waiting: value });
        this._waiting = value;
    }
    async navigate(uri) {
        /* @DEV-ONLY */ const devNav = navigationStarted(uri);
        const result = await this.run(uri);
        /* @DEV-ONLY */ navigationFinished(devNav, result);
        return result;
    }
}
export { ControlCollection };
`;

const DEV_CALLS = ['treeChanged(this.owner)', 'component:wait', 'navigationStarted(uri)', 'navigationFinished(devNav'];
const KEPT = ['this.items.push(item)', 'return item', 'this._waiting = value', 'await this.run(uri)', 'return result'];

const CORE_ID = '/app/node_modules/@motifx/core/dist/chunks/core-x.esm.js';

const vite = (isProduction: boolean) => {
    const plugin = vitePlugin({ diagnostics: false });
    plugin.configResolved({ isProduction, root: '/app' });
    return plugin;
};

const expectStripped = (code: string | undefined) => {
    expect(code).toBeDefined();
    for (const call of DEV_CALLS) expect(code).not.toContain(call);
    for (const line of KEPT) expect(code).toContain(line);
};

describe('@DEV-ONLY satırları production çıktısına girmez', () => {
    test('Vite production build çekirdeğin node_modules içindeki dosyasından metot içi işaretli deyimleri siler', () => {
        expectStripped(vite(true).transform(CORE, CORE_ID)?.code);
    });

    test('silinen deyimin işaret yorumu çıktıda kalmaz', () => {
        expect(vite(true).transform(CORE, CORE_ID)?.code).not.toContain('@DEV-ONLY');
    });

    test('Vite geliştirme sunucusunda çekirdek dosyasına dokunulmaz', () => {
        expect(vite(false).transform(CORE, CORE_ID)).toBeUndefined();
    });

    test('Rollup production seçeneğiyle siler', () => {
        expectStripped(vitePlugin({ diagnostics: false, production: true }).transform(CORE, CORE_ID)?.code);
    });

    test('Rollup seçenek verilmezse NODE_ENV=production ile siler', () => {
        const before = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            expectStripped(vitePlugin({ diagnostics: false }).transform(CORE, CORE_ID)?.code);
        } finally {
            process.env.NODE_ENV = before;
        }
    });

    test('Rollup production seçeneği false iken dokunmaz', () => {
        expect(vitePlugin({ diagnostics: false, production: false }).transform(CORE, CORE_ID)).toBeUndefined();
    });

    test('cjs çıktısında da siler', () => {
        expectStripped(vite(true).transform(CORE, '/app/node_modules/@motifx/core/dist/chunks/core-x.cjs')?.code);
    });

    test('uygulamanın .tsx dosyasında metot içi işaretli deyim production\'da silinir, geliştirmede kalır', () => {
        const src = `class A { build() { /* @DEV-ONLY */ console.log('dev'); this.ready = true; } }\nexport const el = <div>x</div>;`;
        const prod = vite(true).transform(src, '/app/src/A.tsx')!.code;
        expect(prod).not.toContain(`console.log('dev')`);
        expect(prod).toContain('this.ready = true');
        expect(vite(false).transform(src, '/app/src/A.tsx')!.code).toContain(`console.log('dev')`);
    });

    test('dekoratörlü .ts dosyasında production\'da silinir', () => {
        const src = `import { Injectable } from '@motifx/core';\n@Injectable()\nexport class S { load() { /* @DEV-ONLY */ console.log('dev'); return 1; } }`;
        const out = vite(true).transform(src, '/app/src/s.ts')!.code;
        expect(out).not.toContain(`console.log('dev')`);
        expect(out).toContain('return 1');
    });

    test('düz .ts dosyasında production\'da silinir', () => {
        const src = `export function load() {\n    /* @DEV-ONLY */ console.log('dev');\n    return 1;\n}`;
        const out = vite(true).transform(src, '/app/src/load.ts')!.code;
        expect(out).not.toContain(`console.log('dev')`);
        expect(out).toContain('return 1');
    });

    test('içinde @DEV-ONLY geçen yorum satırı işaret sayılmaz, altındaki bildirim kalır', () => {
        const src = `// export function old() {\n//     /* @DEV-ONLY */return debug();\nfunction reactive(model) {\n    const result = wrap(model);\n    /* @DEV-ONLY */ registerStore(result);\n    return result;\n}\nexport { reactive };\n`;
        const out = vite(true).transform(src, CORE_ID)!.code;
        expect(out).toContain('function reactive(model)');
        expect(out).toContain('return result');
        expect(out).not.toContain('registerStore(result)');
    });

    test('yalnız @DEV-ONLY içeren blok yorum işarettir; başka metinle geçen blok yorum işaret sayılmaz', () => {
        const src = `function a() {\n    /* see @DEV-ONLY notes */ keep();\n    /* @DEV-ONLY */ drop();\n}\nexport { a };\n`;
        const out = vite(true).transform(src, CORE_ID)!.code;
        expect(out).toContain('keep()');
        expect(out).not.toContain('drop()');
    });

    test('işaretsiz dosyaya ve .d.ts dosyasına dokunulmaz', () => {
        expect(vite(true).transform('export const a = 1;', '/app/node_modules/x/index.js')).toBeUndefined();
        expect(vite(true).transform('/* @DEV-ONLY */ export declare const a: number;', '/app/src/a.d.ts')).toBeUndefined();
    });
});

describe('@DEV-ONLY-BEGIN ile @DEV-ONLY-END arası production çıktısına girmez', () => {
    const LIB_ID = '/app/node_modules/lib/dist/index.js';

    test('fonksiyon gövdesindeki aralık silinir, öncesi ve sonrası kalır', () => {
        const src = [
            'function setup(app) {',
            '    app.start();',
            '    /* @DEV-ONLY-BEGIN */',
            '    const probe = createProbe(app);',
            '    probe.attach();',
            '    window.__probe = probe;',
            '    /* @DEV-ONLY-END */',
            '    return app;',
            '}',
            'export { setup };',
        ].join('\n');
        const out = vite(true).transform(src, LIB_ID)!.code;
        expect(out).toContain('app.start()');
        expect(out).toContain('return app');
        expect(out).not.toContain('createProbe');
        expect(out).not.toContain('probe.attach');
        expect(out).not.toContain('__probe');
        expect(out).not.toContain('@DEV-ONLY');
    });

    test('dosyanın üst düzeyindeki aralık silinir; import ve bildirimler dahil', () => {
        const src = [
            "import { a } from './a.js';",
            '/* @DEV-ONLY-BEGIN */',
            "import { devtools } from './devtools.js';",
            'function expose() { devtools.open(); }',
            'expose();',
            '/* @DEV-ONLY-END */',
            'export const value = a;',
        ].join('\n');
        const out = vite(true).transform(src, LIB_ID)!.code;
        expect(out).toContain("import { a } from './a.js'");
        expect(out).toContain('export const value = a');
        expect(out).not.toContain('devtools');
        expect(out).not.toContain('expose');
        expect(out).not.toContain('@DEV-ONLY');
    });

    test('sınıf gövdesindeki aralık silinir; metot ve alanlar dahil', () => {
        const src = [
            'class Store {',
            '    get(key) { return this.map.get(key); }',
            '    /* @DEV-ONLY-BEGIN */',
            '    debugDump() { return [...this.map]; }',
            '    static debugCount = 0;',
            '    /* @DEV-ONLY-END */',
            '    set(key, value) { this.map.set(key, value); }',
            '}',
            'export { Store };',
        ].join('\n');
        const out = vite(true).transform(src, LIB_ID)!.code;
        expect(out).toContain('get(key)');
        expect(out).toContain('set(key, value)');
        expect(out).not.toContain('debugDump');
        expect(out).not.toContain('debugCount');
        expect(out).not.toContain('@DEV-ONLY');
    });

    test('aynı blokta iki aralık ve tek satır işaret birlikte silinir', () => {
        const src = [
            'function run() {',
            '    one();',
            '    /* @DEV-ONLY-BEGIN */',
            '    devA();',
            '    /* @DEV-ONLY-END */',
            '    two();',
            '    /* @DEV-ONLY */ devB();',
            '    /* @DEV-ONLY-BEGIN */',
            '    devC();',
            '    /* @DEV-ONLY-END */',
            '    three();',
            '}',
            'export { run };',
        ].join('\n');
        const out = vite(true).transform(src, LIB_ID)!.code;
        for (const kept of ['one()', 'two()', 'three()']) expect(out).toContain(kept);
        for (const gone of ['devA', 'devB', 'devC', '@DEV-ONLY']) expect(out).not.toContain(gone);
    });

    test('geliştirmede aralık kalır', () => {
        const src = `function A() { /* @DEV-ONLY-BEGIN */\n    console.log('dev');\n    /* @DEV-ONLY-END */\n    return <div>x</div>; }`;
        expect(vite(false).transform(src, '/app/src/A.tsx')!.code).toContain(`console.log('dev')`);
    });

    const UNMATCHED: [string, string][] = [
        ['END olmayan BEGIN', 'function f() {\n    /* @DEV-ONLY-BEGIN */\n    dev();\n}\nexport { f };'],
        ['BEGIN olmayan END', 'function f() {\n    dev();\n    /* @DEV-ONLY-END */\n}\nexport { f };'],
        ['farklı bloklara bölünmüş işaretler', 'function f() {\n    /* @DEV-ONLY-BEGIN */\n    if (x) {\n        dev();\n        /* @DEV-ONLY-END */\n    }\n}\nexport { f };'],
        ['iç içe BEGIN', 'function f() {\n    /* @DEV-ONLY-BEGIN */\n    a();\n    /* @DEV-ONLY-BEGIN */\n    b();\n    /* @DEV-ONLY-END */\n}\nexport { f };'],
        ['ifade içindeki işaret', 'function f() {\n    call(/* @DEV-ONLY-BEGIN */ a, b /* @DEV-ONLY-END */);\n}\nexport { f };'],
    ];

    test.each(UNMATCHED)('production build durur: %s', (_name, src) => {
        expect(() => vite(true).transform(src, LIB_ID)).toThrow(/@DEV-ONLY-(BEGIN|END)/);
    });

    test('geliştirmede .tsx dosyasında eşleşmeyen işaret hata verir', () => {
        const src = `function A() {\n    /* @DEV-ONLY-BEGIN */\n    console.log('dev');\n    return <div>x</div>;\n}`;
        expect(() => vite(false).transform(src, '/app/src/A.tsx')).toThrow(/@DEV-ONLY-BEGIN/);
    });

    test('geliştirmede düz .ts dosyasında eşleşmeyen işaret hata verir', () => {
        const src = `export function load() {\n    /* @DEV-ONLY-BEGIN */\n    console.log('dev');\n    return 1;\n}`;
        expect(() => vite(false).transform(src, '/app/src/load.ts')).toThrow(/@DEV-ONLY-BEGIN/);
    });
});
