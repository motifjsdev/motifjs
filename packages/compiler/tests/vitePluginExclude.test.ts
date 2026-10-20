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

    test('without exclude every matched file is compiled, whatever comments it contains', () => {
        const plugin = vitePlugin({ diagnostics: false });
        expect(compiled(plugin.transform('//useReact\n' + src, '/src/App.tsx'))).toBe(true);
        expect(compiled(plugin.transform('//useVue\n' + src, '/src/App.tsx'))).toBe(true);
    });
});
