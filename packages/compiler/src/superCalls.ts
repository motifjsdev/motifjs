import * as t from '@babel/types';
import * as babel from '@babel/core';

export const SUPER_METHODS = ['build', 'setState', 'reState', 'setText', 'style', 'dispose', 'disposeAsync', 'using', 'doWork', 'getService', '$', 'useModel'];
export const SUPER_ACCESSORS = ['context', 'siblings', 'serviceProvider', 'isWait'];
export const CORE_COMPONENT_CLASSES = ['Component', 'ComponentBase', 'ContentBlock', 'ContentBody', 'FragmentNode', 'Frame', 'RouterLink', 'RouterView', 'Transport', 'TransportTo', 'Virtualization'];

const coreComponents = new Set(CORE_COMPONENT_CLASSES);
const superNames = new Set([...SUPER_METHODS, ...SUPER_ACCESSORS]);
const quickMember = new RegExp(`(?:^|[\\s;{}])(?:async\\s+|get\\s+|set\\s+|override\\s+|public\\s+|protected\\s+)*(?:${[...superNames].map(n => n.replace('$', '\\$')).join('|')})\\s*\\(`, 'm');

export type BaseRef =
    | { kind: 'import'; source: string; name: string }
    | { kind: 'unknown' };

export interface SuperCallFinding {
    className: string;
    member: string;
    accessor: 'method' | 'get' | 'set';
    kind: 'never' | 'path';
    line: number;
    column: number;
    classLine: number;
    base: BaseRef;
}

export interface ModuleExport {
    local?: string;
    from?: string;
    imported?: string;
}

export interface ModuleShape {
    findings: SuperCallFinding[];
    classBase(name: string): BaseRef | null;
    exportOf(name: string): ModuleExport | null;
    starSources: string[];
}

export function mayHaveSuperOverrides(code: string): boolean {
    return /\bextends\b/.test(code) && quickMember.test(code);
}

export function isCoreSource(source: string): boolean {
    return source === '@motifx/core' || source.startsWith('@motifx/core/');
}

export function isCoreComponent(name: string): boolean {
    return coreComponents.has(name);
}

export function parseModule(code: string, filename: string): t.File | null {
    const isTs = /\.[mc]?tsx?$/.test(filename);
    const isTsx = /\.tsx$/.test(filename);
    const plugins: any[] = isTs ? ['typescript', 'decorators-legacy', 'classProperties'] : ['jsx', 'decorators-legacy', 'classProperties'];
    if (isTsx) plugins.push('jsx');
    try {
        const ast = babel.parseSync(code, {
            filename,
            babelrc: false,
            configFile: false,
            browserslistConfigFile: false,
            sourceType: 'unambiguous',
            parserOpts: { plugins, errorRecovery: true },
        });
        return (ast as t.File | null) ?? null;
    } catch {
        return null;
    }
}

type Use = 'call' | 'get' | 'set';

function isSuperMember(node: t.Node | null | undefined, name: string): boolean {
    if (!node || !(t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) || !t.isSuper(node.object)) return false;
    if (!node.computed && t.isIdentifier(node.property)) return node.property.name === name;
    return t.isStringLiteral(node.property) && node.property.value === name;
}

function directUse(node: t.Node, name: string, use: Use): boolean {
    if (use === 'call' && (t.isCallExpression(node) || t.isOptionalCallExpression(node))) {
        const callee = node.callee;
        if (isSuperMember(callee, name)) return true;
        if ((t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) && isSuperMember(callee.object, name)
            && t.isIdentifier(callee.property) && (callee.property.name === 'call' || callee.property.name === 'apply')) return true;
    }
    if (use === 'get' && isSuperMember(node, name)) return true;
    if (use === 'set' && t.isAssignmentExpression(node) && isSuperMember(node.left, name)) return true;
    return false;
}

function definitely(node: t.Node | null | undefined, name: string, use: Use): boolean {
    if (!node || typeof node !== 'object') return false;
    if (t.isFunction(node) || t.isClass(node)) return false;
    if (directUse(node, name, use)) return true;
    if (use === 'get' && t.isAssignmentExpression(node) && isSuperMember(node.left, name)) return definitely(node.right, name, use);
    if (t.isLogicalExpression(node)) return definitely(node.left, name, use);
    if (t.isConditionalExpression(node)) return definitely(node.test, name, use) || (definitely(node.consequent, name, use) && definitely(node.alternate, name, use));
    if (t.isOptionalCallExpression(node) || t.isOptionalMemberExpression(node)) {
        const head = t.isOptionalCallExpression(node) ? node.callee : node.object;
        return definitely(head, name, use);
    }
    for (const key of t.VISITOR_KEYS[node.type] ?? []) {
        const child = (node as any)[key];
        if (Array.isArray(child) ? child.some(c => definitely(c, name, use)) : definitely(child, name, use)) return true;
    }
    return false;
}

function mentions(node: t.Node | null | undefined, name: string, use: Use): boolean {
    if (!node || typeof node !== 'object') return false;
    if (directUse(node, name, use)) return true;
    if (t.isClass(node)) return false;
    for (const key of t.VISITOR_KEYS[node.type] ?? []) {
        const child = (node as any)[key];
        if (Array.isArray(child) ? child.some(c => mentions(c, name, use)) : mentions(child, name, use)) return true;
    }
    return false;
}

interface Flow {
    normal: boolean | null;
    returns: boolean;
    breaks: boolean | null;
    continues: boolean | null;
}

const join = (a: boolean | null, b: boolean | null): boolean | null => a === null ? b : b === null ? a : a && b;

const GUARDS: Record<string, string[]> = {
    build: ['isBuilt', 'isDisposed', 'isWait'],
    dispose: ['isDisposed'],
    disposeAsync: ['isDisposed'],
};

function isGuardTest(test: t.Expression, member: string): boolean {
    const allowed = GUARDS[member];
    if (!allowed) return false;
    if (t.isLogicalExpression(test) && test.operator === '||') return isGuardTest(test.left, member) && isGuardTest(test.right, member);
    return t.isMemberExpression(test) && t.isThisExpression(test.object) && !test.computed && t.isIdentifier(test.property) && allowed.includes(test.property.name);
}

function isBareReturn(node: t.Statement): boolean {
    if (t.isReturnStatement(node)) return true;
    return t.isBlockStatement(node) && node.body.length === 1 && t.isReturnStatement(node.body[0]);
}

function flow(node: t.Node | null | undefined, called: boolean, name: string, use: Use, member: string): Flow {
    const plain = (c: boolean): Flow => ({ normal: c, returns: true, breaks: null, continues: null });
    if (!node) return plain(called);
    const d = (e: t.Node | null | undefined) => called || definitely(e, name, use);

    if (t.isBlockStatement(node) || t.isProgram(node)) return block(node.body, called, name, use, member);
    if (t.isExpressionStatement(node)) return plain(d(node.expression));
    if (t.isVariableDeclaration(node)) return plain(called || node.declarations.some(x => definitely(x.init, name, use)));
    if (t.isReturnStatement(node)) return { normal: null, returns: d(node.argument), breaks: null, continues: null };
    if (t.isThrowStatement(node)) return { normal: null, returns: true, breaks: null, continues: null };
    if (t.isBreakStatement(node)) return { normal: null, returns: true, breaks: called, continues: null };
    if (t.isContinueStatement(node)) return { normal: null, returns: true, breaks: null, continues: called };
    if (t.isIfStatement(node)) {
        const tc = d(node.test);
        if (!tc && isGuardTest(node.test, member) && isBareReturn(node.consequent)) {
            const alt = node.alternate ? flow(node.alternate, tc, name, use, member) : plain(tc);
            return { normal: alt.normal, returns: alt.returns, breaks: alt.breaks, continues: alt.continues };
        }
        const cons = flow(node.consequent, tc, name, use, member);
        const alt = node.alternate ? flow(node.alternate, tc, name, use, member) : plain(tc);
        return { normal: join(cons.normal, alt.normal), returns: cons.returns && alt.returns, breaks: join(cons.breaks, alt.breaks), continues: join(cons.continues, alt.continues) };
    }
    if (t.isWhileStatement(node) || t.isForStatement(node) || t.isForInStatement(node) || t.isForOfStatement(node)) {
        let tc = called;
        if (t.isForStatement(node)) tc = called || definitely(node.init, name, use) || definitely(node.test, name, use);
        else if (t.isWhileStatement(node)) tc = d(node.test);
        else tc = d(node.right);
        const body = flow(node.body, tc, name, use, member);
        return { normal: join(tc, body.breaks), returns: body.returns, breaks: null, continues: null };
    }
    if (t.isDoWhileStatement(node)) {
        const body = flow(node.body, called, name, use, member);
        const afterBody = join(body.normal, body.continues);
        const afterTest = afterBody === null ? null : afterBody || definitely(node.test, name, use);
        return { normal: join(afterTest, body.breaks), returns: body.returns, breaks: null, continues: null };
    }
    if (t.isSwitchStatement(node)) {
        const dc = d(node.discriminant);
        let fall: boolean | null = null;
        let returns = true;
        let breaks: boolean | null = null;
        let continues: boolean | null = null;
        let hasDefault = false;
        for (const c of node.cases) {
            if (!c.test) hasDefault = true;
            const entry = join(fall, dc || definitely(c.test, name, use));
            const out = entry === null ? null : block(c.consequent, entry, name, use, member);
            if (out) {
                returns = returns && out.returns;
                breaks = join(breaks, out.breaks);
                continues = join(continues, out.continues);
                fall = out.normal;
            } else {
                fall = null;
            }
        }
        let normal = join(fall, breaks);
        if (!hasDefault) normal = join(normal, dc);
        return { normal, returns, breaks: null, continues };
    }
    if (t.isTryStatement(node)) {
        const tryOut = flow(node.block, called, name, use, member);
        const catchOut = node.handler ? flow(node.handler.body, called, name, use, member) : null;
        let normal = catchOut ? join(tryOut.normal, catchOut.normal) : tryOut.normal;
        let returns = tryOut.returns && (catchOut ? catchOut.returns : true);
        let breaks = catchOut ? join(tryOut.breaks, catchOut.breaks) : tryOut.breaks;
        let continues = catchOut ? join(tryOut.continues, catchOut.continues) : tryOut.continues;
        if (node.finalizer) {
            const fin = flow(node.finalizer, false, name, use, member);
            if (fin.normal === true) {
                normal = normal === null ? null : true;
                returns = true;
                breaks = breaks === null ? null : true;
                continues = continues === null ? null : true;
            } else if (fin.normal === null) {
                return { normal: null, returns: returns && fin.returns, breaks: fin.breaks, continues: fin.continues };
            }
            returns = returns && fin.returns;
        }
        return { normal, returns, breaks, continues };
    }
    if (t.isLabeledStatement(node)) {
        const body = flow(node.body, called, name, use, member);
        return { normal: join(body.normal, body.breaks), returns: body.returns, breaks: null, continues: body.continues };
    }
    if (t.isFunctionDeclaration(node) || t.isClassDeclaration(node)) return plain(called);
    let c = called;
    for (const key of t.VISITOR_KEYS[node.type] ?? []) {
        const child = (node as any)[key];
        if (Array.isArray(child) ? child.some(x => definitely(x, name, use)) : definitely(child, name, use)) { c = true; break; }
    }
    return plain(c);
}

function block(body: t.Statement[], called: boolean, name: string, use: Use, member: string): Flow {
    let state: boolean | null = called;
    let returns = true;
    let breaks: boolean | null = null;
    let continues: boolean | null = null;
    for (const s of body) {
        if (state === null) break;
        const out = flow(s, state, name, use, member);
        returns = returns && out.returns;
        breaks = join(breaks, out.breaks);
        continues = join(continues, out.continues);
        state = out.normal;
    }
    return { normal: state, returns, breaks, continues };
}

export function checkMemberBody(body: t.BlockStatement, member: string, accessor: 'method' | 'get' | 'set'): 'ok' | 'never' | 'path' {
    const use: Use = accessor === 'method' ? 'call' : accessor;
    if (!mentions(body, member, use)) return 'never';
    const out = flow(body, false, member, use, member);
    return out.normal !== false && out.returns ? 'ok' : 'path';
}

function memberName(m: t.Node): string | null {
    const key = (m as any).key;
    if ((m as any).computed) return t.isStringLiteral(key) ? key.value : null;
    if (t.isIdentifier(key)) return key.name;
    if (t.isStringLiteral(key)) return key.value;
    return null;
}

export function analyzeModule(ast: t.File): ModuleShape {
    const imports = new Map<string, { source: string; name: string }>();
    const classes = new Map<string, t.Class>();
    const exportsMap = new Map<string, ModuleExport>();
    const starSources: string[] = [];
    const findings: SuperCallFinding[] = [];
    const classNodes: Array<{ node: t.Class; name: string }> = [];

    const noteClass = (node: t.Class, name: string | null) => {
        if (name) classes.set(name, node);
        classNodes.push({ node, name: name ?? 'An anonymous class' });
    };

    const walk = (node: any, parent: any) => {
        if (!node || typeof node !== 'object' || !node.type) return;
        if (t.isImportDeclaration(node)) {
            for (const s of node.specifiers) {
                if (t.isImportSpecifier(s)) imports.set(s.local.name, { source: node.source.value, name: t.isIdentifier(s.imported) ? s.imported.name : s.imported.value });
                else if (t.isImportDefaultSpecifier(s)) imports.set(s.local.name, { source: node.source.value, name: 'default' });
                else if (t.isImportNamespaceSpecifier(s)) imports.set(s.local.name, { source: node.source.value, name: '*' });
            }
        } else if (t.isExportNamedDeclaration(node)) {
            if (node.source) {
                for (const s of node.specifiers) {
                    if (t.isExportSpecifier(s)) {
                        const exported = t.isIdentifier(s.exported) ? s.exported.name : s.exported.value;
                        exportsMap.set(exported, { from: node.source.value, imported: s.local.name });
                    }
                }
            } else {
                for (const s of node.specifiers) {
                    if (t.isExportSpecifier(s)) {
                        const exported = t.isIdentifier(s.exported) ? s.exported.name : s.exported.value;
                        exportsMap.set(exported, { local: s.local.name });
                    }
                }
                const decl = node.declaration;
                if (t.isClassDeclaration(decl) && decl.id) exportsMap.set(decl.id.name, { local: decl.id.name });
                if (t.isVariableDeclaration(decl)) {
                    for (const v of decl.declarations) if (t.isIdentifier(v.id)) exportsMap.set(v.id.name, { local: v.id.name });
                }
            }
        } else if (t.isExportDefaultDeclaration(node)) {
            const decl = node.declaration;
            if (t.isClassDeclaration(decl)) {
                const local = decl.id?.name ?? '*default*';
                if (!decl.id) classes.set(local, decl);
                exportsMap.set('default', { local });
            } else if (t.isIdentifier(decl)) {
                exportsMap.set('default', { local: decl.name });
            }
        } else if (t.isExportAllDeclaration(node)) {
            starSources.push(node.source.value);
        }
        if (t.isClassDeclaration(node)) {
            noteClass(node, node.id?.name ?? (t.isExportDefaultDeclaration(parent) ? '*default*' : null));
        } else if (t.isClassExpression(node)) {
            const name = node.id?.name ?? (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) ? parent.id.name : null);
            noteClass(node, name);
        }
        for (const key of t.VISITOR_KEYS[node.type] ?? []) {
            const child = node[key];
            if (Array.isArray(child)) child.forEach(c => walk(c, node));
            else walk(child, node);
        }
    };
    walk(ast.program, null);

    const baseOf = (cls: t.Class, seen: Set<t.Class>): BaseRef => {
        if (seen.has(cls)) return { kind: 'unknown' };
        seen.add(cls);
        const sup = cls.superClass;
        if (t.isIdentifier(sup)) {
            const imp = imports.get(sup.name);
            if (imp && imp.name !== '*') return { kind: 'import', source: imp.source, name: imp.name };
            const local = classes.get(sup.name);
            if (local) return baseOf(local, seen);
            return { kind: 'unknown' };
        }
        if (t.isMemberExpression(sup) && t.isIdentifier(sup.object) && !sup.computed && t.isIdentifier(sup.property)) {
            const imp = imports.get(sup.object.name);
            if (imp && imp.name === '*') return { kind: 'import', source: imp.source, name: sup.property.name };
        }
        return { kind: 'unknown' };
    };

    for (const { node, name } of classNodes) {
        if (!node.superClass) continue;
        let base: BaseRef | undefined;
        for (const m of node.body.body) {
            if (!(t.isClassMethod(m) || t.isClassPrivateMethod(m)) || (m as any).static || t.isClassPrivateMethod(m)) continue;
            if (m.kind === 'constructor') continue;
            const member = memberName(m);
            if (!member || !superNames.has(member)) continue;
            const accessor: 'method' | 'get' | 'set' = m.kind === 'get' ? 'get' : m.kind === 'set' ? 'set' : 'method';
            if (accessor === 'method' && !SUPER_METHODS.includes(member)) continue;
            if (accessor !== 'method' && !SUPER_ACCESSORS.includes(member)) continue;
            const result = checkMemberBody(m.body, member, accessor);
            if (result === 'ok') continue;
            base ??= baseOf(node, new Set());
            findings.push({
                className: name === '*default*' ? 'The default-exported class' : name,
                member,
                accessor,
                kind: result,
                line: m.loc?.start.line ?? 0,
                column: m.loc?.start.column ?? 0,
                classLine: node.loc?.start.line ?? 0,
                base,
            });
        }
    }

    return {
        findings,
        classBase(exportedOrLocal: string) {
            const cls = classes.get(exportedOrLocal);
            return cls ? baseOf(cls, new Set()) : null;
        },
        exportOf(name: string) {
            return exportsMap.get(name) ?? null;
        },
        starSources,
    };
}

export function superCallMessage(f: SuperCallFinding): string {
    const target = f.accessor === 'get' ? `read super.${f.member}` : f.accessor === 'set' ? `assign super.${f.member}` : `call super.${f.member}(…)`;
    return f.kind === 'never'
        ? `${f.className}.${f.member} overrides a ComponentBase member and does not ${target}; MotifJS relies on it. Rename the member, or ${target} on every path.`
        : `${f.className}.${f.member} can finish without reaching super.${f.member} (a return, a branch, a loop or a catch skips it); MotifJS relies on it. ${target[0].toUpperCase() + target.slice(1)} on every path.`;
}

export type ResolveFn = (source: string, importer: string) => Promise<string | null>;
export type ReadFn = (file: string) => Promise<string | null>;

export function createComponentResolver(resolve: ResolveFn, read: ReadFn) {
    const cache = new Map<string, Promise<boolean>>();
    const shapes = new Map<string, Promise<ModuleShape | null>>();

    const shapeOf = (file: string): Promise<ModuleShape | null> => {
        let p = shapes.get(file);
        if (!p) {
            p = (async () => {
                const code = await read(file);
                if (code == null || code.length > 2_000_000) return null;
                const ast = parseModule(code, file);
                return ast ? analyzeModule(ast) : null;
            })();
            shapes.set(file, p);
        }
        return p;
    };

    const isComponentExport = (file: string, name: string, depth: number): Promise<boolean> => {
        const key = `${file}#${name}`;
        let p = cache.get(key);
        if (!p) {
            cache.set(key, Promise.resolve(false));
            p = (async () => {
                if (depth > 12) return false;
                const shape = await shapeOf(file);
                if (!shape) return false;
                const exp = shape.exportOf(name);
                if (exp?.from) return isComponentBase({ kind: 'import', source: exp.from, name: exp.imported ?? name }, file, depth + 1);
                const local = exp?.local ?? (name === 'default' ? '*default*' : null);
                if (local) {
                    const base = shape.classBase(local);
                    if (base) return isComponentBase(base, file, depth + 1);
                    return false;
                }
                for (const star of shape.starSources) {
                    if (await isComponentBase({ kind: 'import', source: star, name }, file, depth + 1)) return true;
                }
                return false;
            })();
            cache.set(key, p);
        }
        return p;
    };

    const isComponentBase = async (base: BaseRef, importer: string, depth = 0): Promise<boolean> => {
        if (base.kind !== 'import') return false;
        if (isCoreSource(base.source)) return isCoreComponent(base.name);
        let file: string | null = null;
        try { file = await resolve(base.source, importer); } catch { file = null; }
        if (!file) return false;
        return isComponentExport(file, base.name, depth);
    };

    return isComponentBase;
}
