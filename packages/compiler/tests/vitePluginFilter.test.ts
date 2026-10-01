import vitePlugin, { shouldTransform } from '../src/vitePlugin';

describe('vitePlugin file filter', () => {
    test.each([
        '/src/App.tsx',
        '/src/App.jsx',
        '/src/App.mtsx',
        '/src/App.mjsx',
        '/src/App.aio',
        'C:/project/src/App.tsx',
        '/src/App.tsx?t=1727353200000',
        '/src/App.tsx?import',
        '/src/App.tsx?v=abc123',
        '/src/worker.tsx?worker_file&type=module',
    ])('transforms %s', (id) => {
        expect(shouldTransform(id)).toBe(true);
    });

    test.each([
        '/src/App.ts',
        '/src/styles.css',
        '/src/App.tsx.css',
        '/src/App.tsx.bak',
        '/src/tsx/index.ts',
        '/src/App.tsx?raw',
        '/src/App.tsx?url',
        '/src/App.tsx?worker',
        '/src/App.tsx?sharedworker',
        '/src/App.tsx?inline',
        '/src/App.tsx?import&raw',
        '\0virtual:App.tsx',
    ])('skips %s', (id) => {
        expect(shouldTransform(id)).toBe(false);
    });

    test('transform returns undefined for skipped ids and code for matched ids', () => {
        const plugin = vitePlugin({ diagnostics: false });
        const src = 'export const el = <div class="a">x</div>;';
        expect(plugin.transform(src, '/src/App.tsx?raw')).toBeUndefined();
        const out = plugin.transform(src, '/src/App.tsx?t=1');
        expect(out && out.code).toContain('"div"');
        expect(out && out.map).toBeTruthy();
    });
});
