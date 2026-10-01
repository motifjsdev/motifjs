import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';

import { motifComponent, State } from './constants';
import { fail } from './diagnostics';

export const makeHtmlAttr = (prop: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
    name: string,
    value: t.Expression | t.ObjectMethod,
    path: NodePath<t.JSXElement>
): t.ObjectProperty | null => {
    if (t.isStringLiteral(value) && value !== null) {
        return t.objectProperty(t.stringLiteral(name), value);
    } else if (t.isBooleanLiteral(value)) {
        return t.objectProperty(t.stringLiteral(name), value || t.booleanLiteral(true));
    } else if (t.isArrowFunctionExpression(value) && value !== null) {
        var el;
        if (t.isBlockStatement(value.body)) {
            el = t.functionExpression(null, value.params, value.body);
        } else {
            el = t.functionExpression(null, value.params, t.blockStatement([t.returnStatement(value.body)]));
        }
        return t.objectProperty(t.stringLiteral(name), value);
    } else if (t.isFunctionExpression(value)) {
        return t.objectProperty(t.stringLiteral(name), value);
    } else {
        if (value != null) {
            if (t.isCallExpression(value) && t.isIdentifier(value.callee)) {
                if (value.callee.name !== 'motifComponent' && value.callee.name !== motifComponent()) {
                    return t.objectProperty(t.stringLiteral(name), value);
                }
            } else if (t.isIdentifier(value)) {
                return t.objectProperty(t.stringLiteral(name), value);

            } else if (t.isUnaryExpression(value) && !t.isLiteral(value.argument)) {
                return t.objectProperty(t.stringLiteral(name), t.arrowFunctionExpression([], value));
            } else if (t.isExpression(value)) {
                return t.objectProperty(t.stringLiteral(name), returnIfStatement(value, false));
            }
        }

    }
    return null;
}

function isStringLike(node: t.Node): node is t.StringLiteral | t.TemplateLiteral {
    return t.isStringLiteral(node) || t.isTemplateLiteral(node);
}

function extractStringValue(node: t.StringLiteral | t.TemplateLiteral): string {
    if (t.isStringLiteral(node)) return node.value;
    return node.quasis.map(q => q.value.raw).join('${}');
}


export const mergeHtmlAttributes = (htmlAttrlist: t.ObjectProperty[]): t.ExpressionStatement[] => {
    const htmlProps: t.ExpressionStatement[] = [];
    if (htmlAttrlist.length > 0) {
        var totalAttr: t.ObjectProperty[] = [];
        var totalClass: t.ObjectProperty[] = [];
        var totalBindClass: t.Expression[] = [];
        var totalStringClass: t.Expression[] = [];
        htmlAttrlist.forEach(attr => {
            if (t.isStringLiteral(attr.key) || t.isTemplateLiteral(attr.key)) {
                const keyValue = t.isStringLiteral(attr.key)
                    ? attr.key.value.toLowerCase()
                    : attr.key.quasis.map(q => q.value.raw).join("").toLowerCase();

                if (keyValue === "class" || keyValue === "classname") {
                    if (t.isObjectExpression(attr.value)) {
                        const objectProperties: t.ObjectProperty[] = [];

                        attr.value.properties.forEach(p => {
                            if (t.isObjectProperty(p)) {
                                const val = p.value;

                                if (t.isStringLiteral(val)) {
                                    totalStringClass.push(p.key as t.StringLiteral);
                                } else if (t.isBooleanLiteral(val)) {
                                    totalStringClass.push(p.key as t.StringLiteral);
                                } else if (t.isFunctionExpression(val) || t.isArrowFunctionExpression(val)) {
                                    objectProperties.push(p);
                                } else if (t.isTemplateLiteral(val)) {
                                    if (val.expressions.length === 0) {
                                        totalStringClass.push(
                                            t.stringLiteral(val.quasis.map(q => q.value.raw).join(""))
                                        );
                                    } else {
                                        totalBindClass.push(t.arrowFunctionExpression([], val));
                                    }
                                } else {
                                    totalClass.push(p);
                                }
                            } else if (t.isFunctionExpression(p) || t.isArrowFunctionExpression(p)) {
                                totalBindClass.push(p);
                            }
                        });

                        if (objectProperties.length > 0) {
                            totalBindClass.push(t.objectExpression(objectProperties));
                        }
                    } else if (t.isMemberExpression(attr.value) || t.isCallExpression(attr.value)) {
                        totalBindClass.push(attr.value);
                    } else if (t.isFunctionExpression(attr.value) || t.isArrowFunctionExpression(attr.value)) {
                        totalBindClass.push(attr.value);
                    } else if (t.isIdentifier(attr.value)) {
                        totalBindClass.push(attr.value);
                    } else if (t.isStringLiteral(attr.value)) {
                        totalStringClass.push(t.stringLiteral(attr.value.value));
                    } else if (t.isTemplateLiteral(attr.value)) {
                        if (attr.value.expressions.length === 0) {
                            totalStringClass.push(
                                t.stringLiteral(attr.value.quasis.map(q => q.value.raw).join(""))
                            );
                        } else {
                            totalBindClass.push(t.arrowFunctionExpression([], attr.value));
                        }
                    } else if (t.isArrayExpression(attr.value)) {
                        attr.value.elements.forEach(element => {
                            if (!element) return;

                            if (t.isObjectExpression(element)) {
                                element.properties.forEach(p => {
                                    if (t.isObjectProperty(p)) {
                                        const val = p.value;
                                        if (t.isStringLiteral(val)) {
                                            totalStringClass.push(p.key as t.StringLiteral);
                                        } else if (t.isBooleanLiteral(val)) {
                                            totalStringClass.push(p.key as t.StringLiteral);
                                        } else if (t.isFunctionExpression(val) || t.isArrowFunctionExpression(val)) {
                                            totalBindClass.push(val);
                                        } else if (t.isTemplateLiteral(val)) {
                                            if (val.expressions.length === 0) {
                                                totalStringClass.push(
                                                    t.stringLiteral(val.quasis.map(q => q.value.raw).join(""))
                                                );
                                            } else {
                                                totalBindClass.push(t.arrowFunctionExpression([], val));
                                            }
                                        } else {
                                            totalClass.push(p);
                                        }
                                    } else if (t.isFunctionExpression(p) || t.isArrowFunctionExpression(p)) {
                                        totalBindClass.push(p);
                                    }
                                });
                            } else if (t.isStringLiteral(element)) {
                                totalStringClass.push(element);
                            } else if (t.isTemplateLiteral(element)) {
                                if (element.expressions.length === 0) {
                                    totalStringClass.push(
                                        t.stringLiteral(element.quasis.map(q => q.value.raw).join(""))
                                    );
                                } else {
                                    totalBindClass.push(t.arrowFunctionExpression([], element));
                                }
                            } else if (t.isFunctionExpression(element) || t.isArrowFunctionExpression(element)) {
                                totalBindClass.push(element);
                            }
                        });
                    }
                } else if (keyValue === "style") {
                    if (t.isObjectExpression(attr.value)) {
                        htmlProps.push(
                            t.expressionStatement(
                                t.callExpression(t.identifier("sender.style"), [attr.value])
                            )
                        );
                    } else if (t.isStringLiteral(attr.value)) {
                        htmlProps.push(
                            t.expressionStatement(
                                t.callExpression(t.identifier("sender.style"), [attr.value])
                            )
                        );
                    } else if (t.isTemplateLiteral(attr.value)) {
                        if (attr.value.expressions.length === 0) {
                            htmlProps.push(
                                t.expressionStatement(
                                    t.callExpression(
                                        t.identifier("sender.style"),
                                        [t.stringLiteral(attr.value.quasis.map(q => q.value.raw).join(""))]
                                    )
                                )
                            );
                        } else {
                            htmlProps.push(
                                t.expressionStatement(
                                    t.callExpression(
                                        t.identifier("sender.style"),
                                        [t.arrowFunctionExpression([], attr.value)]
                                    )
                                )
                            );
                        }
                    } else if (t.isExpression(attr.value)) {
                        htmlProps.push(
                            t.expressionStatement(
                                t.callExpression(t.identifier("sender.style"), [attr.value])
                            )
                        );
                    }
                } else if (keyValue === 'checked' || keyValue === 'value' || keyValue === 'selected') {
                    const val = attr.value;
                    if (t.isArrowFunctionExpression(val) || t.isExpression(val)) {
                        htmlProps.push(t.expressionStatement(t.callExpression(t.identifier('sender.bindings.add'), [t.stringLiteral(keyValue), val])));
                    }

                } else {
                    let keyName: t.StringLiteral;

                    if (t.isStringLiteral(attr.key)) {
                        keyName = t.stringLiteral(attr.key.value);
                    } else if (t.isTemplateLiteral(attr.key)) {
                        keyName = t.stringLiteral(attr.key.quasis.map(q => q.value.raw).join(""));
                    } else {
                        keyName = t.stringLiteral("unknown");
                    }

                    let valueExpr: t.Expression;
                    const val = attr.value;

                    if (t.isStringLiteral(val)) {
                        valueExpr = val;
                    } else if (t.isTemplateLiteral(val)) {
                        valueExpr =
                            val.expressions.length === 0
                                ? t.stringLiteral(val.quasis.map(q => q.value.raw).join(""))
                                : t.arrowFunctionExpression([], val);
                    } else if (
                        t.isObjectExpression(val) ||
                        t.isCallExpression(val) ||
                        t.isArrowFunctionExpression(val) ||
                        t.isMemberExpression(val) ||
                        t.isIdentifier(val)
                    ) {
                        valueExpr = val;
                    } else if (t.isExpression(val)) {
                        valueExpr = val;
                    } else {
                        valueExpr = t.stringLiteral("");
                    }

                    totalAttr.push(t.objectProperty(keyName, valueExpr));
                }
            }
        })


        if (totalAttr.length > 0) {
            htmlProps.push(t.expressionStatement(t.callExpression(t.identifier('sender.attr.add'), [t.objectExpression(totalAttr)])));
        }
        if (totalBindClass.length > 0) {
            htmlProps.push(t.expressionStatement(t.callExpression(t.identifier('sender.class.add'), [t.arrayExpression(totalBindClass)])));
        }
        if (totalClass.length > 0) {
            htmlProps.push(t.expressionStatement(t.callExpression(t.identifier('sender.class.add'), [t.objectExpression(totalClass)])));
        }
        if (totalStringClass.length > 0) {
            htmlProps.push(t.expressionStatement(t.callExpression(t.identifier('sender.class.add'), [...totalStringClass])));
        }
    }

    return htmlProps;
}

export const makeHtmlEvents = (prop: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
    name: string,
    value: t.Expression | t.ObjectMethod,
    path: NodePath<t.JSXElement>
): t.CallExpression | null => {
    if (!t.isStringLiteral(value) && !t.isBooleanLiteral(value) && value !== null) {
        if (t.isArrowFunctionExpression(value)) {
            var el;
            if (t.isBlockStatement(value.body)) {
                el = t.arrowFunctionExpression(value.params, value.body);
            } else {
                el = t.arrowFunctionExpression(value.params, t.blockStatement([t.returnStatement(value.body)]));
            }
            var evName = name.toLowerCase().replace("on", '').replace('doubleclick', 'dblclick');

            return t.callExpression(t.identifier("sender.motif.on"), [t.stringLiteral(evName), el]);
        } else if (t.isFunctionExpression(value)) {
            var el;
            if (t.isBlockStatement(value.body)) {
                el = t.functionExpression(null, value.params, value.body);
            } else {
                el = t.functionExpression(null, value.params, t.blockStatement([t.returnStatement(value.body)]));
            }
            var evName = name.toLowerCase().replace("on", '').replace('doubleclick', 'dblclick');

            return t.callExpression(t.identifier("sender.motif.on"), [t.stringLiteral(evName), el]);
        }
        else {
            if (t.isExpression(value)) {
                var evName = name.toLowerCase().replace("on", '').replace('doubleclick', 'dblclick');
                return t.callExpression(t.identifier("sender.motif.on"), [t.stringLiteral(evName), value]);
            }

        }
    } else {
        fail('MJX009', `Event handler "${name}" must be a function; string and boolean values are not allowed.`, prop);
    }
    return null;
}

export const makeGlobalEvents = (prop: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
    name: string,
    value: t.Expression | t.ObjectMethod,
    path: NodePath<t.JSXElement>
): t.CallExpression | null => {
    if (!t.isStringLiteral(value) && !t.isBooleanLiteral(value) && value !== null) {
        if (t.isArrowFunctionExpression(value)) {
            var el;
            if (t.isBlockStatement(value.body)) {
                el = t.functionExpression(null, value.params, value.body);
            } else {
                el = t.functionExpression(null, value.params, t.blockStatement([t.returnStatement(value.body)]));
            }
            var evName = name.toLowerCase().replace("on-", '').replace('on:', '').replace('on_', '');

            return t.callExpression(t.identifier("sender.motif.on"), [t.stringLiteral(evName), el]);
        } else {
            if (t.isExpression(value)) {
                var evName = name.toLowerCase().replace("on", '').replace('doubleclick', 'dblclick');
                return t.callExpression(t.identifier("sender.motif.on"), [t.stringLiteral(evName), value]);
            }

        }
    } else {
        fail('MJX009', `Event handler "${name}" must be a function; string and boolean values are not allowed.`, prop);
    }
    return null;
}

export const makeComponentTraps = (prop: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
    name: string,
    value: t.Expression | t.ObjectMethod,
    path: NodePath<t.JSXElement>
): t.ObjectProperty | null => {
    if (t.isFunctionExpression(value) ||
        t.isArrowFunctionExpression(value) && value !== null ||
        t.isObjectExpression(value) ||
        t.isMemberExpression(value) ||
        t.isObjectMethod(value) ||
        t.isIdentifier(value)) {

        if (t.isExpression(value)) {
            return t.objectProperty(t.identifier(name), value);
        } else {
            return null;
        }

    } else {
        fail('MJX010', `Lifecycle hook "${name}" must be a function, an object, or a reference to one.`, prop);
        return null;
    }
}


export const SUPPORTED_DIRECTIVES = ['wait', 'display', 'model', 'text', 'html', 'value', 'watch'] as const;
export const UNSUPPORTED_DIRECTIVES = new Set(['reload', 'bind', 'effect', 'focus', 'interrupt', 'to', 'list', 'loop']);
const directiveNames = new Set<string>(SUPPORTED_DIRECTIVES);

export function supportedDirectivesText(): string {
    return [...SUPPORTED_DIRECTIVES, 'style', 'ref', 'key'].map(d => 'x-' + d).join(', ') + ' and the lifecycle hooks (x-mounted, x-built, x-disposed, …)';
}

const ParentIfStatement = (path: t.Expression | t.BlockStatement, state: any[]): any[] => {
    if (t.isExpression(path)) {
        state.push(path)
    } else {

    }
    if (t.isFunctionExpression(path)) {
        state = ParentIfStatement(path.body, state);
    } else if (t.isArrowFunctionExpression(path)) {
        state = ParentIfStatement(path.body, state);
    } else if (t.isObjectExpression(path)) {

    } else if (t.isMemberExpression(path)) {

        state = ParentIfStatement(path.object, state);
    } else if (t.isObjectMethod(path)) {


    } else if (t.isIdentifier(path)) {

    } else if (t.isCallExpression(path)) {

        if (t.isExpression(path.callee)) {
            state = ParentIfStatement(path.callee, state);
        }
    } else {

    }

    return state;
}

export const returnIfStatement = (value: any, enableDefaultreturn: boolean = true, defaultLiteral: any = t.booleanLiteral(false)): any => {
    var ifStatement = findIfStatements(value);
    var mx = t.binaryExpression('===', t.unaryExpression('typeof', value), t.stringLiteral('function'));
    var rtrn;

    if (t.isLogicalExpression(value)) {
        rtrn = t.returnStatement(value);
        if (enableDefaultreturn) {
            return t.arrowFunctionExpression([], t.blockStatement([rtrn, t.returnStatement(defaultLiteral)]));
        } else {
            return t.arrowFunctionExpression([], t.blockStatement([rtrn]));
        }

    } else if (t.isMemberExpression(value) || t.isIdentifier(value)) {
        rtrn = t.returnStatement(value);
        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
        if (enableDefaultreturn) {
            return t.arrowFunctionExpression([], t.blockStatement([rtrns, t.returnStatement(defaultLiteral)]));
        } else {
            return t.arrowFunctionExpression([], t.blockStatement([rtrns]));
        }

    } else if (t.isFunctionExpression(value)) {
        rtrn = t.returnStatement(value);
        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
        if (enableDefaultreturn) {
            return t.arrowFunctionExpression([], t.blockStatement([rtrns, t.returnStatement(defaultLiteral)]));
        } else {
            return t.arrowFunctionExpression([], t.blockStatement([rtrns]));
        }
        return value;
    } else if (t.isBinaryExpression(value)) {
        var ifStatementA = findIfStatements(value.left as any);
        var ifStatementB = findIfStatements(value.right);
        var le = t.logicalExpression('&&', ifStatementA, ifStatementB);
        rtrn = t.returnStatement(value);
        if (enableDefaultreturn) {
            return t.arrowFunctionExpression([], t.blockStatement([t.ifStatement(le, t.blockStatement([rtrn])), t.returnStatement(defaultLiteral)]));
        } else {
            return t.arrowFunctionExpression([], t.blockStatement([t.ifStatement(le, t.blockStatement([rtrn]))]));
        }

    } else if (t.isCallExpression(value)) {

        rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(value, []), value));
        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
        if (enableDefaultreturn) {
            return t.arrowFunctionExpression([], t.blockStatement([rtrns, t.returnStatement(defaultLiteral)]));
        } else {
            return t.arrowFunctionExpression([], t.blockStatement([rtrns]));
        }

    } else {
        return value;
    }


}
export const findIfStatements = (value: t.Expression): any => {
    var ifs: any[] = [];
    if (t.isExpression(value)) {

        ifs = ParentIfStatement(value, ifs);
    }

    if (ifs.length == 1) {
        ifs[0] = t.logicalExpression('&&', t.binaryExpression('!==', ifs[0], t.nullLiteral()), t.binaryExpression('!==', ifs[0], t.identifier('undefined')))
    }

    const setRight = (l: t.Expression, x: t.Expression, current: number) => {
        if (t.isLogicalExpression(l) && t.isNullLiteral(l.right)) {
            l.right = x;
        } else {
            if (t.isLogicalExpression(l)) {
                setRight(l.right, x, current)
            }
        }
    }

    ifs.reverse();
    var ifStatement: t.LogicalExpression | t.Expression = null as any;
    var indexer = 0;

    if (ifs.length > 1) {
        ifs.forEach((ttt, index) => {
            if (!t.isArrowFunctionExpression(ttt) || !t.isFunctionExpression(ttt)) {
                if (ifStatement) {
                    setRight(ifStatement, t.logicalExpression('&&', ttt, t.nullLiteral()), index)
                } else {
                    ifStatement = t.logicalExpression('&&', ttt, t.nullLiteral());
                }
            } else {
                ifStatement = ttt;
            }
        })
    } else {
        ifStatement = ifs[0];
    }

    const latestRightFind = (x: t.LogicalExpression, p: t.LogicalExpression) => {
        if (t.isLogicalExpression(x)) {
            if (t.isNullLiteral(x.right)) {
                if (p === null) {
                    x.right = x.left;
                } else {
                    p.right = t.logicalExpression('&&', t.binaryExpression('!==', (x as t.LogicalExpression).left, t.nullLiteral()), t.binaryExpression('!==', (x as t.LogicalExpression).left, t.identifier('undefined')));
                }
            } else {

                latestRightFind(x.right as t.LogicalExpression, x)
            }
        }
    }

    if (ifStatement && t.isLogicalExpression(ifStatement)) {
        latestRightFind(ifStatement, null as any);
        if (t.isArrowFunctionExpression(ifStatement.right)) {
            {
                ifStatement = ifStatement.left;
            }
        }
    }

    return ifStatement;
}
export const makeDirectives = (prop: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
    name: string,
    value: t.Expression | t.ObjectMethod,
    path: NodePath<t.JSXElement>,
    state: State
): t.ExpressionStatement | null => {
    var result = null as any;
    if (value != null) {
        var clearedName = name.toLowerCase().replace("x:", "").replace("x-", "").replace("on:", "");

        var callerName = `sender.bindings.${clearedName}`;
        if (directiveNames.has(clearedName)) {
            if (clearedName !== 'wait') {
                findIfStatements(value as any);

                if (t.isFunctionExpression(value) ||
                    t.isArrowFunctionExpression(value) && value !== null ||
                    t.isObjectExpression(value) ||
                    t.isMemberExpression(value) ||
                    t.isObjectMethod(value) ||
                    t.isIdentifier(value) ||
                    t.isCallExpression(value) && value !== null) {
                    if (t.isFunctionExpression(value)) {
                        result = t.expressionStatement(t.callExpression(t.identifier(callerName), [value]));
                    } else if (t.isArrowFunctionExpression(value)) {
                        var el;
                        if (t.isBlockStatement(value.body)) {
                            var kx = t.functionExpression(null, [], value.body);
                            el = t.expressionStatement(t.callExpression(t.identifier(callerName), [kx]));
                        } else {
                            if (t.isStringLiteral(value.body)) {
                                var rtrn = t.returnStatement(value.body);
                                var kx = t.functionExpression(null, [], t.blockStatement([rtrn]));
                                el = t.expressionStatement(t.callExpression(t.identifier(callerName), [kx]));
                            } else {
                                el = t.expressionStatement(t.callExpression(t.identifier(callerName), [returnIfStatement(value, false)]));
                            }

                        }
                        result = el;

                    } else {
                        if (t.isExpression(value)) {
                            result = t.expressionStatement(t.callExpression(t.identifier(callerName), [returnIfStatement(value, false)]));
                        }
                    }

                } else if (t.isBinaryExpression(value)) {
                    result = t.expressionStatement(t.callExpression(t.identifier(callerName), [returnIfStatement(value, false, t.booleanLiteral(false))]));
                } else {
                    fail('MJX011', `Directive "${name}" does not accept this value; pass a function, an object, or a reference to one.`, prop);
                }
            }
        }
        if (result && clearedName === 'model') {
            const setter = buildModelSetter(value, path);
            if (setter) (result.expression as t.CallExpression).arguments.push(setter);
        }
    }
    return result;
}

function unwrapTypeWrappers(node: t.Node | null | undefined): t.Node | null | undefined {
    let current = node;
    while (current && (
        t.isTSNonNullExpression(current) ||
        t.isTSAsExpression(current) ||
        t.isTSSatisfiesExpression(current) ||
        t.isTSTypeAssertion(current) ||
        t.isTypeCastExpression(current) ||
        t.isParenthesizedExpression(current))) {
        current = current.expression;
    }
    return current;
}

export function modelTargetOf(value: t.Node): t.MemberExpression | t.OptionalMemberExpression | null {
    let expression: t.Node | null | undefined = value;
    if (t.isArrowFunctionExpression(value)) {
        if (value.params.length > 0 || value.async) return null;
        if (t.isBlockStatement(value.body)) {
            const statements = value.body.body;
            if (statements.length !== 1 || !t.isReturnStatement(statements[0])) return null;
            expression = statements[0].argument;
        } else {
            expression = value.body;
        }
    }
    expression = unwrapTypeWrappers(expression);
    if (!expression) return null;
    if (!t.isMemberExpression(expression) && !t.isOptionalMemberExpression(expression)) return null;
    if (t.isPrivateName(expression.property) || t.isSuper(expression.object)) return null;
    return expression;
}

export function buildModelSetter(value: t.Node, path: NodePath<t.JSXElement>): t.ArrowFunctionExpression | null {
    const target = modelTargetOf(value);
    if (!target) return null;
    const valueId = path.scope.generateUidIdentifier('value');
    const ownerId = path.scope.generateUidIdentifier('owner');
    const owner = t.cloneNode(target.object as t.Expression, true);
    const member = () => t.memberExpression(t.cloneNode(ownerId), t.cloneNode(target.property as t.Expression, true), target.computed);
    const ownerMissing = t.logicalExpression('||',
        t.binaryExpression('===', t.cloneNode(ownerId), t.nullLiteral()),
        t.binaryExpression('===', t.cloneNode(ownerId), t.identifier('undefined')));
    const holdsGetter = t.binaryExpression('===', t.unaryExpression('typeof', member()), t.stringLiteral('function'));
    return t.arrowFunctionExpression([valueId], t.blockStatement([
        t.variableDeclaration('const', [t.variableDeclarator(ownerId, owner)]),
        t.ifStatement(t.logicalExpression('||', ownerMissing, holdsGetter), t.returnStatement()),
        t.expressionStatement(t.assignmentExpression('=', member(), t.cloneNode(valueId)))
    ]));
}

export const makePreDirectives = (prop: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
    name: string,
    value: t.Expression | t.ObjectMethod,
    path: NodePath<t.JSXElement>
): t.ExpressionStatement | null => {
    var result = null as any;
    if (value != null) {
        var clearedName = name.toLowerCase().replace("x:", "").replace("x-", "").replace("on:", "");
        var callerName = `sender.bindings.${clearedName}`;

        if (clearedName === 'wait' || clearedName === 'display') {
            if (t.isObjectExpression(value)) {
                fail('MJX012', `Directive "${name}" does not accept an object literal.`, prop);
            } else if (t.isExpression(value)) {
                result = t.expressionStatement(t.callExpression(t.identifier(callerName), [returnIfStatement(value, true, t.booleanLiteral(true))]));
            }
        } else {
            fail('MJX006', `Directive "${name}" is not supported. Supported: ${supportedDirectivesText()}.`, prop);
        }

    }
    return result;
}