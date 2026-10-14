import vitePlugin from '../src/vitePlugin';

const rolldownVite = { meta: { rolldownVersion: '1.2.14', viteVersion: '8.3.4' } };
const esbuildVite = { meta: { viteVersion: '7.3.7' } };
const env = { command: 'serve', mode: 'development' };

const configHook = (plugin: any) => plugin.config as ((this: unknown, config: object, env: object) => unknown) | undefined;

describe('Vite dependency scan leaves JSX alone', () => {
    test('on Vite with Rolldown the scan keeps JSX as written', () => {
        const hook = configHook(vitePlugin());
        expect(hook).toBeInstanceOf(Function);
        expect(hook!.call(rolldownVite, {}, env)).toEqual({ optimizeDeps: { rolldownOptions: { transform: { jsx: 'preserve' } } } });
    });

    test('a jsx setting the app gives for the scan is kept', () => {
        const hook = configHook(vitePlugin());
        const config = { optimizeDeps: { rolldownOptions: { transform: { jsx: { runtime: 'classic' } } } } };
        expect(hook!.call(rolldownVite, config, env)).toBeUndefined();
    });

    test('other scan transform settings of the app stay and only jsx is added', () => {
        const hook = configHook(vitePlugin());
        const config = { optimizeDeps: { rolldownOptions: { transform: { target: 'es2022' } } } };
        expect(hook!.call(rolldownVite, config, env)).toEqual({ optimizeDeps: { rolldownOptions: { transform: { jsx: 'preserve' } } } });
    });

    test('Vite with esbuild and plain Rollup are not changed', () => {
        const hook = configHook(vitePlugin());
        expect(hook!.call(esbuildVite, {}, env)).toBeUndefined();
        expect(hook!.call({}, {}, env)).toBeUndefined();
        expect(hook!.call(undefined, {}, env)).toBeUndefined();
    });
});
