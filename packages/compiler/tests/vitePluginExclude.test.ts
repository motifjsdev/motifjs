import vitePlugin from '../src/vitePlugin';

const src = 'export const el = <div class="a">x</div>;';
const compiled = (out: any) => !!(out && out.code && out.code.includes('"div"'));

describe('vitePlugin exclude option', () => {
    test('a string is matched against the id: excluded files are left alone, the others are compiled', () => {
        const plugin = vitePlugin({ diagnostics: false, exclude: 'legacy/' });
        expect(plugin.transform(src, '/src/legacy/Panel.tsx')).toBeUndefined();
        expect(compiled(plugin.transform(src, '/src/App.tsx'))).toBe(true);
    });

    test('a RegExp is tested against the id', () => {
        const plugin = vitePlugin({ diagnostics: false, exclude: /\.island\.tsx$/ });
        expect(plugin.transform(src, '/src/Widget.island.tsx')).toBeUndefined();
        expect(compiled(plugin.transform(src, '/src/Widget.tsx'))).toBe(true);
    });

    test('a function decides per id', () => {
        const plugin = vitePlugin({ diagnostics: false, exclude: (id: string) => id.includes('/islands/') });
        expect(plugin.transform(src, '/src/islands/Map.tsx')).toBeUndefined();
        expect(compiled(plugin.transform(src, '/src/pages/Map.tsx'))).toBe(true);
    });

    test('a production build strips the development code of an excluded file and leaves its JSX alone', () => {
        const plugin = vitePlugin({ diagnostics: false, exclude: 'legacy/', production: true });
        const devSrc = 'const n: number = 1;\nexport const el = <div class="a">{n}</div>;\n/* @DEV-ONLY */ console.log("dev");\n';
        const out: any = plugin.transform(devSrc, '/src/legacy/Panel.tsx');
        expect(out.code).not.toContain('console.log');
        expect(out.code).toContain('<div class="a">{n}</div>');
        expect(out.code).toContain('const n: number = 1;');
        const jsxOut: any = plugin.transform('export const el = <b>x</b>;\n/* @DEV-ONLY */ console.log("dev");\n', '/src/legacy/Old.jsx');
        expect(jsxOut.code).not.toContain('console.log');
        expect(jsxOut.code).toContain('<b>x</b>');
    });

    test('an excluded file without development code, or while developing, is left alone', () => {
        const build = vitePlugin({ diagnostics: false, exclude: 'legacy/', production: true });
        expect(build.transform(src, '/src/legacy/Panel.tsx')).toBeUndefined();
        const dev = vitePlugin({ diagnostics: false, exclude: 'legacy/', production: false });
        expect(dev.transform(src + '\n/* @DEV-ONLY */ console.log("dev");\n', '/src/legacy/Panel.tsx')).toBeUndefined();
    });

    test('without exclude every matched file is compiled, whatever comments it contains', () => {
        const plugin = vitePlugin({ diagnostics: false });
        expect(compiled(plugin.transform('//useReact\n' + src, '/src/App.tsx'))).toBe(true);
        expect(compiled(plugin.transform('//useVue\n' + src, '/src/App.tsx'))).toBe(true);
    });
});
