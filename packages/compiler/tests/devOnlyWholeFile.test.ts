import vitePlugin from '../src/vitePlugin';

const vite = (isProduction: boolean) => {
    const plugin = vitePlugin({ diagnostics: false });
    plugin.configResolved({ isProduction, root: '/app' });
    return plugin;
};

const transform = async (isProduction: boolean, src: string, id: string): Promise<{ code: string } | undefined> =>
    (await vite(isProduction).transform(src, id)) as any;

const RANGE_TS = `/* @DEV-ONLY-BEGIN */
import { probe } from "./probe";
probe.attach();
/* @DEV-ONLY-END */
`;
const SINGLE_TS = `/* @DEV-ONLY */ console.log("kuruldu");
`;
const RANGE_JS = `/* @DEV-ONLY-BEGIN */
export function devHook() {}
/* @DEV-ONLY-END */
`;
const RANGE_TSX = `/* @DEV-ONLY-BEGIN */
export const Dbg = () => <div>dbg</div>;
/* @DEV-ONLY-END */
`;

describe('tamamı @DEV-ONLY olan dosya production çıktısında boş modül olur', () => {
    test.each([
        ['aralıklı .ts', RANGE_TS, '/app/src/probe.ts'],
        ['tek deyimli .ts', SINGLE_TS, '/app/src/boot.ts'],
        ['aralıklı .js', RANGE_JS, '/app/src/hook.js'],
        ['node_modules içindeki .js', RANGE_JS, '/app/node_modules/pkg/dist/hook.js'],
    ])('%s: eklenti boş kod döndürür, özgün kaynak kalmaz', async (_name, src, id) => {
        const out = await transform(true, src, id);
        expect(out).toBeDefined();
        expect(out!.code.trim()).toBe('');
    });

    test('tamamı işaretli .tsx yalnız derleyici girişini bırakır', async () => {
        const out = await transform(true, RANGE_TSX, '/app/src/Dbg.tsx');
        expect(out).toBeDefined();
        expect(out!.code).not.toContain('Dbg');
        expect(out!.code).not.toContain('dbg');
    });

    test('kısmen işaretli .ts dosyasında kalan kod döner', async () => {
        const out = await transform(true, 'export const a = 1;\n/* @DEV-ONLY */ console.log(a);\n', '/app/src/a.ts');
        expect(out!.code).toContain('export const a = 1;');
        expect(out!.code).not.toContain('console.log');
    });

    test('geliştirmede tamamı işaretli .ts dosyasının kodu kalır', async () => {
        const out = await transform(false, RANGE_TS, '/app/src/probe.ts');
        const code = out ? out.code : RANGE_TS;
        expect(code).toContain('probe.attach()');
        expect(code).toContain('@DEV-ONLY-BEGIN');
    });
});
