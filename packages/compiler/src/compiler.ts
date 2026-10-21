import * as t from '@babel/types';
import { NodePath } from '@babel/core';
import * as babel from '@babel/core';
import syntax_jsx from "@babel/plugin-syntax-jsx";
import syntax_flow from "@babel/plugin-syntax-flow";
import preset_flow from "@babel/preset-flow";
import preset_typescript from "@babel/preset-typescript";
import proposal_decorators from "@babel/plugin-proposal-decorators";
import transform_class_properties from "@babel/plugin-transform-class-properties";
import transform_class_static_block from "@babel/plugin-transform-class-static-block";
import { ParseComponent, ParseFrament, recordClassMembers } from './motifParser';
import { COMPILER_CONTRACT, motifCompiled, motifComponent, motifFragment, motifFunctionComponent, motifReport, State } from "./constants";
import { ASYNC_TRACKING_LOCAL, isVirtualizationDataRequest, wrapAwaitsForTracking } from "./asyncTracking";
import { DECLARED_ELEMENT_PATTERN, resolveElementType } from "./elementTags";
import { beginCollect, endCollect, type MotifDiagnostic } from "./diagnostics";
import { beginExplain, endExplain, isExplaining, captureOrigin, noteOriginRaw, type MotifExplanation } from "./explain";
import { storeNamesPlugin } from "./storeNames";
import { generatedNamesPlugin } from "./generatedNames";


function absorbGeneratedCoreImports(statements: NodePath[], into: Map<string, t.ImportSpecifier>): void {
    const fromCore = statements.filter(statement => t.isImportDeclaration(statement.node) && statement.node.source.value === '@motifx/core');
    for (const statement of fromCore) {
        let absorbed = false;
        for (const specifier of (statement.node as t.ImportDeclaration).specifiers) {
            if (specifier.loc || !t.isImportSpecifier(specifier) || !t.isIdentifier(specifier.imported)) continue;
            const importedName = specifier.imported.name;
            if (into.has(importedName)) continue;
            into.set(importedName, specifier);
            absorbed = true;
        }
        if (absorbed) statement.remove();
    }
}

function hasStaticMember(node: t.ClassDeclaration | t.ClassExpression, name: string): boolean {
    return node.body.body.some(m =>
        (t.isClassProperty(m) || t.isClassMethod(m)) &&
        (m as any).static === true &&
        t.isIdentifier(m.key) &&
        m.key.name === name
    );
}

function injectDeclaredElementTag(path: NodePath<t.ClassDeclaration | t.ClassExpression>): boolean {
    try {
        const node = path.node;
        if (!t.isIdentifier(node.superClass) || node.superClass.name !== 'Component') return false;
        if (hasStaticMember(node, 'elementTag')) return false;

        const typeArgs: any = (node as any).superTypeParameters ?? (node as any).superTypeArguments;
        const first = typeArgs?.params?.[0];
        if (!first || !t.isTSTypeReference(first) || !t.isIdentifier(first.typeName)) return false;

        const resolved = resolveElementType(first.typeName.name);
        if (!resolved) return false;

        const members: any[] = [
            t.classProperty(t.identifier('elementTag'), t.stringLiteral(resolved.tag), null, null, false, true)
        ];
        if (resolved.namespace && !hasStaticMember(node, 'elementNamespace')) {
            members.push(
                t.classProperty(t.identifier('elementNamespace'), t.stringLiteral(resolved.namespace), null, null, false, true)
            );
        }
        node.body.body.unshift(...members);
        return true;
    } catch { /* enjeksiyon başarısızsa derleme bozulmasın */ }
    return false;
}


const isTypeOnlyField = (member: t.Node): boolean =>
    t.isClassProperty(member) && (!!member.declare || !!member.abstract);

function stripTypeOnlyFields(path: NodePath<t.ClassDeclaration | t.ClassExpression>) {
    const body = path.node.body.body;
    if (!body.some(isTypeOnlyField)) return;
    path.node.body.body = body.filter(member => !isTypeOnlyField(member));
}

const elementTagPlugin = () => {
    const visited = new WeakSet<t.Node>();
    return {
        name: 'motifjs-element-tag',
        visitor: {
            Class: {
                enter(path: NodePath<t.ClassDeclaration | t.ClassExpression>) {
                    if (visited.has(path.node)) return;
                    visited.add(path.node);
                    stripTypeOnlyFields(path);
                    injectDeclaredElementTag(path);
                }
            }
        }
    };
};

const declaredElementPlugin = (outcome: { declared: boolean }) => () => ({
    name: 'motifjs-declared-element',
    visitor: {
        Class(path: NodePath<t.ClassDeclaration | t.ClassExpression>) {
            if (injectDeclaredElementTag(path)) outcome.declared = true;
        }
    }
});



const MARKER = /^\*?\s*@DEV-ONLY\s*$/;
const BEGIN_MARKER = /^\*?\s*@DEV-ONLY-BEGIN\s*$/;
const END_MARKER = /^\*?\s*@DEV-ONLY-END\s*$/;
const RANGE_CONTAINERS: Record<string, string> = { Program: 'body', BlockStatement: 'body', StaticBlock: 'body', ClassBody: 'body', SwitchCase: 'consequent' };
const isMarker = (c: any, pattern: RegExp) => c.type === 'CommentBlock' && typeof c.value === 'string' && pattern.test(c.value);

function devOnlyStrip(production: boolean, outcome?: { stripped: boolean }) {
    let isDev = !production;
    if (!production) {
        const flag = (globalThis as any).__MOTIF_DEV__;
        if (typeof flag === 'boolean') isDev = flag;
        if (typeof process !== 'undefined' && process?.env?.MOTIF_DEV === 'false') isDev = false;
    }
    const consumed = new WeakSet<object>();
    const hasMarker = (node: any) => (node.leadingComments || []).some((c: any) => isMarker(c, MARKER) && !consumed.has(c));
    const forget = (node: any, markers: Set<object>) => {
        if (!node) return;
        for (const key of ['leadingComments', 'trailingComments', 'innerComments']) {
            if (node[key]) node[key] = node[key].filter((c: any) => !markers.has(c));
        }
    };
    const remove = (path: NodePath) => {
        const markers = new Set<object>((path.node.leadingComments || []).filter((c: any) => isMarker(c, MARKER)));
        markers.forEach(c => consumed.add(c));
        forget(path.node, markers);
        forget(path.getPrevSibling().node, markers);
        path.remove();
        if (outcome) outcome.stripped = true;
    };
    const stripRanges = (program: NodePath<t.Program>) => {
        const all = ((program.parent as any).comments || []).filter((c: any) => isMarker(c, BEGIN_MARKER) || isMarker(c, END_MARKER));
        if (all.length === 0) return;
        const fail = (c: any, message: string): never => { throw program.hub.buildError({ loc: c.loc } as any, message); };
        const placed = new Set<object>();
        const ranges: { items: NodePath[]; all: NodePath[]; container: any; markers: Set<object> }[] = [];
        const visit = (path: NodePath) => {
            const node: any = path.node;
            const items = path.get(RANGE_CONTAINERS[node.type]) as NodePath[];
            const own = all
                .filter((c: any) => !placed.has(c) && c.start >= node.start && c.end <= node.end
                    && !items.some(i => c.start >= i.node.start! && c.end <= i.node.end!))
                .sort((a: any, b: any) => a.start - b.start);
            let open: any = null;
            for (const c of own) {
                placed.add(c);
                if (isMarker(c, BEGIN_MARKER)) {
                    if (open) fail(c, '@DEV-ONLY-BEGIN cannot be nested inside another @DEV-ONLY-BEGIN.');
                    open = c;
                } else {
                    if (!open) fail(c, '@DEV-ONLY-END has no matching @DEV-ONLY-BEGIN in the same block.');
                    ranges.push({ items: items.filter(i => i.node.start! > open.end && i.node.end! < c.start), all: items, container: node, markers: new Set([open, c]) });
                    open = null;
                }
            }
            if (open) fail(open, '@DEV-ONLY-BEGIN has no matching @DEV-ONLY-END in the same block.');
        };
        visit(program);
        program.traverse({ enter(p) { if (RANGE_CONTAINERS[p.node.type]) visit(p); } });
        for (const c of all) {
            if (!placed.has(c)) fail(c, `${isMarker(c, BEGIN_MARKER) ? '@DEV-ONLY-BEGIN' : '@DEV-ONLY-END'} must stand between statements or class members.`);
        }
        if (isDev) return;
        for (const range of ranges) {
            forget(range.container, range.markers);
            range.all.forEach(i => forget(i.node, range.markers));
            for (const item of range.items) {
                item.node.leadingComments = item.node.trailingComments = null;
                item.remove();
            }
            if (outcome) outcome.stripped = true;
        }
    };
    return () => ({
        visitor: {
            Program(path: NodePath<t.Program>) {
                stripRanges(path);
                if (isDev) return;
                for (const stmtPath of path.get('body') as NodePath[]) {
                    try { if (hasMarker(stmtPath.node)) remove(stmtPath); } catch { }
                }
            },
            Statement(path: NodePath) {
                if (isDev) return;
                try { if (hasMarker(path.node)) remove(path); } catch { }
            }
        }
    });
}

export default class Compiler {


    public motifCompile(code: string, filename: string): babel.BabelFileResult | null {

        return this.start(code, filename);
    }
    public diagnostics: MotifDiagnostic[] = [];
    public explanations: MotifExplanation[] = [];
    public storeNames: string | null = null;
    public production = false;

    private namingPlugins(outcome?: { named: boolean }): babel.PluginItem[] {
        return this.storeNames === null ? [] : [storeNamesPlugin(this.storeNames, outcome)];
    }

    private stripPlugins(outcome?: { stripped: boolean }): babel.PluginItem[] {
        return [devOnlyStrip(this.production, outcome)];
    }

    public checkDevOnly(code: string, filename: string): void {
        const file = filename.split('?')[0];
        babel.transformSync(code, {
            sourceType: 'module',
            babelrc: false,
            configFile: false,
            code: false,
            filename: file,
            parserOpts: { plugins: /\.[mc]?ts$/.test(file) ? ['typescript'] : [] },
            plugins: [devOnlyStrip(false)],
        });
    }

    public nameStores(code: string, filename: string): babel.BabelFileResult | null {
        const file = filename.split('?')[0];
        const typed = /\.[mc]?ts$/.test(file);
        if (this.storeNames === null && !this.production && !(typed && DECLARED_ELEMENT_PATTERN.test(code))) return null;
        const outcome = { named: false };
        const strip = { stripped: false };
        const elements = { declared: false };
        const result = babel.transformSync(code, {
            sourceType: 'module',
            babelrc: false,
            configFile: false,
            code: true,
            sourceMaps: true,
            comments: true,
            highlightCode: false,
            filename: file,
            sourceFileName: file,
            parserOpts: { plugins: typed ? ['typescript', 'decorators-legacy'] : [] },
            plugins: [...this.namingPlugins(outcome), ...this.stripPlugins(strip), declaredElementPlugin(elements)],
        });
        return outcome.named || strip.stripped || elements.declared ? result : null;
    }

    public start(code: string, filename: string): babel.BabelFileResult | null {

        beginCollect();
        try {
            return this._run(code, filename);
        } finally {
            this.diagnostics = endCollect();
        }
    }

    public lowerDecorators(code: string, filename: string): babel.BabelFileResult | null {
        const file = filename.split('?')[0];
        return babel.transformSync(code, {
            sourceType: 'module',
            babelrc: false,
            configFile: false,
            code: true,
            sourceMaps: true,
            comments: true,
            highlightCode: false,
            filename: file,
            sourceFileName: file,
            parserOpts: { plugins: /\.[mc]?ts$/.test(file) ? ['typescript'] : [] },
            plugins: [...this.namingPlugins(), ...this.stripPlugins(), declaredElementPlugin({ declared: false }), [proposal_decorators, { "version": "2023-11" }]],
        });
    }

    public declareElements(code: string, filename: string): babel.BabelFileResult | null {
        const file = filename.split('?')[0];
        const elements = { declared: false };
        const result = babel.transformSync(code, {
            sourceType: 'module',
            babelrc: false,
            configFile: false,
            code: true,
            sourceMaps: true,
            comments: true,
            highlightCode: false,
            filename: file,
            sourceFileName: file,
            parserOpts: { plugins: ['typescript', 'decorators-legacy'] },
            plugins: [declaredElementPlugin(elements)],
        });
        return elements.declared ? result : null;
    }

    public explain(code: string, filename: string): babel.BabelFileResult | null {
        beginCollect();
        beginExplain();
        try {
            return this._run(code, filename);
        } finally {
            this.diagnostics = endCollect();
            this.explanations = endExplain();
        }
    }

    private _run(code: string, filename: string): babel.BabelFileResult | null {
        return babel.transformSync(code, {
            sourceType: 'module',
            ast: true,
            babelrc: false,
            configFile: false,
            cloneInputAst: false,
            code: true,
            sourceMaps: true,
            comments: true,
            highlightCode: false,
            minified: false,
            compact: false,
            filename: filename,
            sourceFileName: filename,
            presets: [
                preset_flow,
                [preset_typescript, {
                    onlyRemoveTypeImports: true,
                    isTSX: true,
                    allExtensions: true,
                }]
            ],
            plugins: [
                ...this.namingPlugins(),
                elementTagPlugin,
                [proposal_decorators, { "version": "2023-11" }],
                [transform_class_properties, { "loose": true }],
                transform_class_static_block,
                syntax_flow,
                syntax_jsx,
                generatedNamesPlugin,
                function () {
                    return {
                        visitor: {
                            JSXAttribute(path: NodePath<t.JSXAttribute>, state: State) {
                                if (!isVirtualizationDataRequest(path)) return;
                                const value = path.get('value');
                                if (!value.isJSXExpressionContainer()) return;
                                const fn = value.get('expression');
                                if (!fn.isArrowFunctionExpression() && !fn.isFunctionExpression()) return;
                                if (wrapAwaitsForTracking(fn)) state.set(ASYNC_TRACKING_LOCAL, true);
                            },
                            JSXElement: {
                                exit(path: NodePath<t.JSXElement>, state: State) {
                                    state.set('filename', filename);
                                    const origin = isExplaining() ? captureOrigin(path as NodePath<t.Node>, code) : null;
                                    const out = ParseComponent(path, state);
                                    if (origin) noteOriginRaw(out, origin);
                                    path.replaceWith(out);

                                    if (!state.get(motifFunctionComponent())) {
                                        state.set(motifFunctionComponent(), motifFunctionComponent());
                                    }
                                }
                            },
                            GenericTypeAnnotation: {
                                exit(path: NodePath<t.GenericTypeAnnotation>, state: State) {


                                }
                            },
                            TypeParameterInstantiation: {
                                exit(path: NodePath<t.TypeParameterInstantiation>, state: State) {

                                }
                            },
                            JSXFragment: {
                                exit(path: NodePath<t.JSXElement>, state: State) {
                                    state.set('filename', filename);
                                    const origin = isExplaining() ? captureOrigin(path as NodePath<t.Node>, code) : null;
                                    const out = ParseFrament(path, state);
                                    if (origin) noteOriginRaw(out, origin);
                                    path.replaceWith(out);
                                    var findProgram = (p: any): any => {
                                        if (p.parent !== null) {
                                            if (t.isProgram(p.parent)) {
                                                return p.parent;
                                            } else {
                                                return findProgram(p.parent)
                                            }
                                        } else {
                                            return p;
                                        }
                                    }
                                }
                            },
                            Program: {
                                enter(path: NodePath<t.Program>, state: State) {
                                    state.set('originalCode', code);
                                    recordClassMembers(path);
                                },
                                exit(path: NodePath<t.Program>, state: State) {

                                    const topLevel = path.get('body') as NodePath[];
                                    const coreImports = new Map<string, t.ImportSpecifier>();
                                    coreImports.set('motifComponent', t.importSpecifier(t.identifier(motifComponent()), t.identifier("motifComponent")))
                                    if (state.get(motifFragment())) {
                                        coreImports.set('motifFragment', t.importSpecifier(t.identifier(motifFragment()), t.identifier("motifFragment")));
                                    }

                                    coreImports.set('FNComponent', t.importSpecifier(t.identifier(motifFunctionComponent()), t.identifier("FNComponent")));
                                    coreImports.set('motifCompiled', t.importSpecifier(t.identifier(motifCompiled()), t.identifier('motifCompiled')));
                                    if (state.get(ASYNC_TRACKING_LOCAL)) {
                                        coreImports.set('asyncTracking', t.importSpecifier(t.identifier(ASYNC_TRACKING_LOCAL), t.identifier('asyncTracking')));
                                    }
                                    if (state.get(motifReport())) {
                                        coreImports.set('motifReport', t.importSpecifier(t.identifier(motifReport()), t.identifier('motifReport')));
                                    }


                                    var isSFC = false;
                                    var viewReturn: t.CallExpression = null as any;
                                    var setInternal: t.Statement[] = [];
                                    var setOriginal: t.Statement[] = [];
                                    path.node.body.forEach(tx => {
                                        if (t.isVariableDeclaration(tx)) {
                                            //     if (t.isObjectExpression(y.init)) {
                                            setInternal.push(tx);
                                        } else if (t.isIfStatement(tx)) {
                                            setInternal.push(tx);
                                        } else if (t.isExpressionStatement(tx) && t.isAssignmentExpression(tx.expression)) {
                                            setInternal.push(tx);
                                        } else if (t.isExpressionStatement(tx) && t.isCallExpression(tx.expression) && t.isMemberExpression(tx.expression.callee)) {
                                            setInternal.push(tx);
                                        } else if (t.isExpressionStatement(tx) && t.isCallExpression(tx.expression) && t.isIdentifier(tx.expression.callee)) {
                                            if (tx.expression.callee.name === motifComponent() || tx.expression.callee.name === motifFragment()) {
                                                isSFC = true;
                                                viewReturn = tx.expression;
                                            }
                                        } else {
                                            setOriginal.push(tx);
                                        }


                                    });
                                    if (isSFC) {
                                        var rtrn = t.returnStatement(viewReturn);
                                        coreImports.set('Component', t.importSpecifier(t.identifier("_mC"), t.identifier("Component")));
                                        var cls = t.exportDefaultDeclaration(t.classDeclaration(t.identifier('runtimeClass'), t.identifier('_mC'), t.classBody([t.classMethod('method', t.identifier('view'), [t.identifier('sender')], t.blockStatement([...setInternal, rtrn]))])));


                                        path.node.body = [...setOriginal, cls];
                                    }
                                    state.set('filename', filename);
                                    path.traverse({
                                        CallExpression(call) {
                                            const node = call.node;
                                            if (!t.isIdentifier(node.callee, { name: motifComponent() }) || node.arguments.length !== 2) return;
                                            const [tag, props] = node.arguments;
                                            if (!t.isStringLiteral(tag) || !t.isObjectExpression(props) || props.properties.length !== 1) return;
                                            const only = props.properties[0];
                                            if (!t.isObjectProperty(only) || only.computed || !t.isIdentifier(only.key, { name: 'initializeComponent' })) return;
                                            if (!t.isArrowFunctionExpression(only.value) && !t.isFunctionExpression(only.value)) return;
                                            node.arguments.push(t.numericLiteral(1));
                                        }
                                    });
                                    absorbGeneratedCoreImports(topLevel, coreImports);

                                    if (coreImports.size > 0) {
                                        const contractCall = t.callExpression(t.identifier(motifCompiled()), [t.numericLiteral(COMPILER_CONTRACT)]);
                                        t.addComment(contractCall, 'leading', '#__PURE__');
                                        const coreImport = t.importDeclaration(Array.from(coreImports.values()), t.stringLiteral('@motifx/core'));
                                        path.unshiftContainer('body', [coreImport, t.expressionStatement(contractCall)]);
                                    }
                                    // if (injectableRegistry.length > 0) {
                                    //     const output = `
                                    //     export const GeneratedInjectables: any[] = [



                                    //                             if (allClassesRegistry.length > 0) {
                                    //                                 const output = `
                                    //                                 export const ClassReferences: any[] = [

                                    //                                 fs.writeFileSync(pPath.join(process.cwd(), "generated-class.ts"), output);

                                }
                            },
                        },
                    }
                },
                devOnlyStrip(this.production)
            ],

        })
    }
}