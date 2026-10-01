import * as ts from 'typescript';
import pPath from 'path';
import type { MotifDiagnostic } from './diagnostics';


export interface LintOptions {
    /** tsconfig yolu. Varsayılan: `./tsconfig.json`. */
    project?: string;
    /** Yalnızca bu dosyalar (mutlak ya da proje köküne göre). Verilmezse programın tüm kaynakları. */
    files?: string[];
}

/** `() => X` bu tipe geçebilir mi? Union'da tek bir çağrılabilir bileşen yeter. */
export function acceptsFunction(type: ts.Type, checker: ts.TypeChecker, depth = 0): boolean {
    if (depth > 8) return true; 
    const f = type.flags;
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return true;
    if (f & ts.TypeFlags.NonPrimitive) return true; 
    if (type.isUnion()) return type.types.some(t => acceptsFunction(t, checker, depth + 1));
    if (type.isIntersection()) return type.types.every(t => acceptsFunction(t, checker, depth + 1));
    if (f & ts.TypeFlags.TypeParameter) {
        const c = (type as ts.TypeParameter).getConstraint?.() ?? checker.getBaseConstraintOfType(type);
        return c ? acceptsFunction(c, checker, depth + 1) : true;
    }
    if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) return true;
    if (checker.getSignaturesOfType(type, ts.SignatureKind.Construct).length > 0) return true;
    const sym = type.getSymbol();
    if (sym && (sym.name === 'Function' || sym.name === 'CallableFunction')) return true;
    if (f & ts.TypeFlags.Object) {
        const props = checker.getPropertiesOfType(type);
        const idx = checker.getIndexInfosOfType?.(type) ?? [];
        if (props.length === 0 && idx.length === 0 && checker.getSignaturesOfType(type, ts.SignatureKind.Call).length === 0) {
            const decl = sym?.declarations?.[0];
            if (!decl || ts.isTypeLiteralNode(decl) || ts.isInterfaceDeclaration(decl)) return true;
        }
    }
    return false;
}

function stripParens(e: ts.Expression): ts.Expression {
    let cur = e;
    while (ts.isParenthesizedExpression(cur)) cur = cur.expression;
    return cur;
}

/** Etiket bir bileşen mi? `div` gibi küçük harfli tanımlayıcı DOM'dur; üye ifadesi ve büyük harf bileşendir. */
function isComponentTag(name: ts.JsxTagNameExpression): boolean {
    if (ts.isIdentifier(name)) {
        const n = name.text;
        return n.length > 0 && n[0] !== n[0].toLowerCase();
    }
    return ts.isPropertyAccessExpression(name); 
}

function tagText(name: ts.JsxTagNameExpression): string {
    return name.getText();
}
 
export function lintProgram(program: ts.Program, files?: string[]): MotifDiagnostic[] {
    const checker = program.getTypeChecker();
    const out: MotifDiagnostic[] = [];
    const wanted = files ? new Set(files.map(f => normalize(f))) : null;

    for (const sf of program.getSourceFiles()) {
        if (sf.isDeclarationFile) continue;
        if (sf.fileName.includes('/node_modules/')) continue;
        if (wanted && !wanted.has(normalize(sf.fileName))) continue;
        if (!/\.(tsx|jsx|mtsx|mjsx)$/.test(sf.fileName)) continue;

        const visit = (node: ts.Node): void => {
            if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
                const expr = stripParens(node.initializer.expression);
                if (ts.isConditionalExpression(expr)) {
                    const attrs = node.parent;
                    const opening = attrs.parent;
                    if ((ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) && isComponentTag(opening.tagName)) {
                        check(node, expr, opening);
                    }
                }
            }
            ts.forEachChild(node, visit);
        };

        const check = (attr: ts.JsxAttribute, expr: ts.ConditionalExpression, opening: ts.JsxOpeningLikeElement): void => {
            const propName = ts.isIdentifier(attr.name) ? attr.name.text : attr.name.getText();
            if (propName === 'key' || propName === 'indexkey' || /^x[-:]/i.test(propName) || /^on[-:_]/i.test(propName)) return;

            let type: ts.Type | undefined;
            try {
                const propsType = checker.getContextualType(opening.attributes as unknown as ts.Expression);
                const propSym = propsType ? checker.getPropertyOfType(propsType, propName) : undefined;
                const decl = propSym?.declarations?.find(d => (ts.isPropertySignature(d) || ts.isPropertyDeclaration(d)) && !!d.type) as ts.PropertySignature | ts.PropertyDeclaration | undefined;
                if (decl?.type) type = checker.getTypeFromTypeNode(decl.type);
                else if (propSym) type = checker.getTypeOfSymbolAtLocation(propSym, opening);
                else type = checker.getContextualType((attr.initializer as ts.JsxExpression).expression as ts.Expression);
            } catch { type = undefined; }
            if (!type) return;
            if (acceptsFunction(type, checker)) return;

            const typeText = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
            const { line } = sf.getLineAndCharacterOfPosition(attr.getStart(sf));
            out.push({
                code: 'MJX005',
                file: sf.fileName,
                line: line + 1,
                message:
                    `<${tagText(opening.tagName)} ${propName}={… ? … : …}>: the component declares "${propName}" as "${typeText}", ` +
                    `but the compiler ALWAYS wraps an attribute ternary in "() => …" (by design, for reactivity), so the component receives ` +
                    `a FUNCTION at runtime; TypeScript does not see this. Declare the prop as Bind<T> (T | (() => T)) and read it with read()/toGetter(). ` +
                    `If the value is really static, compute the ternary outside JSX and pass the variable.`,
                frame: codeFrame(sf, attr),
            });
        };

        visit(sf);
    }
    return out;
}

/** tsconfig'den program kurup denetler. CLI bunu kullanır. */
export function lintProject(options: LintOptions = {}): MotifDiagnostic[] {
    const projectPath = options.project ?? 'tsconfig.json';
    const configFile = ts.findConfigFile(process.cwd(), ts.sys.fileExists, projectPath) ?? projectPath;
    const read = ts.readConfigFile(configFile, ts.sys.readFile);
    if (read.error) {
        const error = new Error(`[motifjs] MJX014: Cannot read ${configFile}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`) as Error & { code?: string };
        error.code = 'MJX014';
        throw error;
    }
    const basePath = pPath.dirname(pPath.resolve(configFile));
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, basePath);
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
    const files = options.files?.map(f => pPath.resolve(basePath, f));
    return lintProgram(program, files);
}

function normalize(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase();
}

function codeFrame(sf: ts.SourceFile, node: ts.Node): string {
    const start = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const lines = sf.text.split(/\r?\n/);
    const from = Math.max(0, start.line - 1);
    const to = Math.min(lines.length - 1, start.line + 1);
    const width = String(to + 1).length;
    const outLines: string[] = [];
    for (let i = from; i <= to; i++) {
        const mark = i === start.line ? '>' : ' ';
        outLines.push(`${mark} ${String(i + 1).padStart(width)} | ${lines[i]}`);
        if (i === start.line) outLines.push(`  ${' '.repeat(width)} | ${' '.repeat(start.character)}^`);
    }
    return outLines.join('\n');
}