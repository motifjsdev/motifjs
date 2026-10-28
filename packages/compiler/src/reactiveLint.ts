import * as t from '@babel/types';
import { NodePath } from '@babel/core';
import { warn } from './diagnostics';
import { isCoreFactory } from './storeNames';

const LOOKUP_METHODS = new Set(['find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every']);
const ORDERING_MUTATORS = new Set(['sort', 'reverse']);
const SIZE_MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice']);
const GETTER_CALLS = new Set(['effect', 'createComputed', 'createLazyComputed']);
const BINDING_GETTERS: Record<string, number> = { add: 1, watch: 0, when: 0, ternary: 0, switchCase: 0, method: 0 };
const PLAIN_ATTRIBUTES = new Set(['ref', 'key', 'transition', 'x-ref']);
const COMPARISONS = new Set(['===', '==', '!==', '!=']);
const REACTIVE_FIELDS = new Set(['state', 'props']);
const SYNC_CALLBACK_METHODS = new Set(['map', 'forEach', 'filter', 'reduce', 'reduceRight', 'flatMap', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'sort']);

type Roots = { stores: Set<string>; fields: Set<string>; aliases: Map<string, string> };

function memberRoot(node: t.Node): t.Node | null {
    let cur: t.Node = node;
    while (t.isMemberExpression(cur) || t.isOptionalMemberExpression(cur)) cur = cur.object;
    return t.isThisExpression(cur) || t.isIdentifier(cur) ? cur : null;
}

function firstField(node: t.Node): string | null {
    let cur: t.Node = node;
    let field: string | null = null;
    while (t.isMemberExpression(cur) || t.isOptionalMemberExpression(cur)) {
        field = !cur.computed && t.isIdentifier(cur.property) ? cur.property.name : null;
        cur = cur.object;
    }
    return t.isThisExpression(cur) ? field : null;
}

function isReactive(node: t.Node, roots: Roots): boolean {
    const root = memberRoot(node);
    if (root === null) return false;
    if (t.isIdentifier(root)) return roots.stores.has(root.name) || roots.aliases.has(root.name);
    const field = firstField(node);
    return field !== null && (REACTIVE_FIELDS.has(field) || roots.fields.has(field));
}

function describe(node: t.Node, aliases?: Map<string, string>): string {
    if (t.isThisExpression(node)) return 'this';
    if (t.isIdentifier(node)) return aliases?.get(node.name) ?? node.name;
    if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
        const key = node.computed ? '[…]' : '.' + (t.isIdentifier(node.property) ? node.property.name : '…');
        return describe(node.object, aliases) + key;
    }
    return '…';
}

function runsInline(fn: NodePath<t.Function>): boolean {
    const parent = fn.parent;
    if (!t.isCallExpression(parent) || !(parent.arguments as t.Node[]).includes(fn.node)) return false;
    const callee = parent.callee;
    if (t.isIdentifier(callee)) return callee.name === 'untracked';
    return t.isMemberExpression(callee) && !callee.computed && t.isIdentifier(callee.property) && SYNC_CALLBACK_METHODS.has(callee.property.name);
}

const isUntrackedCall = (call: t.CallExpression) => t.isIdentifier(call.callee) && call.callee.name === 'untracked';

function isFunction(node: t.Node | null | undefined): node is t.ArrowFunctionExpression | t.FunctionExpression {
    return t.isArrowFunctionExpression(node) || t.isFunctionExpression(node);
}

function unwrap(node: t.Node | null | undefined): t.Node | null {
    let cur = node ?? null;
    while (cur && t.isParenthesizedExpression(cur)) cur = cur.expression;
    return cur;
}

function mentions(node: t.Node, name: string): boolean {
    let found = false;
    const visit = (n: any): void => {
        if (found || n === null || typeof n !== 'object') return;
        if (t.isIdentifier(n) && n.name === name) { found = true; return; }
        for (const key of Object.keys(n)) {
            if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
            const v = n[key];
            if (Array.isArray(v)) v.forEach(visit);
            else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v);
        }
    };
    visit(node);
    return found;
}

function lookupField(predicate: t.Node | null | undefined): string | null {
    if (!isFunction(predicate) || predicate.params.length === 0) return null;
    const param = predicate.params[0];
    if (!t.isIdentifier(param)) return null;
    let body: t.Node | null = unwrap(predicate.body);
    if (body && t.isBlockStatement(body)) {
        if (body.body.length !== 1 || !t.isReturnStatement(body.body[0])) return null;
        body = unwrap(body.body[0].argument);
    }
    return comparedField(body, param.name);
}

function comparedField(expr: t.Node | null | undefined, param: string): string | null {
    const body = unwrap(expr);
    if (!body) return null;
    if (t.isLogicalExpression(body)) return comparedField(body.left, param) ?? comparedField(body.right, param);
    if (!t.isBinaryExpression(body) || !COMPARISONS.has(body.operator)) return null;
    for (const [side, other] of [[body.left, body.right], [body.right, body.left]] as [t.Node, t.Node][]) {
        if (!t.isMemberExpression(side) || side.computed || !t.isIdentifier(side.property)) continue;
        const root = memberRoot(side);
        if (root === null || !t.isIdentifier(root) || root.name !== param) continue;
        if (mentions(other, param)) continue;
        return side.property.name;
    }
    return null;
}

const readsPath = (reads: Set<string>, path: string) => {
    for (const read of reads) if (read === path || read.startsWith(path + '.') || read.startsWith(path + '[')) return true;
    return false;
};

function checkGetter(fn: NodePath<t.Node>, roots: Roots, filename: string): void {
    const reads = new Set<string>();
    const skipped = new Set<t.Node>();
    const writes: { at: NodePath<t.Node>; target: t.Node; op: string; untracked: boolean }[] = [];
    const mutations: { at: NodePath<t.Node>; list: t.Node; method: string; untracked: boolean }[] = [];
    let untracked = 0;
    const readMember = (member: NodePath<t.MemberExpression | t.OptionalMemberExpression>) => {
        if (untracked > 0 || skipped.has(member.node)) return;
        const parent = member.parent;
        if (skipped.has(parent) && (t.isMemberExpression(parent) || t.isOptionalMemberExpression(parent))) return;
        reads.add(describe(member.node, roots.aliases));
    };
    fn.traverse({
        Function(inner) {
            if (runsInline(inner)) return;
            inner.skip();
        },
        VariableDeclarator(declarator) {
            const { id, init } = declarator.node;
            if (!init) return;
            if (t.isIdentifier(id)) {
                if ((t.isMemberExpression(init) || t.isOptionalMemberExpression(init)) && isReactive(init, roots)) roots.aliases.set(id.name, describe(init, roots.aliases));
                return;
            }
            if (!t.isObjectPattern(id) || !(t.isThisExpression(init) || t.isIdentifier(init) || t.isMemberExpression(init) || t.isOptionalMemberExpression(init))) return;
            for (const property of id.properties) {
                if (!t.isObjectProperty(property) || property.computed || !t.isIdentifier(property.key) || !t.isIdentifier(property.value)) continue;
                const member = t.memberExpression(init, property.key);
                if (isReactive(member, roots)) roots.aliases.set(property.value.name, describe(member, roots.aliases));
            }
        },
        CallExpression: {
            exit(call) {
                if (isUntrackedCall(call.node)) untracked--;
            },
            enter(call) {
            const callee = call.node.callee;
            if (isUntrackedCall(call.node)) {
                untracked++;
                return;
            }
            if (!t.isMemberExpression(callee) || callee.computed || !t.isIdentifier(callee.property)) return;
            const method = callee.property.name;
            if (LOOKUP_METHODS.has(method) && isReactive(callee.object, roots)) {
                if (untracked > 0) return;
                const field = lookupField(call.node.arguments[0]);
                if (field !== null) {
                    warn('MJX004', `"${method}()" looks an item up by "${field}" by scanning a reactive list inside a reactive getter: every run reads that field of every item up to the match, so when many components do this each change costs n² reads. Keep a map keyed by "${field}" (or a computed lookup) and read the item from it, or read the list with untracked(...).`, call, filename);
                }
                return;
            }
            if ((ORDERING_MUTATORS.has(method) || SIZE_MUTATORS.has(method)) && isReactive(callee.object, roots)) {
                skipped.add(callee);
                mutations.push({ at: call, list: callee.object, method, untracked: untracked > 0 });
            }
            },
        },
        AssignmentExpression(assignment) {
            const left = assignment.node.left;
            if (!t.isMemberExpression(left) && !t.isOptionalMemberExpression(left)) return;
            skipped.add(left);
            if (isReactive(left, roots)) writes.push({ at: assignment, target: left, op: assignment.node.operator, untracked: untracked > 0 });
        },
        UpdateExpression(update) {
            const target = update.node.argument;
            if (!t.isMemberExpression(target) && !t.isOptionalMemberExpression(target)) return;
            skipped.add(target);
            if (isReactive(target, roots)) writes.push({ at: update, target, op: update.node.operator, untracked: untracked > 0 });
        },
        MemberExpression(member) {
            readMember(member);
        },
        OptionalMemberExpression(member) {
            readMember(member);
        },
    });
    for (const write of writes) {
        const path = describe(write.target, roots.aliases);
        if ((write.op === '=' || write.untracked) && !readsPath(reads, path)) continue;
        warn('MJX017', `A reactive getter writes "${path}" (${write.op}) and reads it too: a getter that writes what it reads retriggers itself (MJX203 at run time). Move the write into an event handler or a method; if it has to stay, read that value inside untracked(...) so the getter does not subscribe to it (for ++ and compound assignments wrap the whole expression).`, write.at, filename);
    }
    for (const mutation of mutations) {
        const path = describe(mutation.list, roots.aliases);
        if ((SIZE_MUTATORS.has(mutation.method) || mutation.untracked) && !readsPath(reads, path)) continue;
        warn('MJX018', `"${mutation.method}()" changes the reactive list "${path}" in place inside a reactive getter that reads it: the getter retriggers itself. Work on a copy ([...list].${mutation.method}(...)) or keep the result in a field or computed value.`, mutation.at, filename);
    }
}

function attributeName(attr: t.JSXAttribute): string {
    const name = attr.name;
    return t.isJSXNamespacedName(name) ? name.namespace.name + ':' + name.name.name : name.name;
}

function isGetterAttribute(name: string): boolean {
    const lower = name.toLowerCase();
    return !lower.startsWith('on') && !lower.startsWith('x:') && !PLAIN_ATTRIBUTES.has(lower);
}

function reactiveFieldsOf(cls: NodePath<t.Class> | null, scope: NodePath['scope']): Set<string> {
    const fields = new Set<string>();
    if (cls === null) return fields;
    for (const member of cls.node.body.body) {
        if (t.isClassMethod(member) && member.kind === 'constructor') {
            t.traverseFast(member.body, (node) => {
                if (!t.isAssignmentExpression(node) || node.operator !== '=' || !t.isMemberExpression(node.left) || node.left.computed) return;
                if (t.isThisExpression(node.left.object) && t.isIdentifier(node.left.property) && isCoreFactory(node.right, scope)) fields.add(node.left.property.name);
            });
            continue;
        }
        if (!t.isClassProperty(member) || !t.isIdentifier(member.key) || member.computed) continue;
        if (isCoreFactory(member.value, scope)) fields.add(member.key.name);
    }
    return fields;
}

export const reactiveLintPlugin = () => ({
    name: 'motifjs-reactive-lint',
    visitor: {
        Program(program: NodePath<t.Program>, state: any) {
            const filename = String(state.filename ?? state.file?.opts?.filename ?? '');
            const stores = new Set<string>();
            for (const statement of program.get('body')) {
                const declaration = statement.isExportNamedDeclaration() ? statement.get('declaration') : statement;
                if (!declaration.isVariableDeclaration()) continue;
                for (const d of declaration.node.declarations) {
                    if (t.isIdentifier(d.id) && isCoreFactory(d.init, program.scope)) stores.add(d.id.name);
                }
            }
            const fieldsByClass = new Map<t.Node, Set<string>>();
            const getters = new Set<t.Node>();
            const consider = (fn: NodePath<t.Node> | null | undefined) => {
                if (!fn || !isFunction(fn.node) || getters.has(fn.node)) return;
                getters.add(fn.node);
                const cls = fn.findParent((p) => p.isClass()) as NodePath<t.Class> | null;
                let fields = cls === null ? undefined : fieldsByClass.get(cls.node);
                if (fields === undefined) {
                    fields = reactiveFieldsOf(cls, program.scope);
                    if (cls !== null) fieldsByClass.set(cls.node, fields);
                }
                checkGetter(fn, { stores, fields, aliases: new Map() }, filename);
            };
            program.traverse({
                JSXExpressionContainer(container) {
                    const parent = container.parent;
                    if (!t.isJSXElement(parent) && !t.isJSXFragment(parent)) return;
                    consider(container.get('expression') as NodePath<t.Node>);
                },
                JSXAttribute(attr) {
                    if (!isGetterAttribute(attributeName(attr.node))) return;
                    const value = attr.get('value');
                    if (!value.isJSXExpressionContainer()) return;
                    consider(value.get('expression') as NodePath<t.Node>);
                },
                CallExpression(call) {
                    const callee = call.node.callee;
                    if (t.isIdentifier(callee)) {
                        if (GETTER_CALLS.has(callee.name)) consider(call.get('arguments.0') as NodePath<t.Node>);
                        return;
                    }
                    if (!t.isMemberExpression(callee) || callee.computed || !t.isIdentifier(callee.property)) return;
                    const index = BINDING_GETTERS[callee.property.name];
                    if (index === undefined) return;
                    const owner = callee.object;
                    if (!t.isMemberExpression(owner) || !t.isIdentifier(owner.property) || owner.property.name !== 'bindings') return;
                    consider(call.get(`arguments.${index}`) as NodePath<t.Node>);
                },
            });
        },
    },
});
