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
import { COMPILER_CONTRACT, motifCompiled, motifComponent, motifFragment, motifFunctionComponent, State } from "./constants";
import { ASYNC_TRACKING_LOCAL, isVirtualizationDataRequest, wrapAwaitsForTracking } from "./asyncTracking";
import { resolveElementType } from "./elementTags";
import { beginCollect, endCollect, type MotifDiagnostic } from "./diagnostics";
import { beginExplain, endExplain, isExplaining, captureOrigin, noteOriginRaw, type MotifExplanation } from "./explain";


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

function injectDeclaredElementTag(path: NodePath<t.ClassDeclaration | t.ClassExpression>) {
    try {
        const node = path.node;
        if (!t.isIdentifier(node.superClass) || node.superClass.name !== 'Component') return;
        if (hasStaticMember(node, 'elementTag')) return;

        const typeArgs: any = (node as any).superTypeParameters ?? (node as any).superTypeArguments;
        const first = typeArgs?.params?.[0];
        if (!first || !t.isTSTypeReference(first) || !t.isIdentifier(first.typeName)) return;

        const resolved = resolveElementType(first.typeName.name);
        if (!resolved) return;

        const members: any[] = [
            t.classProperty(t.identifier('elementTag'), t.stringLiteral(resolved.tag), null, null, false, true)
        ];
        if (resolved.namespace && !hasStaticMember(node, 'elementNamespace')) {
            members.push(
                t.classProperty(t.identifier('elementNamespace'), t.stringLiteral(resolved.namespace), null, null, false, true)
            );
        }
        node.body.body.unshift(...members);
    } catch { /* enjeksiyon başarısızsa derleme bozulmasın */ }
}


const elementTagPlugin = () => ({
    name: 'motifjs-element-tag',
    visitor: {
        Class: {
            enter(path: NodePath<t.ClassDeclaration | t.ClassExpression>) {
                injectDeclaredElementTag(path);
            }
        }
    }
});



export default class Compiler {


    public motifCompile(code: string, filename: string): babel.BabelFileResult | null {

        return this.start(code, filename);
    }
    public diagnostics: MotifDiagnostic[] = [];
    public explanations: MotifExplanation[] = [];

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
            plugins: [[proposal_decorators, { "version": "2023-11" }]],
        });
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
                elementTagPlugin,
                [proposal_decorators, { "version": "2023-11" }],
                [transform_class_properties, { "loose": true }],
                transform_class_static_block,
                syntax_flow,
                syntax_jsx,
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
                function devOnlyStrip() {
                    let isDev = true;
                    const flag = (globalThis as any).__MOTIF_DEV__;
                    if (typeof flag === 'boolean') isDev = flag;
                    if (typeof process !== 'undefined' && process?.env?.MOTIF_DEV === 'false') isDev = false;
                    const consumed = new WeakSet<object>();
                    const hasMarker = (node: any, pattern: RegExp) => {
                        const comments: any[] = ([] as any[]).concat(node.leadingComments || []);
                        return comments.some(c => typeof c.value === 'string' && pattern.test(c.value) && !consumed.has(c));
                    };
                    const consumeMarkers = (node: any) => {
                        const comments: any[] = ([] as any[]).concat(node.leadingComments || []);
                        for (const c of comments) {
                            if (typeof c.value === 'string' && /@DEV-ONLY/.test(c.value)) consumed.add(c);
                        }
                    };
                    const stripIfMarked = (path: NodePath) => {
                        if (isDev) return;
                        try {
                            if (hasMarker(path.node, /@DEV-ONLY/)) {
                                consumeMarkers(path.node);
                                path.remove();
                            }
                        } catch { /* ignore single node */ }
                    };
                    return {
                        visitor: {
                            Program(path: NodePath<t.Program>) {
                                if (isDev) return;
                                const bodyPaths = path.get('body') as NodePath[];
                                for (const stmtPath of bodyPaths) {
                                    try {
                                        const node: any = stmtPath.node;
                                        if (hasMarker(node, /@DEV-ONLY/)) {
                                            consumeMarkers(node);
                                            stmtPath.remove();
                                            continue;
                                        } 
                                        const allComments: any[] = ([] as any[]).concat(node.leadingComments || [], node.trailingComments || []);
                                        if (allComments.some(c => /@DEV-ONLY-BEGIN/.test(c.value) && !consumed.has(c))) {
                                            consumeMarkers(node);
                                            stmtPath.remove();
                                            continue;
                                        }
                                    } catch { /* ignore single node */ }
                                }
                            },
                            ClassDeclaration: stripIfMarked,
                            FunctionDeclaration: stripIfMarked,
                            VariableDeclaration: stripIfMarked
                        }
                    };
                }
            ],

        })
    }
}