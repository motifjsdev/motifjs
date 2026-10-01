import * as t from "@babel/types";
import { NodePath } from "@babel/traverse";

export const ASYNC_TRACKING_LOCAL = '__motifAsyncTracking';

export function isVirtualizationDataRequest(path: NodePath<t.JSXAttribute>): boolean {
    const attr = path.node;
    if (!t.isJSXIdentifier(attr.name) || attr.name.name !== 'dataRequest') return false;
    const opening = path.parentPath;
    if (!opening || !t.isJSXOpeningElement(opening.node)) return false;
    const name = opening.node.name;
    if (t.isJSXIdentifier(name)) return name.name === 'Virtualization';
    if (t.isJSXMemberExpression(name)) return name.property.name === 'Virtualization';
    return false;
}

export function wrapAwaitsForTracking(fn: NodePath<t.ArrowFunctionExpression | t.FunctionExpression>): boolean {
    if (!fn.node.async) return false;

    const token = fn.scope.generateUidIdentifier('mt');
    const call = (method: string, args: t.Expression[]) =>
        t.callExpression(t.memberExpression(t.identifier(ASYNC_TRACKING_LOCAL), t.identifier(method)), args);

    const wrapped = new WeakSet<t.Node>();
    let count = 0;
    fn.traverse({
        Function(inner) {
            inner.skip();
        },
        AwaitExpression: {
            exit(p) {
                if (wrapped.has(p.node)) return;
                const awaited = t.awaitExpression(call('suspend', [t.cloneNode(token), p.node.argument]));
                wrapped.add(awaited);
                p.replaceWith(call('resume', [t.cloneNode(token), awaited]));
                count++;
            },
        },
    });
    if (count === 0) return false;

    const body = fn.node.body;
    const statements = t.isBlockStatement(body) ? body.body : [t.returnStatement(body)];
    fn.node.body = t.blockStatement([
        t.variableDeclaration('const', [t.variableDeclarator(token, call('capture', []))]),
        t.tryStatement(
            t.blockStatement(statements),
            null,
            t.blockStatement([t.expressionStatement(call('end', [t.cloneNode(token)]))]),
        ),
    ]);
    return true;
}
