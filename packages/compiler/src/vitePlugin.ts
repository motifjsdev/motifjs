import * as path from "node:path";
import { promises as fsp } from "node:fs";
import * as ts from "typescript";
import Compiler from "./compiler";
import { MotifDiagnostic, printDiagnostics } from "./diagnostics";
import { printExplanations } from "./explain";
import { analyzeModule, createComponentResolver, mayHaveSuperOverrides, parseModule, superCallMessage } from "./superCalls";
const fileRegex = /\.(jsx|tsx|aio|mjsx|mtsx)$/;
const decoratorFileRegex = /\.(ts|mts|cts|js|mjs|cjs)$/;
const declarationFileRegex = /\.d\.[mc]?ts$/;
const decoratorSyntaxRegex = /(?:^|[\s(,;{}])@[A-Za-z_$]/;
const assetQueryRegex = /(?:^|&)(?:raw|url|worker|sharedworker|inline)(?:[&=]|$)/;
const analyzableFileRegex = /\.(jsx|tsx|mjsx|mtsx|ts|mts|cts|js|mjs|cjs)$/;

function sourceFile(id: string): string | null {
  if (id.charCodeAt(0) === 0) return null;
  const queryStart = id.indexOf('?');
  if (queryStart !== -1 && assetQueryRegex.test(id.slice(queryStart + 1))) return null;
  return queryStart === -1 ? id : id.slice(0, queryStart);
}

export function shouldTransform(id: string): boolean {
  const file = sourceFile(id);
  return file !== null && fileRegex.test(file);
}

export function shouldLowerDecorators(id: string, src: string): boolean {
  const file = sourceFile(id);
  if (file === null || !decoratorFileRegex.test(file) || declarationFileRegex.test(file)) return false;
  if (file.includes('/node_modules/')) return false;
  return decoratorSyntaxRegex.test(src);
}

export function shouldCheckSuperCalls(id: string, src: string): boolean {
  const file = sourceFile(id);
  if (file === null || !analyzableFileRegex.test(file) || declarationFileRegex.test(file)) return false;
  if (file.replace(/\\/g, '/').includes('/node_modules/')) return false;
  return mayHaveSuperOverrides(src);
}

function lineFrame(src: string, line: number, column: number): string | undefined {
  const lines = src.split(/\r?\n/);
  if (line < 1 || line > lines.length) return undefined;
  const from = Math.max(1, line - 1);
  const to = Math.min(lines.length, line + 1);
  const width = String(to).length;
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    out.push(`${i === line ? '>' : ' '} ${String(i).padStart(width)} | ${lines[i - 1]}`);
    if (i === line) out.push(`  ${' '.repeat(width)} | ${' '.repeat(column)}^`);
  }
  return out.join('\n');
}

export async function checkSuperCalls(src: string, file: string, isComponentBase: ReturnType<typeof createComponentResolver>): Promise<MotifDiagnostic[]> {
  const ast = parseModule(src, file);
  if (!ast) return [];
  const out: MotifDiagnostic[] = [];
  for (const f of analyzeModule(ast).findings) {
    if (!(await isComponentBase(f.base, file))) continue;
    out.push({ code: 'MJX015', message: superCallMessage(f), file, line: f.line, frame: lineFrame(src, f.line, f.column) });
  }
  return out;
}

function legacyDecoratorsChecker() {
  const byConfig = new Map<string, boolean>();
  return (file: string): boolean => {
    const configPath = ts.findConfigFile(path.dirname(file), ts.sys.fileExists);
    if (!configPath) return false;
    let legacy = byConfig.get(configPath);
    if (legacy === undefined) {
      const read = ts.readConfigFile(configPath, ts.sys.readFile);
      legacy = !read.error && ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath)).options.experimentalDecorators === true;
      byConfig.set(configPath, legacy);
    }
    return legacy;
  };
}

export interface MotifVitePluginOptions {
  diagnostics?: boolean;
  explain?: boolean | string | RegExp;
}

function explainMatches(opt: boolean | string | RegExp | undefined, id: string): boolean {
  if (!opt) return false;
  if (opt === true) return true;
  if (typeof opt === 'string') return id.includes(opt);
  return opt.test(id);
}

export default function vitePlugin(options: MotifVitePluginOptions = {}) {
  const showDiagnostics = options.diagnostics !== false;
  const usesLegacyDecorators = legacyDecoratorsChecker();
  let context: any = null;
  const makeResolver = () => createComponentResolver(
    async (source, importer) => {
      if (!context?.resolve) return null;
      const r = await context.resolve(source, importer, { skipSelf: true });
      if (!r || r.external) return null;
      return sourceFile(r.id);
    },
    async (file) => {
      try { return await fsp.readFile(file, 'utf8'); } catch { return null; }
    });
  let isComponentBase = makeResolver();
  const pending = new Set<Promise<void>>();
  return {
    name: 'transform-file-motif-jsx',
    enforce: 'pre' as const,
    watchChange() {
      isComponentBase = makeResolver();
    },
    handleHotUpdate() {
      isComponentBase = makeResolver();
    },
    async buildEnd() {
      await Promise.all([...pending]);
    },
    transform(this: any, src: string, id: string) {
      if (showDiagnostics && shouldCheckSuperCalls(id, src)) {
        context = this;
        const check = checkSuperCalls(src, sourceFile(id)!, isComponentBase)
          .then(found => { if (found.length > 0) printDiagnostics(found); }, () => { })
          .finally(() => { pending.delete(check); });
        pending.add(check);
      }
      if (shouldLowerDecorators(id, src)) {
        if (usesLegacyDecorators(sourceFile(id)!)) return;
        const result = new Compiler().lowerDecorators(src, id);
        if (result && result.code) {
          return {
            code: result.code,
            map: result.map
          }
        }
        return;
      }
      if (shouldTransform(id)) {
        if (!src.includes("//useReact") && !src.includes("//useVue")) {
          try {
            const compiler = new Compiler();
            const doExplain = explainMatches(options.explain, id);
            var result = doExplain ? compiler.explain(src, id) : compiler.start(src, id);
            if (doExplain) printExplanations(compiler.explanations);
            if (showDiagnostics && compiler.diagnostics.length > 0) {
              printDiagnostics(compiler.diagnostics);
            }
            if (result && result.code) {
              return {
                code: result.code,
                map: result.map
              }
            }
          } catch (error) {
            throw error;
          }
        }
      }
    }
  }
}
