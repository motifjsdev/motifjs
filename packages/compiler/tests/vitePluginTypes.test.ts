import * as ts from 'typescript';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const distEntry = path.resolve(__dirname, '../dist/index').split(path.sep).join('/');

const vite5Shape = `
interface DepOptimizationConfig { include?: string[]; exclude?: string[]; needsInterop?: string[]; esbuildOptions?: { plugins?: unknown[] }; extensions?: string[]; noDiscovery?: boolean }
type DepOptimizationOptions = DepOptimizationConfig & { entries?: string | string[]; force?: boolean };
interface UserConfig { root?: string; optimizeDeps?: DepOptimizationOptions; plugins?: unknown[] }
interface ConfigEnv { command: 'build' | 'serve'; mode: string }
type ObjectHook<T> = T | { handler: T; order?: 'pre' | 'post' | null };
interface Plugin {
    name: string;
    enforce?: 'pre' | 'post';
    config?: ObjectHook<(this: void, config: UserConfig, env: ConfigEnv) => void | Omit<UserConfig, 'plugins'> | Promise<void | Omit<UserConfig, 'plugins'> | null> | null>;
    configResolved?: ObjectHook<(this: void, config: { isProduction: boolean; root: string }) => void | Promise<void>>;
}
`;

const vite7Shape = `
interface DepOptimizationConfig { include?: string[]; exclude?: string[]; rolldownOptions?: { transform?: { jsx?: unknown } }; extensions?: string[]; noDiscovery?: boolean }
type DepOptimizationOptions = DepOptimizationConfig & { entries?: string | string[]; force?: boolean };
interface UserConfig { root?: string; optimizeDeps?: DepOptimizationOptions; plugins?: unknown[] }
interface ConfigEnv { command: 'build' | 'serve'; mode: string }
interface ConfigPluginContext { meta: { rolldownVersion?: string; viteVersion: string }; debug(msg: string): void }
type ObjectHook<T> = T | { handler: T; order?: 'pre' | 'post' | null };
interface Plugin {
    name: string;
    enforce?: 'pre' | 'post';
    config?: ObjectHook<(this: ConfigPluginContext, config: UserConfig, env: ConfigEnv) => void | Omit<UserConfig, 'plugins'> | Promise<void | Omit<UserConfig, 'plugins'> | null> | null>;
    configResolved?: ObjectHook<(this: void, config: { isProduction: boolean; root: string }) => void | Promise<void>>;
}
`;

function typeErrorsOf(shape: string): string[] {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-vite-types-'));
    const file = path.join(dir, 'vite.config.ts');
    const lines = [`import compiler from '${distEntry}';`, shape, 'export const plugin: Plugin = compiler();', 'export const plugins: Plugin[] = [compiler({ production: true })];', ''];
    fs.writeFileSync(file, lines.join(os.EOL));
    const program = ts.createProgram([file], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2021,
        lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
    });
    const own = (name: string) => name.split(path.sep).join('/') === file.split(path.sep).join('/');
    const diags = ts.getPreEmitDiagnostics(program).filter(d => d.file && own(d.file.fileName));
    fs.rmSync(dir, { recursive: true, force: true });
    return diags.map(d => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 160)}`);
}

describe('compiler() fits the Plugin type of every supported Vite', () => {
    test('Vite 5: config hook declared with this: void and optimizeDeps without rolldownOptions', () => {
        expect(typeErrorsOf(vite5Shape)).toEqual([]);
    });

    test('Vite 6/7 and rolldown-vite: config hook with a plugin context carrying meta', () => {
        expect(typeErrorsOf(vite7Shape)).toEqual([]);
    });
});
