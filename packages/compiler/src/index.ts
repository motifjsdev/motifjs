import Compiler from "./compiler";
import vitePlugin, { type MotifVitePluginOptions } from "./vitePlugin";
import { printDiagnostics, type MotifDiagnostic } from "./diagnostics";
import { printExplanations, formatExplanations, type MotifExplanation, type ExplainReactivity, type ExplainSite } from "./explain";
import { lintProject, lintProgram, type LintOptions } from "./lint";

/** Kaynağı derleyip her JSX ifadesinin neye indiğini döndürür (kod üretilmez, yalnızca kayıt). */
export function explain(code: string, filename: string): MotifExplanation[] {
    const c = new Compiler();
    c.explain(code, filename);
    return c.explanations;
}

export type { MotifDiagnostic, MotifExplanation, ExplainReactivity, ExplainSite, LintOptions, MotifVitePluginOptions };
export { Compiler, printDiagnostics, printExplanations, formatExplanations, lintProject, lintProgram };
export default vitePlugin;
