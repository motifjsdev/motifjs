import * as path from "node:path";
import * as ts from "typescript";
import Compiler from "./compiler";
import { printDiagnostics } from "./diagnostics";
import { printExplanations } from "./explain";
const fileRegex = /\.(jsx|tsx|aio|mjsx|mtsx)$/;
const decoratorFileRegex = /\.(ts|mts|cts|js|mjs|cjs)$/;
const declarationFileRegex = /\.d\.[mc]?ts$/;
const decoratorSyntaxRegex = /(?:^|[\s(,;{}])@[A-Za-z_$]/;
const assetQueryRegex = /(?:^|&)(?:raw|url|worker|sharedworker|inline)(?:[&=]|$)/;

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
  return {
    name: 'transform-file-motif-jsx',
    enforce: 'pre' as const,
    transform(src: string, id: string) {
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
