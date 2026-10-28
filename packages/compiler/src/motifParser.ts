import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
import htmlTags from 'html-tags';

import { htmlAttributes, htmlEvents } from './htmlAtributes';
import svgTags from 'svg-tags';

import { assertLifecycleValue, cacheGuardCalls, findIfStatements, FORM_ACTION_ATTRS, makeComponentTraps, makeDirectives, makeHtmlAttr, makeHtmlEvents, makePreDirectives, mergeHtmlAttributes, returnIfStatement, SUPPORTED_DIRECTIVES, UNSUPPORTED_DIRECTIVES, supportedDirectivesText } from './propBuilder';
import { motifComponent, motifFragment, State, motifFunctionComponent, motifReport } from './constants';
import { warn as diagWarn, fail } from './diagnostics';
import { noteOrigin, transferOrigin, explainAt, explainChild, describeTextNode, codeOf, DEPS, isExplaining, type ExplainReactivity } from './explain';
const FRAGMENT = 'Fragment';

type RefTargetKind = 'call' | 'assign' | 'runtime';

const isFunctionNode = (n: t.Node | null | undefined): boolean =>
    !!n && (t.isArrowFunctionExpression(n) || t.isFunctionExpression(n));

const isPlainValueNode = (n: t.Node | null | undefined): boolean =>
    !n || t.isLiteral(n) || t.isObjectExpression(n) || t.isArrayExpression(n) || t.isNewExpression(n) || t.isClassExpression(n);

function enclosingClassOfThis(path: NodePath): NodePath<t.ClassDeclaration | t.ClassExpression> | null {
    let cur: NodePath | null = path.parentPath;
    while (cur) {
        if (cur.isClassDeclaration() || cur.isClassExpression()) return cur;
        if (cur.isFunctionDeclaration() || cur.isFunctionExpression() || cur.isObjectMethod()) return null;
        cur = cur.parentPath;
    }
    return null;
}

const classMemberKinds = new WeakMap<t.Node, Map<string, RefTargetKind>>();

function memberKindsOf(cls: t.ClassDeclaration | t.ClassExpression): Map<string, RefTargetKind> {
    const kinds = new Map<string, RefTargetKind>();
    for (const m of cls.body.body) {
        if (!t.isClassMethod(m) && !t.isClassProperty(m)) continue;
        if (m.computed) continue;
        const key = t.isIdentifier(m.key) ? m.key.name : t.isStringLiteral(m.key) ? m.key.value : null;
        if (key === null || key === 'constructor' || kinds.has(key)) continue;
        if (t.isClassMethod(m)) {
            kinds.set(key, m.kind === 'method' ? 'call' : 'runtime');
            continue;
        }
        const ann = t.isTSTypeAnnotation(m.typeAnnotation) ? m.typeAnnotation.typeAnnotation : null;
        if (isFunctionNode(m.value)) kinds.set(key, 'call');
        else if (ann && t.isTSFunctionType(ann)) kinds.set(key, 'runtime');
        else kinds.set(key, isPlainValueNode(m.value) ? 'assign' : 'runtime');
    }
    return kinds;
}

export function recordClassMembers(program: NodePath<t.Program>): void {
    program.traverse({
        Class(path) {
            classMemberKinds.set(path.node, memberKindsOf(path.node));
        }
    });
}

function classMemberKind(cls: NodePath<t.ClassDeclaration | t.ClassExpression>, name: string): RefTargetKind {
    const kinds = classMemberKinds.get(cls.node) ?? memberKindsOf(cls.node);
    return kinds.get(name) ?? 'runtime';
}

function refTargetKind(prop: NodePath<t.JSXAttribute>, value: t.Expression): RefTargetKind {
    if (t.isMemberExpression(value) && t.isThisExpression(value.object) && !value.computed && t.isIdentifier(value.property)) {
        const cls = enclosingClassOfThis(prop);
        return cls ? classMemberKind(cls, value.property.name) : 'runtime';
    }
    if (t.isIdentifier(value)) {
        const binding = prop.scope.getBinding(value.name);
        if (!binding) return 'runtime';
        const node = binding.path.node;
        if (t.isFunctionDeclaration(node)) return 'call';
        if (t.isVariableDeclarator(node)) {
            if (!node.init) return 'assign';
            if (isFunctionNode(node.init) && binding.constant) return 'call';
        }
        return 'runtime';
    }
    return 'runtime';
}


const componentEvents = new Set(['oncreating', 'onconfig', 'onconfigured', 'oncreated', 'onbuilding', 'onbuilt', 'onmounted', 'oninitializing', 'oninitialized', 'onactivated', 'ondeactivated', 'onvisibilitychanged', 'ondisposing', 'ondisposed', 'oninitializecomponent']);
function isComponentEvent(name: string): boolean {
    return componentEvents.has(name);
}
function isContextHandler(name: string) {
    return name.toLowerCase().startsWith("on-") || name.toLowerCase().startsWith("on:") || name.toLowerCase().startsWith("on_");
}

function cannotBeNumber(value: t.Node): boolean {
    return t.isStringLiteral(value) || t.isBooleanLiteral(value) || t.isNullLiteral(value) || t.isObjectExpression(value) || t.isArrayExpression(value)
        || t.isTemplateLiteral(value) || t.isArrowFunctionExpression(value) || t.isFunctionExpression(value) || t.isJSXElement(value) || t.isJSXFragment(value);
}

function isDirective(name: string) {
    return name.toLowerCase().startsWith("x-") || name.toLowerCase().startsWith("x:");
}

const LIFECYCLE_HOOKS = new Set(['built', 'building', 'mounted', 'config', 'configured', 'initializing', 'initialized', 'disposing', 'disposed', 'visibilitychanged', 'activated', 'deactivated']);
function lifecycleHookOf(name: string): string | null {
    const lower = name.toLowerCase();
    let hook: string | null = null;
    if (lower.startsWith('x-') || lower.startsWith('x:')) hook = lower.slice(2);
    else if (lower.startsWith('on')) hook = lower.slice(2);
    return hook !== null && LIFECYCLE_HOOKS.has(hook) ? hook : null;
}

const HOOK_KEYS: Record<string, string> = {
    built: 'onBuilt', building: 'onBuilding', mounted: 'onMounted', config: 'onConfig', configured: 'onConfigured',
    initializing: 'onInitializing', initialized: 'onInitialized', disposing: 'onDisposing', disposed: 'onDisposed',
    visibilitychanged: 'onVisibilityChanged', activated: 'onActivated', deactivated: 'onDeactivated',
};
function hookKey(name: string): string {
    const hook = lifecycleHookOf(name);
    if (hook !== null) return HOOK_KEYS[hook];
    if (name.toLowerCase() === 'oninitializecomponent') return 'oninitializeComponent';
    return name;
}

function missingListKey(mapper: t.Node | null | undefined): boolean {
    if (!mapper) return false;
    if (!t.isArrowFunctionExpression(mapper) && !t.isFunctionExpression(mapper)) return false;

    let body: t.Node | null | undefined = (mapper as any).body;
    if (t.isBlockStatement(body as any)) {
        const ret = (body as t.BlockStatement).body.find(st => t.isReturnStatement(st)) as t.ReturnStatement | undefined;
        body = ret?.argument;
    }
    while (body && t.isParenthesizedExpression(body as any)) body = (body as any).expression;

    if (!body || !t.isCallExpression(body)) return false;
    if (!t.isIdentifier(body.callee) || body.callee.name !== motifComponent()) return false;

    const propsArg = body.arguments.length > 1 ? body.arguments[1] : body.arguments[0];
    if (!propsArg || !t.isObjectExpression(propsArg)) return false;
    if (propsArg.properties.some(p => t.isSpreadElement(p))) return false;

    const hasKey = propsArg.properties.some(p => {
        if (!t.isObjectProperty(p)) return false;
        const n = t.isIdentifier(p.key) ? p.key.name : (t.isStringLiteral(p.key) ? p.key.value : '');
        return n === 'indexkey' || n === 'key';
    });
    return !hasKey;
}


function startAttr(v: string) {
    if (v.includes("-")) {
        return true;
    }
    return false;
}

export function getAttributeName(attribute: NodePath<t.JSXAttribute>): string {
    const label = attribute.node.name;
    return t.isJSXNamespacedName(label) ? label.namespace.name + ':' + label.name.name : label.name;
}

export function getAttributeValue(attribute: NodePath<t.JSXAttribute>, state: State, componentProp = false): t.StringLiteral | t.Expression | t.CallExpression | t.ObjectMethod | null {
    const slot = attribute.get('value') as NodePath<t.JSXAttribute['value']>;
    switch (slot.node?.type) {
        case 'JSXElement':
            return ParseComponent(slot as NodePath<t.JSXElement>, state);
        case 'StringLiteral':
            return slot.node;
        case 'JSXExpressionContainer':
            return transformJSXExpressionContainer(slot as NodePath<t.JSXExpressionContainer>, state, componentProp);
        default:
            return null;
    }
}

function switchBranchContent(argument: t.Expression): t.Expression {
    const empty = () => t.callExpression(t.identifier(motifFragment()), []);
    if (t.isNullLiteral(argument) || (t.isIdentifier(argument) && argument.name === 'undefined') || t.isUnaryExpression(argument, { operator: 'void' })) return empty();
    if (t.isCallExpression(argument) && t.isIdentifier(argument.callee) && (argument.callee.name === motifComponent() || argument.callee.name === motifFragment())) return argument;
    return t.logicalExpression('??', argument, empty());
}

function collapseJsxWhitespace(raw: string): string {
    const rows = raw.split(/\r\n|\n|\r/);
    const lastRow = rows.length - 1;
    const kept: string[] = [];
    rows.forEach((row, index) => {
        let text = row.replace(/\t/g, ' ');
        if (index > 0) text = text.replace(/^ +/, '');
        if (index < lastRow) text = text.replace(/ +$/, '');
        if (text !== '') kept.push(text);
    });
    return kept.join(' ');
}

export function transformJSXText(text: NodePath<t.JSXText>): t.StringLiteral | null {
    const collapsed = collapseJsxWhitespace(text.node.value);
    return collapsed === '' ? null : t.stringLiteral(collapsed);
}

function memberTagToExpression(tag: t.JSXMemberExpression): t.MemberExpression {
    const segments: string[] = [];
    let head: t.JSXMemberExpression['object'] = tag;
    while (t.isJSXMemberExpression(head)) {
        segments.unshift(head.property.name);
        head = head.object;
    }
    let built: t.Expression = t.isJSXIdentifier(head) ? t.identifier(head.name) : t.nullLiteral();
    for (const segment of segments) {
        built = t.memberExpression(built, t.identifier(segment));
    }
    return built as t.MemberExpression;
}

const isMotifCall = (e: t.Node): boolean =>
    t.isCallExpression(e) && t.isIdentifier(e.callee) && (e.callee.name === motifComponent() || e.callee.name === motifFragment());

const hasMarkupBranch = (node: t.Node): boolean =>
    t.isConditionalExpression(node) ? hasMarkupBranch(node.consequent) || hasMarkupBranch(node.alternate) : isMotifCall(node);

function lowerTernary(expression: t.ConditionalExpression, state: State, scope: any = null): t.CallExpression {
    const frameId = t.identifier('frame');

    const normalize = (e: t.Expression): t.Expression => {
        if (isMotifCall(e)) return e;
        return mkText(e, state);
    };

    const buildBranch = (node: t.Expression): t.Statement[] => {
        if (t.isConditionalExpression(node)) {
            const trueBody = buildBranch(node.consequent);
            const falseBody = buildBranch(node.alternate);
            return [
                t.expressionStatement(
                    t.callExpression(t.identifier('sender.bindings.ternaryCall'), [
                        t.arrowFunctionExpression([], node.test as t.Expression),
                        t.arrowFunctionExpression([], t.blockStatement(trueBody)),
                        t.arrowFunctionExpression([], t.blockStatement(falseBody))
                    ])
                )
            ];
        }
        return [t.expressionStatement(
            t.callExpression(
                t.memberExpression(frameId, t.identifier('navigate')),
                [normalize(node)]
            )
        )];
    };

    const trueFn = t.arrowFunctionExpression([frameId], t.blockStatement(buildBranch(expression.consequent)));
    const falseFn = t.arrowFunctionExpression([frameId], t.blockStatement(buildBranch(expression.alternate)));
    var condFn = scope
        ? t.arrowFunctionExpression([], t.blockStatement([...scope.statements, t.returnStatement(expression.test)]))
        : t.arrowFunctionExpression([], expression.test);
    if (!state.get(motifFragment())) {
        state.set(motifFragment(), motifFragment());
    }

    if (scope) return makeSharedScopeCall('sender.bindings.ternary', scope, [condFn, trueFn, falseFn]);
    return t.callExpression(id('sender.bindings.ternary'), [condFn, trueFn, falseFn]);
}

export function transformJSXExpressionContainer(container: NodePath<t.JSXExpressionContainer>, state?: State, componentProp = false): t.Expression {
    const inner = container.node.expression as t.Expression;
    const lazyAttribute = t.isConditionalExpression(inner) && container.parentPath?.isJSXAttribute();
    if (!lazyAttribute) return inner;
    if (componentProp && state && hasMarkupBranch(inner)) {
        const setup = t.arrowFunctionExpression([id('sender')], t.blockStatement([t.expressionStatement(lowerTernary(inner as t.ConditionalExpression, state))]));
        return t.arrowFunctionExpression([], t.callExpression(id(motifFragment()), [t.objectExpression([t.objectProperty(t.identifier('initializeComponent'), setup)])]));
    }
    return t.arrowFunctionExpression([], inner);
}

const isMarkupTagName = (name: string): boolean =>
    name.includes('-') || name === 'center' || htmlTags.includes(name as htmlTags.htmlTags) || svgTags.includes(name);

export function getTag(element: NodePath<t.JSXElement>): t.Identifier | t.CallExpression | t.StringLiteral | t.MemberExpression {
    const tagPath = element.get('openingElement').get('name');
    const tag = tagPath.node;
    if (t.isJSXIdentifier(tag)) {
        return isMarkupTagName(tag.name) ? t.stringLiteral(tag.name) : t.identifier(tag.name);
    }
    if (t.isJSXMemberExpression(tag)) {
        return memberTagToExpression(tag);
    }
    return fail('MJX013', `Unsupported JSX tag name: ${tagPath.type}.`, tagPath as NodePath<t.Node>);
}

const getProps = (props: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>[], path: NodePath<t.JSXElement>, state: State) => {

    const objectProps: t.ObjectMethod[] = [];
    const objectExpression: t.ObjectProperty[] = [];
    const eventProps: t.ExpressionStatement[] = [];
    const directives: t.ExpressionStatement[] = [];
    const preDirectives: t.ExpressionStatement[] = [];
    const setupProps: t.ObjectProperty[] = [];
    const componentEvents: t.ObjectProperty[] = [];
    let htmlAttrlist: t.ObjectProperty[] = [];
    const thisStatement: t.VariableDeclaration[] = [];
    const spreadProps: t.SpreadElement[] = [];

    const fileName = String(state.get('filename') ?? '');
    const originalCode: string | undefined = state.get('originalCode');

    /** explain kanalı: bu özniteliğin neye indiğini kaydet. */
    const explainProp = (prop: NodePath<any>, site: 'attr' | 'prop' | 'event' | 'directive' | 'component-event' | 'key', shape: string, lowered: t.Node | string | null | undefined, reactive: ExplainReactivity, deps: string, note?: string) =>
        explainAt(prop, fileName, originalCode, { site, shape, lowered, reactive, deps, note });

    /** Bileşen prop'una geçen ifadenin sınıfı. */
    const classifyPropValue = (raw: NodePath<t.JSXAttribute>, value: t.Node): { shape: string; reactive: ExplainReactivity; deps: string; note?: string } => {
        const v = raw.get('value');
        const inner = v.isJSXExpressionContainer() ? v.node.expression : null;
        if (inner && t.isConditionalExpression(inner)) {
            return { shape: 'prop.ternary', reactive: 'receiver', deps: DEPS.receiver,
                note: 'ternary wrapped lazily (by design): the receiving component should declare the prop as Bind<T> and read it with read()/toGetter()' };
        }
        if (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) {
            return { shape: 'prop.getter', reactive: 'receiver', deps: DEPS.receiver };
        }
        if (t.isStringLiteral(value) || t.isNumericLiteral(value) || t.isBooleanLiteral(value) || t.isNullLiteral(value) || (t.isTemplateLiteral(value) && value.expressions.length === 0)) {
            return { shape: 'prop.literal', reactive: 'static', deps: DEPS.none };
        }
        if (t.isCallExpression(value) && t.isIdentifier(value.callee) && value.callee.name === motifComponent()) {
            return { shape: 'prop.element', reactive: 'static', deps: DEPS.none, note: 'JSX-valued prop: the component instance is built once and passed' };
        }
        return { shape: 'prop.value', reactive: 'once', deps: DEPS.once,
            note: 'passed as a value; if the object is a reactive proxy, the receiver stays live by reading its fields inside a getter' };
    };

    const emitsGetter = (statements: t.ExpressionStatement[]): boolean =>
        statements.some(s => t.isCallExpression(s.expression) && s.expression.arguments.some(a =>
            t.isArrowFunctionExpression(a)
            || (t.isArrayExpression(a) && a.elements.some(e => t.isArrowFunctionExpression(e)))
            || (t.isObjectExpression(a) && a.properties.some(p => t.isObjectProperty(p) && t.isArrowFunctionExpression(p.value)))));

    /** DOM özniteliğine yazılan ifadenin sınıfı (makeHtmlAttr'ın gerçek dalları). */
    const classifyAttrValue = (raw: NodePath<t.JSXAttribute>, value: t.Node, emitted: t.ObjectProperty | null, lowered: t.ExpressionStatement[]): { shape: string; reactive: ExplainReactivity; deps: string; note?: string } => {
        const v = raw.get('value');
        const inner = v.isJSXExpressionContainer() ? v.node.expression : null;
        if (t.isStringLiteral(value) || t.isBooleanLiteral(value) || t.isNumericLiteral(value) || t.isNullLiteral(value)
            || (t.isUnaryExpression(value) && t.isLiteral(value.argument))
            || (t.isTemplateLiteral(value) && value.expressions.length === 0)) {
            return { shape: 'attr.literal', reactive: 'static', deps: DEPS.none };
        }
        if (t.isTemplateLiteral(value)) {
            return emitsGetter(lowered)
                ? { shape: 'attr.template', reactive: 'live', deps: DEPS.getter, note: 'template literal wrapped in a getter; re-evaluated when a field read inside it changes' }
                : { shape: 'attr.template', reactive: 'once', deps: DEPS.once, note: 'template literal passed as a string value; wrap it in an arrow function to keep it live' };
        }
        if (inner && t.isConditionalExpression(inner)) {
            return { shape: 'attr.ternary', reactive: 'live', deps: DEPS.getter, note: 'ternary wrapped lazily (by design); attr.add calls the getter inside an effect' };
        }
        if (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) {
            return { shape: 'attr.getter', reactive: 'live', deps: DEPS.getter };
        }
        if (t.isIdentifier(value)) {
            return { shape: 'attr.identifier', reactive: 'runtime', deps: DEPS.runtime };
        }
        if (t.isCallExpression(value) && t.isIdentifier(value.callee)) {
            return { shape: 'attr.call', reactive: 'once', deps: DEPS.once, note: 'a plain function call is passed as a VALUE; write `() => f(x)` to keep it live' };
        }
        const ev = emitted?.value;
        if (ev && (t.isArrowFunctionExpression(ev) || t.isFunctionExpression(ev))) {
            return { shape: 'attr.expr', reactive: 'live', deps: DEPS.getter, note: 'expression wrapped in a guarded getter (nothing is written while an intermediate link is null)' };
        }
        return { shape: 'attr.value', reactive: 'once', deps: DEPS.once };
    };

    const explainAttr = (prop: NodePath<t.JSXAttribute>, atr: t.ObjectProperty, value: t.Node | null, shape?: string) => {
        if (!isExplaining()) return;
        const lowered = mergeHtmlAttributes([atr]);
        const shown = lowered.map(s => codeOf(s.expression)).join('; ');
        if (value === null) {
            explainProp(prop, 'attr', 'attr.flag', shown, 'static', DEPS.none);
            return;
        }
        const lname = t.isStringLiteral(atr.key) ? atr.key.value.toLowerCase() : '';
        if ((lname === 'class' || lname === 'classname') && (t.isObjectExpression(atr.value) || t.isArrayExpression(atr.value))) {
            const live = lowered.some(s => t.isCallExpression(s.expression) && t.isArrayExpression(s.expression.arguments[0]));
            explainProp(prop, 'attr', 'class.object', shown, live ? 'live' : 'static', live ? DEPS.getter : DEPS.none,
                live ? 'each key toggles its class; values other than literals are wrapped in getters' : undefined);
            return;
        }
        if (FORM_ACTION_ATTRS.has(lname) && (t.isArrowFunctionExpression(atr.value) || t.isFunctionExpression(atr.value))) {
            explainProp(prop, 'attr', 'attr.action', shown, 'live', DEPS.getter,
                'form action: the getter result decides on every run — a function is bound as the submit handler (preventDefault; called as fn(formData), or fn(sender, formData) with 2 parameters), a string is written as the URL');
            return;
        }
        const c = classifyAttrValue(prop, value, atr, lowered);
        explainProp(prop, 'attr', shape ?? c.shape, shown, c.reactive, c.deps, c.note);
    };

    /** Etiket bir BİLEŞEN mi (büyük harfle başlıyor ya da üye ifadesi)? */
    const tagIsComponent = (): boolean => {
        if (!t.isJSXElement(path.node)) return false;
        const nameNode = path.node.openingElement.name;
        if (t.isJSXMemberExpression(nameNode)) return true;
        if (!t.isJSXIdentifier(nameNode)) return false;
        const n = nameNode.name;
        return n.length > 0 && n[0].toUpperCase() === n[0] && n !== FRAGMENT;
    };

    /** Değersiz öznitelik (`<Comp flag />`) → `flag: true` prop'u. */
    const pushBooleanProp = (name: string) => {
        const key = (name.includes('-') || name.includes(':'))
            ? t.stringLiteral(name)
            : id(name);
        objectExpression.push(t.objectProperty(key, t.booleanLiteral(true)));
    };

    const plainTag = t.isStringLiteral(getTag(path));
    let userInit: t.Expression | null = null;

    const refEntries: { prop: NodePath<t.JSXAttribute>; lowered: t.Expression }[] = [];
    const pushRef = (prop: NodePath<t.JSXAttribute>, value: t.Expression | t.ObjectMethod) => {
        if (t.isIdentifier(value) || t.isMemberExpression(value)) {
            const kind = refTargetKind(prop, value);
            const callTarget = t.expressionStatement(t.callExpression(t.cloneNode(value), [t.identifier('sender')]));
            const assignTarget = t.expressionStatement(t.assignmentExpression("=", t.cloneNode(value), t.identifier('sender')));
            const refStmt: t.Statement = kind === 'call'
                ? callTarget
                : kind === 'assign'
                    ? assignTarget
                    : t.ifStatement(t.binaryExpression('===', t.unaryExpression('typeof', t.cloneNode(value)), t.stringLiteral('function')), callTarget, assignTarget);
            const body: t.Statement[] = [refStmt];
            if (enclosingClassOfThis(prop)) {
                body.push(t.expressionStatement(t.callExpression(t.identifier('if(this.onRefCreated) this.onRefCreated'), [t.identifier('sender')])));
            }
            refEntries.push({ prop, lowered: t.arrowFunctionExpression([t.identifier('sender')], t.blockStatement(body)) });
        } else if (t.isFunctionExpression(value) || t.isArrowFunctionExpression(value)) {
            refEntries.push({ prop, lowered: t.arrowFunctionExpression(value.params, value.body, value.async) });
        } else if (t.isExpression(value)) {
            var cx = t.expressionStatement(value);
            refEntries.push({ prop, lowered: t.arrowFunctionExpression([t.identifier('sender')], t.blockStatement([cx])) });
        } else {
            objectProps.push(value)
        }
    };

    const hookCounts = new Map<string, number>();
    props.forEach(prop => {
        if (!prop.isJSXAttribute() || prop.node.value == null) return;
        const hook = lifecycleHookOf(getAttributeName(prop));
        if (hook !== null) hookCounts.set(hook, (hookCounts.get(hook) ?? 0) + 1);
    });
    const mergedHooks = new Map<string, { prop: NodePath<t.JSXAttribute>; value: t.Expression }[]>();
    hookCounts.forEach((count, hook) => { if (count > 1) mergedHooks.set(hook, []); });

    if (props.length > 0) {
        props.forEach(prop => {
            if (prop.isSpreadElement()) {
                spreadProps.push(prop);
            } else if (prop.isJSXSpreadChild()) {
                spreadProps.push(prop);
            } else if (prop.isJSXSpreadAttribute()) {
               
                spreadProps.push(t.spreadElement(prop.node.argument));
            }
            else if (prop.isJSXAttribute()) {
                let name = getAttributeName(prop);
                let value = getAttributeValue(prop, state, tagIsComponent());
                const mergedHook = lifecycleHookOf(name);
                if (mergedHook !== null && mergedHooks.has(mergedHook) && value != null) {
                    if (t.isExpression(value)) {
                        assertLifecycleValue(prop, name, value);
                        mergedHooks.get(mergedHook)!.push({ prop, value });
                    } else {
                        objectProps.push(value);
                    }
                } else if (name === 'initializeComponent' && value != null) {
                    if (t.isExpression(value)) {
                        assertLifecycleValue(prop, name, value);
                        userInit = value;
                        explainProp(prop, 'component-event', 'lifecycle', `initializeComponent: ${codeOf(value)}`, 'n/a', DEPS.none, plainTag
                            ? 'called once during setup with the tag\'s component as sender (same as initializeComponent on a component tag)'
                            : 'passed via runover; called once during setup with the tag\'s component (the returned root for a function component) as sender');
                    } else {
                        objectProps.push(value);
                    }
                } else if (name === 'ref' && value != null) {
                    pushRef(prop, value);
                } else if (isComponentEvent(name.toLowerCase())) {
                    if (value != null) {
                        var ce = makeComponentTraps(prop, name, value, path);
                        if (ce !== null) {
                            ce.key = id(hookKey(name));
                            componentEvents.push(ce)
                            explainProp(prop, 'component-event', 'lifecycle', ce, 'n/a', DEPS.none, 'lifecycle hook; called once during component setup/build/dispose');
                        }
                    }
                } else if (!plainTag && mergedHook !== null && value != null && t.isExpression(value)) {
                    assertLifecycleValue(prop, name, value);
                    const lifecycleProp = t.objectProperty(id(HOOK_KEYS[mergedHook]), value);
                    componentEvents.push(lifecycleProp);
                    explainProp(prop, 'component-event', 'lifecycle', lifecycleProp, 'n/a', DEPS.none, 'lifecycle hook; on a component tag it is applied via runover to the tag\'s component (the returned root for a function component)');
                } else if (isContextHandler(name.toLowerCase()) && value != null) {
                    const newName = name.slice(3);

                    const onCall = t.callExpression(id('sender.motif.on'), [t.stringLiteral(newName), value as t.Expression]);
                    directives.push(t.expressionStatement(onCall));
                    explainProp(prop, 'event', 'event.context', onCall, 'n/a', DEPS.none, 'context event (on:/on-/on_): the handler is passed to motif.on as is; with ≤ 1 declared parameter it is called as fn(event), with 2 or more as fn(sender, event)');
                } else if (name.toLowerCase() === "key" || name.toLowerCase() === "indexkey") {
                    var clearedName = 'indexkey';
                    if (t.isIdentifier(value)) {
                        var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                        objectExpression.push(t.objectProperty(id(clearedName), cex))
                    } else if (t.isMemberExpression(value)) {
                        var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                        objectExpression.push(t.objectProperty(id(clearedName), cex))
                    } else if (t.isFunctionExpression(value) || t.isArrowFunctionExpression(value)) {
                        var cex = t.arrowFunctionExpression(value.params, value.body)
                        objectExpression.push(t.objectProperty(id(clearedName), cex))

                    } else if (t.isExpression(value)) {
                        var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                        objectExpression.push(t.objectProperty(id(clearedName), cex));
                    } else {
                    }
                    explainProp(prop, 'key', 'key', objectExpression[objectExpression.length - 1], 'n/a', 'item identity — ListBinding matches DOM nodes by it', undefined);
                } else if (isDirective(name.toLowerCase())) {
                    const directiveName = name.toLowerCase().replace("x:", "").replace("x-", "");
                    if (UNSUPPORTED_DIRECTIVES.has(directiveName)) {
                        fail('MJX006', `Directive "${name}" is not supported. Supported: ${supportedDirectivesText()}.`, prop);
                    }
                    if (directiveName === 'chunk' && value == null) {
                        const automatic = t.booleanLiteral(true);
                        setupProps.push(t.objectProperty(t.stringLiteral('x-chunk'), automatic));
                        explainProp(prop, 'directive', 'directive.chunk', automatic, 'static', DEPS.none, 'the element builds its children over frames, as many as each frame allows');
                    }
                    if (value != null) {
                        var clearedName = name.toLowerCase().replace("x:", "").replace("x-", "").replace("on:", "");
                        if (clearedName === 'chunk') {
                            if (t.isExpression(value) && (t.isBooleanLiteral(value) || !cannotBeNumber(value))) {
                                setupProps.push(t.objectProperty(t.stringLiteral('x-chunk'), value));
                                explainProp(prop, 'directive', 'directive.chunk', value, 'static', DEPS.none, 'the element builds this many children at once, then at least this many per frame');
                            } else {
                                fail('MJX012', `Directive "${name}" expects a number or no value: x-chunk or x-chunk={200}.`, prop);
                            }
                        } else if ((SUPPORTED_DIRECTIVES as readonly string[]).includes(clearedName)) {
                            if (clearedName !== 'wait' && clearedName !== 'display') {
                                var directive = makeDirectives(prop, name, value, path, state);
                                if (directive != null) {
                                    directives.push(directive)
                                    const twoWay = clearedName === 'model' && t.isCallExpression(directive.expression) && directive.expression.arguments.length > 1;
                                    explainProp(prop, 'directive', 'directive.' + clearedName, directive.expression, 'live',
                                        twoWay ? DEPS.model : clearedName === 'model' ? DEPS.modelOneWay : DEPS.getter);
                                }
                            } else {
                                var directive = makePreDirectives(prop, name, value, path);
                                if (directive != null) {
                                    preDirectives.push(directive)
                                    explainProp(prop, 'directive', 'directive.' + clearedName, directive.expression, 'live', DEPS.getter,
                                        clearedName === 'wait' ? 'true → hidden; if true at start, the element and its children are never built (preconfig, before build)'
                                            : 'removes/reinserts in the DOM; the instance is kept (preconfig)');
                                }
                            }
                        } else if (clearedName === 'style') {
                            const styleAttr = makeHtmlAttr(prop, 'style', value, path);
                            if (styleAttr !== null) {
                                htmlAttrlist.push(styleAttr);
                                explainAttr(prop, styleAttr, value, 'style');
                            }
                        } else if (clearedName === "ref") {
                            pushRef(prop, value);
                        } else if (clearedName === "inject") {

                            if (t.isIdentifier(value)) {
                                objectExpression.push(t.objectProperty(id(clearedName), value))
                            } else if (t.isMemberExpression(value)) {
                                objectExpression.push(t.objectProperty(id(clearedName), value))
                            } else if (t.isFunctionExpression(value) || t.isArrowFunctionExpression(value)) {
                                objectExpression.push(t.objectProperty(id(clearedName), value))

                            } else if (t.isExpression(value)) {
                                objectExpression.push(t.objectProperty(id(clearedName), value))

                            } else {
                                objectProps.push(value)
                            }

                        } else if (name.toLowerCase() === "key" || name.toLowerCase() === "indexkey") {
                            var clearedName = 'indexkey';
                            if (t.isIdentifier(value)) {
                                var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                                objectExpression.push(t.objectProperty(id(clearedName), cex))
                            } else if (t.isMemberExpression(value)) {
                                var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                                objectExpression.push(t.objectProperty(id(clearedName), cex))
                            } else if (t.isFunctionExpression(value) || t.isArrowFunctionExpression(value)) {
                                var cex = t.arrowFunctionExpression(value.params, value.body)
                                objectExpression.push(t.objectProperty(id(clearedName), cex))

                            } else if (t.isExpression(value)) {
                                var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                                objectExpression.push(t.objectProperty(id(clearedName), cex));
                            } else {
                                objectProps.push(value);
                            }
                        } else if (clearedName === "key" || clearedName === "indexkey") {
                            clearedName = 'indexkey';
                            if (t.isIdentifier(value)) {
                                var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                                objectExpression.push(t.objectProperty(id(clearedName), cex))
                            } else if (t.isMemberExpression(value)) {
                                var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                                objectExpression.push(t.objectProperty(id(clearedName), cex))
                            } else if (t.isFunctionExpression(value) || t.isArrowFunctionExpression(value)) {
                                var cex = t.arrowFunctionExpression(value.params, value.body)
                                objectExpression.push(t.objectProperty(id(clearedName), cex))

                            } else if (t.isExpression(value)) {
                                var cex = t.arrowFunctionExpression([], t.blockStatement([t.returnStatement(value)]))
                                objectExpression.push(t.objectProperty(id(clearedName), cex));
                            } else {
                                objectProps.push(value);
                            }
                        } else {
                            if (!isComponentEvent('on' + clearedName) && !LIFECYCLE_HOOKS.has(clearedName) && clearedName !== 'initializecomponent') {
                                diagWarn(
                                    'MJX007',
                                    `Unknown directive "${name}": it is passed on as the prop "on${clearedName}". Supported: ${supportedDirectivesText()}.`,
                                    prop, fileName,
                                );
                            } else {
                                assertLifecycleValue(prop, name, value);
                            }
                            if (t.isExpression(value)) {
                                objectExpression.push(t.objectProperty(id(hookKey("on" + clearedName)), value))
                            } else {
                                objectProps.push(value)
                            }
                        }
                    }
                } else if ((htmlAttributes.has(name) || startAttr(name))
                    ||
                    (
                        (<t.JSXIdentifier>(<t.JSXElement>path.node).openingElement.name).name == String((<t.JSXIdentifier>(<t.JSXElement>path.node).openingElement.name).name).toLowerCase() &&
                        name.toLowerCase().startsWith("on") == false &&
                        name.toLowerCase() != 'indexkey' &&
                        name.toLowerCase() != 'key' &&
                        name.toLowerCase() != 'props' &&
                        name.toLowerCase() != 'settings'
                    )
                ) {
 
                    var isComponent = tagIsComponent();

                    if (isComponent) {
                        if (value != null) {
                            if (t.isExpression(value)) {
                                if (name.includes("-") || name.includes(":")) {
                                    objectExpression.push(t.objectProperty(t.stringLiteral(name), value))
                                } else {
                                    objectExpression.push(t.objectProperty(id(name), value))
                                }
                                {
                                    const c = classifyPropValue(prop, value);
                                    explainProp(prop, 'prop', c.shape, objectExpression[objectExpression.length - 1], c.reactive, c.deps, c.note);
                                }

                            } else {
                                objectProps.push(value)
                            }
                        } else {
                            pushBooleanProp(name);
                            explainProp(prop, 'prop', 'prop.flag', objectExpression[objectExpression.length - 1], 'static', DEPS.none);
                        }
                    }
                    else if (name === 'transition' && value !== null && t.isExpression(value)) {
                        objectExpression.push(t.objectProperty(id('transition'), value));
                        explainProp(prop, 'prop', 'prop.transition', objectExpression[objectExpression.length - 1], 'static', DEPS.none,
                            'bound to the transition engine (options.transition); no HTML attribute is written');
                    }
                    else if (name === 'options' && value !== null && t.isExpression(value)) {
                        objectExpression.push(t.objectProperty(id('options'), value));
                        explainProp(prop, 'prop', 'prop.options', objectExpression[objectExpression.length - 1], 'static', DEPS.none,
                            'copied into motif.options (hideStrategy, disableDisposal); no HTML attribute is written');
                    }
                    else if (value !== null) {
                        var atr = makeHtmlAttr(prop, name, value, path);
                        if (atr !== null) {
                            htmlAttrlist.push(atr);
                            explainAttr(prop, atr, value);
                        }
                    } else {
                        var atr = makeHtmlAttr(prop, name, t.booleanLiteral(true), path);
                        if (atr !== null) {
                            htmlAttrlist.push(atr);
                            explainAttr(prop, atr, null);
                        }
                    }


                } else if (name.toLowerCase().startsWith("on") && htmlEvents.has(name.toLowerCase())) {
                    if (tagIsComponent() && name !== name.toLowerCase()) {
                        diagWarn(
                            'MJX002',
                            `"${name}" is a DOM event name; on a component tag it is bound as a DOM listener on the component's own element and never reaches this.props ("this.props.${name}" stays undefined; on a component without an element it listens on the content elements). If the component should receive a callback, give it a name that is not a DOM event (e.g. "onPress", "onValueChange", "onConfirm") and call it from inside the component, e.g. this.motif.on("${name.slice(2).toLowerCase()}", (_sender, e) => this.props.onPress?.(e)).`,
                            prop, fileName,
                        );
                    }
                    if (value != null) {
                        var evp = makeHtmlEvents(prop, name, value, path);
                        if (evp !== null) {
                            eventProps.push(t.expressionStatement(evp));
                            explainProp(prop, 'event', 'event.dom', evp, 'n/a', DEPS.none,
                                tagIsComponent() ? 'DOM event on a component tag: bound as a listener on the root element, it does NOT reach this.props' : undefined);
                        }
                    }
                } else if (!name.startsWith("x")) {
                    if (value != null) {
                        if (t.isExpression(value)) {
                            if (name.includes("-") || name.includes(":")) {
                                objectExpression.push(t.objectProperty(t.stringLiteral(name), value))
                            } else {
                                objectExpression.push(t.objectProperty(id(hookKey(name)), value))
                            }
                            {
                                const c = classifyPropValue(prop, value);
                                explainProp(prop, 'prop', c.shape, objectExpression[objectExpression.length - 1], c.reactive, c.deps, c.note);
                            }

                        } else {
                            objectProps.push(value)
                        }

                    } else {
                        pushBooleanProp(name);
                        explainProp(prop, 'prop', 'prop.flag', objectExpression[objectExpression.length - 1], 'static', DEPS.none);
                    }

                }
            }
        });
    }

    if (refEntries.length > 0) {
        const refProp = t.objectProperty(id('ref'), refEntries.length === 1 ? refEntries[0].lowered : t.arrayExpression(refEntries.map(e => e.lowered)));
        objectExpression.push(refProp);
        refEntries.forEach(e => explainProp(e.prop, 'prop', 'ref', refProp, 'n/a', DEPS.none,
            refEntries.length === 1
                ? 'the tag\'s component is passed to the ref once, while it is being built'
                : 'all ref spellings on the same tag are merged into one list; each is called once, in source order'));
    }

    mergedHooks.forEach((entries, hook) => {
        if (entries.length === 0) return;
        const merged = t.objectProperty(id(HOOK_KEYS[hook]), t.arrayExpression(entries.map(e => e.value)));
        componentEvents.push(merged);
        entries.forEach(e => explainProp(e.prop, 'component-event', 'lifecycle', merged, 'n/a', DEPS.none,
            'all spellings of the same hook on this tag are merged into one list; each is called once, in source order'));
    });

    const htmlProps: t.ExpressionStatement[] = mergeHtmlAttributes(htmlAttrlist);

    return { htmlProps, eventProps, objectExpression, objectProps, componentEvents, setupProps, directives, preDirectives, thisStatement, spreadProps, userInit: userInit as t.Expression | null }
};


export const getChildren = (


    paths: NodePath<t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment>[]
    , state: State) => {


    const originalCode: string | undefined = state.get('originalCode');
    const transformOne = (path: NodePath<t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment>): any => {
        if (path.isJSXText()) {
            const literal = transformJSXText(path);
            return literal === null ? null : mkText(literal, state);
        }

        if (path.isJSXExpressionContainer()) { 
            // "{ () => { return cond ? <A/> : <B/> } }".
            let expression = transformJSXExpressionContainer(path) as t.Expression;

            // Detect: {(() => { switch(expr) { case ... } })()}

            if (t.isCallExpression(expression) && (t.isArrowFunctionExpression(expression.callee) || t.isFunctionExpression(expression.callee)) &&
                expression.callee.body && t.isBlockStatement(expression.callee.body)
            ) {

                const switchStmt = expression.callee.body.body.find((s: any) => t.isSwitchStatement(s)) as t.SwitchStatement | undefined;
                var switchBody = expression.callee.body.body;
                var switchBlocker = switchStmt ? findSwitchBlocker(switchBody, switchStmt, expression.callee.params, expression.arguments) : null;
                if (switchBlocker) {
                    diagWarn(
                        'MJX016',
                        `A "switch" getter in JSX child position is not lowered to bindings.switchCase because of ${switchBlocker}; it runs as bindings.method, so its content is rebuilt on every change instead of being kept per branch.`,
                        path, String(state.get('filename') ?? ''),
                    );
                }
                if (switchStmt && !switchBlocker) { 
                    const discriminant = switchStmt.discriminant;
 
                    const callee = expression.callee as t.ArrowFunctionExpression | t.FunctionExpression;
                    const callArgs = expression.arguments as t.Expression[];
                    const params = callee.params;

                    let discriminatorFn: t.ArrowFunctionExpression;
 
                    const casesObjProps: t.ObjectProperty[] = [];
                    let defaultFn: t.ArrowFunctionExpression | undefined = undefined;
                    for (const caseNode of switchStmt.cases) {
                        const ret = caseNode.consequent.find((s: any) => t.isReturnStatement(s)) as t.ReturnStatement | undefined;
                        const handlerBody = ret && ret.argument ? [t.expressionStatement(
                            t.callExpression(
                                t.memberExpression(t.identifier('frame'), t.identifier('navigate')),
                                [switchBranchContent(ret.argument)]
                            ))] : [t.expressionStatement(
                                t.callExpression(
                                    t.memberExpression(t.identifier('frame'), t.identifier('navigate')),
                                    [t.callExpression(t.identifier(motifFragment()), [])]
                                ))];
                        var caseBody = makeCaseBody(switchBody, switchStmt, caseNode, handlerBody);
                        if (!state.get(motifFragment())) {
                            state.set(motifFragment(), motifFragment());
                        }

                        const handlerFn = t.arrowFunctionExpression([t.identifier('frame')], t.blockStatement(caseBody));
                        if (caseNode.test) {
                            if (t.isStringLiteral(caseNode.test) || t.isNumericLiteral(caseNode.test)) {
                                casesObjProps.push(
                                    t.objectProperty(caseNode.test, handlerFn)
                                );
                            } else if (t.isBooleanLiteral(caseNode.test)) {
                                casesObjProps.push(
                                    t.objectProperty(t.stringLiteral(String(caseNode.test.value)), handlerFn)
                                );
                            } else {
                                // Optionally: throw or skip
                            }
                        } else {
                            defaultFn = handlerFn;
                        }
                    }

                    if (
                        params.length === 1 &&
                        t.isIdentifier(params[0]) &&
                        t.isIdentifier(discriminant) &&
                        (params[0] as t.Identifier).name === (discriminant as t.Identifier).name &&
                        callArgs.length >= 1
                    ) {
                        // Özel durum (tek parametre): () => arg0
                        discriminatorFn = t.arrowFunctionExpression([], callArgs[0] as t.Expression);
                    } else if (params.length > 0) {
                        discriminatorFn = t.arrowFunctionExpression(
                            [],
                            t.callExpression(
                                t.arrowFunctionExpression(params as any, discriminant),
                                callArgs as any
                            )
                        );
                    } else {
                        discriminatorFn = t.arrowFunctionExpression([], discriminant);
                    }

                    if (!defaultFn) defaultFn = trailingReturnHandler(expression.callee.body.body, switchStmt);
                    var switchScope = makeSwitchScope(switchBody, switchStmt, expression.callee.params, expression.arguments);
                    if (switchScope) return makeSharedSwitchCall(switchScope, discriminant, casesObjProps, defaultFn);
                    const args = [discriminatorFn, t.objectExpression(casesObjProps)];

                    if (defaultFn) args.push(defaultFn);

                    // return t.callExpression(
                    return t.callExpression(
                        t.identifier('sender.bindings.switchCase'),
                        args
                    );
                }
            }

            if ((t.isArrowFunctionExpression(expression) || t.isFunctionExpression(expression)) && expression.body && t.isBlockStatement(expression.body)
            ) {
                const switchStmt = expression.body.body.find((s: any) => t.isSwitchStatement(s)) as t.SwitchStatement | undefined;
                var switchBody = expression.body.body;
                var switchBlocker = switchStmt ? findSwitchBlocker(switchBody, switchStmt, expression.params, null) : null;
                if (switchBlocker) {
                    diagWarn(
                        'MJX016',
                        `A "switch" getter in JSX child position is not lowered to bindings.switchCase because of ${switchBlocker}; it runs as bindings.method, so its content is rebuilt on every change instead of being kept per branch.`,
                        path, String(state.get('filename') ?? ''),
                    );
                }
                if (switchStmt && !switchBlocker) { 
                    const discriminant = switchStmt.discriminant; 
                    const casesObjProps: t.ObjectProperty[] = [];
                    let defaultFn: t.ArrowFunctionExpression | undefined = undefined;
                    for (const caseNode of switchStmt.cases) {
                        const ret = caseNode.consequent.find((s: any) => t.isReturnStatement(s)) as t.ReturnStatement | undefined;
                        const handlerBody = ret && ret.argument ? [t.expressionStatement(
                            t.callExpression(
                                t.memberExpression(t.identifier('frame'), t.identifier('navigate')),
                                [switchBranchContent(ret.argument)]
                            ))] : [t.expressionStatement(
                                t.callExpression(
                                    t.memberExpression(t.identifier('frame'), t.identifier('navigate')),
                                    [t.callExpression(t.identifier(motifFragment()), [])]
                                ))];
                        var caseBody = makeCaseBody(switchBody, switchStmt, caseNode, handlerBody);
                        if (!state.get(motifFragment())) {
                            state.set(motifFragment(), motifFragment());
                        }

                        const handlerFn = t.arrowFunctionExpression([t.identifier('frame')], t.blockStatement(caseBody));
                        if (caseNode.test) {
                            if (t.isStringLiteral(caseNode.test) || t.isNumericLiteral(caseNode.test)) {
                                casesObjProps.push(
                                    t.objectProperty(caseNode.test, handlerFn)
                                );
                            } else if (t.isBooleanLiteral(caseNode.test)) {
                                casesObjProps.push(
                                    t.objectProperty(t.stringLiteral(String(caseNode.test.value)), handlerFn)
                                );
                            } else {
                                // Optionally: throw or skip
                            }
                        } else {
                            defaultFn = handlerFn;
                        }
                    }
                    if (!defaultFn) defaultFn = trailingReturnHandler(expression.body.body, switchStmt);
                    var switchScope = makeSwitchScope(switchBody, switchStmt, expression.params, null);
                    if (switchScope) return makeSharedSwitchCall(switchScope, discriminant, casesObjProps, defaultFn);
                    const discriminatorFn = t.arrowFunctionExpression([], discriminant);
                    const args = [discriminatorFn, t.objectExpression(casesObjProps)];
                    if (defaultFn) args.push(defaultFn);

                    return t.callExpression(
                        t.identifier('sender.bindings.switchCase'),
                        args
                    );
                }
            }

            const unwrapConditionalFromFunction = (expr: t.Expression): t.Expression => {
                let current: t.Expression | null = expr;
                while (current) { 
                    if (t.isArrowFunctionExpression(current) && t.isConditionalExpression(current.body)) {
                        current = current.body;
                        continue;
                    } 
                    if ((t.isArrowFunctionExpression(current) || t.isFunctionExpression(current)) && t.isBlockStatement(current.body)) {
                        const ret = current.body.body.find(s => t.isReturnStatement(s) && (s as t.ReturnStatement).argument && t.isConditionalExpression((s as t.ReturnStatement).argument as t.Expression)) as t.Statement | undefined;
                        if (ret && t.isReturnStatement(ret) && ret.argument && t.isConditionalExpression(ret.argument)) {
                            var before = current.body.body.slice(0, current.body.body.indexOf(ret));
                            if (before.length > 0 && current.params.length === 0) {
                                var ternaryBlocker = findEscapeIn(before, false, false, false);
                                if (!ternaryBlocker && before.some(s => t.isClassDeclaration(s))) ternaryBlocker = 'a class declaration written outside the branches';
                                if (!ternaryBlocker) return lowerTernary(ret.argument, state, makeGetterScope(before, [], null));
                                diagWarn(
                                    'MJX016',
                                    `A block-bodied getter returning a ternary is not lowered to bindings.ternary because of ${ternaryBlocker}; it runs as bindings.method, so its content is rebuilt on every change instead of being kept per branch.`,
                                    path, String(state.get('filename') ?? ''),
                                );
                                break;
                            }
                            const locals = current.body.body
                                .filter(s => t.isVariableDeclaration(s))
                                .flatMap(s => (s as t.VariableDeclaration).declarations
                                    .map(d => (t.isIdentifier(d.id) ? d.id.name : null))
                                    .filter((n): n is string => n !== null));
                            if (locals.length > 0) {
                                diagWarn(
                                    'MJX001',
                                    `In a block-bodied function in JSX child position the condition is moved out of the closure; ${locals.map(n => '"' + n + '"').join(', ')} declared inside it are not visible in the branches and throw ReferenceError. Use an expression-bodied arrow function (\`{() => cond ? <A t={compute()}/> : <B/>}\`) or move the logic into a named method.`,
                                    path, String(state.get('filename') ?? ''),
                                );
                            }
                            current = ret.argument as t.ConditionalExpression;
                            continue;
                        }
                    }
                    if (t.isParenthesizedExpression(current) && (current as any).expression) { 
                        current = (current as any).expression;
                        continue;
                    }
                    break;
                }
                return current || expr;
            };

            expression = unwrapConditionalFromFunction(expression);

            if (isChildsSlot(expression)) {
                return expression;
            }

            if (t.isIdentifier(expression)) {
                return mkText(expression, state)
            }

            if (t.isBinaryExpression(expression)) {
                return mkText(expression, state)
            }

            if (t.isConditionalExpression(expression)) {
                return lowerTernary(expression, state);
            }

            if (t.isMemberExpression(expression)) {
                return mkText(expression, state)
            }
            if (t.isFunctionExpression(expression)) {
                return expression;
            }
            if (t.isCallExpression(expression)) {

                if (t.isCallExpression(expression)) {
                    var b = expression.arguments;
                    if (t.isMemberExpression(expression.callee)) {
                        if (t.isIdentifier(expression.callee.property)) {
                            if (expression.callee.property.name === 'map' || expression.callee.property.name === 'forEach') {
                                if (missingListKey(b[0])) {
                                    diagWarn(
                                        'MJX003',
                                        'List item has no "key". Rows are matched by the item object (primitive items by value), not by key, so a key does not change DOM reuse; a stable key such as `key={item.id}` is checked for duplicates (MJX202).',
                                        path, String(state.get('filename') ?? ''),
                                    );
                                }

                                state.set('loop-waiter', expression.callee.object);
                                return t.callExpression(id('sender.repeater'), [expression.callee.object, ...b]);
                            }
                        }
                    }
                }

                if (t.isMemberExpression(expression.callee)) {
                    return makeMemberCallChild(expression, state);
                }
            }

            if (t.isStringLiteral(expression)) {
                return mkText(expression, state)
            }
 
            if (t.isTemplateLiteral(expression) && expression.expressions.length > 0) { 
                return t.arrowFunctionExpression([], expression);
            }
            if (t.isOptionalMemberExpression(expression) || t.isOptionalCallExpression(expression)) {
                return t.arrowFunctionExpression([], expression);
            }

            return expression;
        }

        const childNode: t.Node = path.node;
        if (t.isCallExpression(childNode)) return childNode;
        if (path.isJSXElement()) return ParseComponent(path, state);

        fail('MJX013', `Unsupported JSX child: ${path.type}.`, path as NodePath<t.Node>);
    };

    const lowered: any[] = [];
    for (const child of paths) {
        const result = transformOne(child);
        if (result && !child.isJSXText()) noteOrigin(result, child as NodePath<t.Node>, originalCode);
        if (result == null || t.isJSXEmptyExpression(result)) continue;
        lowered.push(result);
    }
    return lowered;

}

const trailingReturnHandler = (body: t.Statement[], switchStmt: t.SwitchStatement): t.ArrowFunctionExpression | undefined => {
    const after = body.slice(body.indexOf(switchStmt) + 1);
    const ret = after.find((st): st is t.ReturnStatement => t.isReturnStatement(st));
    var before = after.slice(0, ret ? after.indexOf(ret) : after.length).map(s => t.cloneNode(s, true));
    if (before.length > 0 && (!ret || !ret.argument || t.isNullLiteral(ret.argument) || (t.isIdentifier(ret.argument) && ret.argument.name === 'undefined'))) {
        return t.arrowFunctionExpression([t.identifier('frame')], t.blockStatement([...before, makeNavigate(null)]));
    }
    if (!ret || !ret.argument || t.isNullLiteral(ret.argument) || (t.isIdentifier(ret.argument) && ret.argument.name === 'undefined')) return undefined;
    return t.arrowFunctionExpression([t.identifier('frame')], t.blockStatement([...before, t.expressionStatement(
        t.callExpression(t.memberExpression(t.identifier('frame'), t.identifier('navigate')), [switchBranchContent(ret.argument)])
    )]));
};

const LOOP_STATEMENTS = new Set(['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForInStatement', 'ForOfStatement']);

const childNodes = (node: any): any[] => {
    var result: any[] = [];
    var keys = t.VISITOR_KEYS[node.type] || [];
    for (const key of keys) {
        var child = node[key];
        if (Array.isArray(child)) {
            child.forEach((c: any) => { if (c && typeof c.type === 'string') result.push(c); });
        } else if (child && typeof child.type === 'string') {
            result.push(child);
        }
    }
    return result;
};

const findEscape = (node: any, loops: number, allowReturn: boolean, allowJsx: boolean): string | null => {
    if (t.isFunction(node) || t.isClass(node)) return null;
    if (t.isReturnStatement(node) && !allowReturn) return 'a return written outside the branches';
    if (t.isLabeledStatement(node)) return 'a labeled statement';
    if (t.isBreakStatement(node) && (node.label || loops === 0)) return 'a break that leaves the switch';
    if (t.isContinueStatement(node) && (node.label || loops === 0)) return 'a continue that leaves the switch';
    if (!allowJsx && (t.isJSXElement(node) || t.isJSXFragment(node) || isMotifCall(node))) return 'JSX created outside the branches';
    var inner = loops;
    if (LOOP_STATEMENTS.has(node.type) || t.isSwitchStatement(node)) inner++;
    for (const child of childNodes(node)) {
        var found = findEscape(child, inner, allowReturn, allowJsx);
        if (found) return found;
    }
    return null;
};

const findEscapeIn = (statements: any[], allowReturn: boolean, allowJsx: boolean, allowTrailingBreak: boolean): string | null => {
    for (var i = 0; i < statements.length; i++) {
        if (allowTrailingBreak && i === statements.length - 1 && t.isBreakStatement(statements[i]) && !statements[i].label) continue;
        var found = findEscape(statements[i], 0, allowReturn, allowJsx);
        if (found) return found;
    }
    return null;
};

const findIdentifier = (node: any, name: string): boolean => {
    if (t.isIdentifier(node) && node.name === name) return true;
    for (const child of childNodes(node)) {
        if (findIdentifier(child, name)) return true;
    }
    return false;
};

const isLiteralCase = (test: any): boolean => t.isStringLiteral(test) || t.isNumericLiteral(test) || t.isBooleanLiteral(test);

const caseStatements = (caseNode: t.SwitchCase): t.Statement[] =>
    caseNode.consequent.length === 1 && t.isBlockStatement(caseNode.consequent[0]) ? caseNode.consequent[0].body : caseNode.consequent;

const paramNames = (params: any[]): string[] => {
    var names: string[] = [];
    params.forEach((p: any) => { names.push(...Object.keys(t.getBindingIdentifiers(p))); });
    return names;
};

const isScopeNeeded = (body: t.Statement[], switchStmt: t.SwitchStatement, params: any[]): boolean => {
    if (body.indexOf(switchStmt) > 0) return true;
    var names = paramNames(params);
    return switchStmt.cases.some(caseNode => names.some(name => caseStatements(caseNode).some(s => findIdentifier(s, name))));
};

const findSwitchBlocker = (body: t.Statement[], switchStmt: t.SwitchStatement, params: any[], callArgs: any[] | null): string | null => {
    if (body.filter(s => t.isSwitchStatement(s)).length > 1) return 'more than one switch at the top level';
    if (isScopeNeeded(body, switchStmt, params)) {
        if (params.some(p => !t.isIdentifier(p))) return 'a parameter that is not a plain name';
        if (callArgs === null && params.length > 0) return 'a getter with parameters';
    }
    var at = body.indexOf(switchStmt);
    var before = body.slice(0, at);
    var after = body.slice(at + 1).filter(s => !t.isReturnStatement(s));
    var blocker = findEscapeIn(before, false, false, false);
    if (blocker) return blocker;
    blocker = findEscapeIn(after, false, true, false);
    if (blocker) return blocker;
    if (before.some(s => t.isClassDeclaration(s))) return 'a class declaration written outside the branches';
    var seen = new Set<string>();
    var defaults = 0;
    for (const caseNode of switchStmt.cases) {
        if (caseNode.test) {
            if (!isLiteralCase(caseNode.test)) return 'a case label that is not a literal';
            var key = String((caseNode.test as any).value);
            if (seen.has(key)) return 'the case label ' + JSON.stringify(key) + ' written twice';
            seen.add(key);
        } else {
            defaults++;
            if (defaults > 1) return 'two default labels';
        }
        blocker = findEscapeIn(caseStatements(caseNode), true, true, true);
        if (blocker) return blocker;
    }
    return null;
};

const makeGetterScope = (before: t.Statement[], params: any[], callArgs: any[] | null): any => {
    var names: string[] = [];
    var functions: t.FunctionDeclaration[] = [];
    var statements: t.Statement[] = [];
    params.forEach((p: any, i: number) => {
        names.push(p.name);
        statements.push(t.expressionStatement(t.assignmentExpression('=', t.identifier(p.name), (callArgs && callArgs[i]) || t.identifier('undefined'))));
    });
    for (const s of before) {
        if (t.isVariableDeclaration(s)) {
            for (const d of s.declarations) {
                names.push(...Object.keys(t.getBindingIdentifiers(d.id)));
                if (d.init) statements.push(t.expressionStatement(t.assignmentExpression('=', d.id as any, d.init)));
            }
        } else if (t.isFunctionDeclaration(s)) {
            functions.push(s);
        } else {
            statements.push(s);
        }
    }
    return { names, functions, statements };
};

const makeSwitchScope = (body: t.Statement[], switchStmt: t.SwitchStatement, params: any[], callArgs: any[] | null): any => {
    if (!isScopeNeeded(body, switchStmt, params)) return null;
    return makeGetterScope(body.slice(0, body.indexOf(switchStmt)), params, callArgs);
};

const makeSharedScopeCall = (callee: string, scope: any, args: t.Expression[]): t.CallExpression => {
    var decls: t.Statement[] = [];
    if (scope.names.length > 0) decls.push(t.variableDeclaration('let', scope.names.map((n: string) => t.variableDeclarator(t.identifier(n)))));
    var wrapper = t.arrowFunctionExpression([], t.blockStatement([...decls, ...scope.functions, t.returnStatement(t.arrayExpression(args))]));
    return t.callExpression(t.identifier(callee), [t.spreadElement(t.callExpression(wrapper, []))]);
};

const makeSharedSwitchCall = (scope: any, discriminant: t.Expression, casesObjProps: t.ObjectProperty[], defaultFn?: t.ArrowFunctionExpression): t.CallExpression => {
    var discriminatorFn = t.arrowFunctionExpression([], t.blockStatement([...scope.statements, t.returnStatement(discriminant)]));
    var args: t.Expression[] = [discriminatorFn, t.objectExpression(casesObjProps)];
    if (defaultFn) args.push(defaultFn);
    return makeSharedScopeCall('sender.bindings.switchCase', scope, args);
};

const makeNavigate = (argument: any): t.Statement =>
    t.expressionStatement(t.callExpression(t.memberExpression(t.identifier('frame'), t.identifier('navigate')),
        [argument ? switchBranchContent(argument) : t.callExpression(t.identifier(motifFragment()), [])]));

const rewriteReturns = (node: any): any => {
    if (t.isReturnStatement(node)) return t.blockStatement([makeNavigate(node.argument), t.returnStatement()]);
    if (t.isFunction(node) || t.isClass(node)) return node;
    var keys = t.VISITOR_KEYS[node.type] || [];
    for (const key of keys) {
        var child = node[key];
        if (Array.isArray(child)) {
            node[key] = child.map((c: any) => (c && typeof c.type === 'string' ? rewriteReturns(c) : c));
        } else if (child && typeof child.type === 'string') {
            node[key] = rewriteReturns(child);
        }
    }
    return node;
};

const isTerminal = (s: any): boolean =>
    !!s && (t.isReturnStatement(s) || t.isThrowStatement(s) || (t.isBlockStatement(s) && isTerminal(s.body[s.body.length - 1])));

const cloneRewritten = (statements: t.Statement[]): t.Statement[] => statements.map(s => rewriteReturns(t.cloneNode(s, true)));

const makeExitStatements = (body: t.Statement[], switchStmt: t.SwitchStatement): t.Statement[] => {
    var after = body.slice(body.indexOf(switchStmt) + 1);
    var ret = after.find((s): s is t.ReturnStatement => t.isReturnStatement(s));
    var before = after.slice(0, ret ? after.indexOf(ret) : after.length);
    return [...before.map(s => t.cloneNode(s, true)), makeNavigate(ret ? ret.argument : null), t.returnStatement()];
};

const makeCaseStatements = (body: t.Statement[], switchStmt: t.SwitchStatement, index: number): t.Statement[] => {
    var cases = switchStmt.cases;
    var own = caseStatements(cases[index]);
    var endsWithBreak = own.length > 0 && t.isBreakStatement(own[own.length - 1]);
    var statements = cloneRewritten(endsWithBreak ? own.slice(0, -1) : own);
    if (endsWithBreak) return [...statements, ...makeExitStatements(body, switchStmt)];
    if (isTerminal(statements[statements.length - 1])) return statements;
    if (index + 1 < cases.length) return [...statements, ...makeCaseStatements(body, switchStmt, index + 1)];
    return [...statements, ...makeExitStatements(body, switchStmt)];
};

const makeCaseBody = (body: t.Statement[], switchStmt: t.SwitchStatement, caseNode: t.SwitchCase, plainBody: t.Statement[]): t.Statement[] => {
    var own = caseStatements(caseNode);
    var isPlainReturn = own === caseNode.consequent && t.isReturnStatement(own[0]) && (own.length === 1 || (own.length === 2 && t.isBreakStatement(own[1])));
    if (isPlainReturn) return plainBody;
    var statements = makeCaseStatements(body, switchStmt, switchStmt.cases.indexOf(caseNode));
    if (!isTerminal(statements[statements.length - 1])) statements.push(makeNavigate(null), t.returnStatement());
    var last: any = statements[statements.length - 1];
    if (t.isReturnStatement(last) && !last.argument) {
        statements.pop();
    } else if (t.isBlockStatement(last) && last.body.length === 2 && t.isReturnStatement(last.body[1]) && !last.body[1].argument) {
        statements.splice(statements.length - 1, 1, last.body[0]);
    }
    return statements;
};

function id(name: string): t.Identifier {
    return t.identifier(name);
}

const isChildsSlot = (e: t.Expression): boolean =>
    (t.isMemberExpression(e) && !e.computed && t.isIdentifier(e.property) && e.property.name === 'childs')
    || (t.isIdentifier(e) && e.name === 'childs');

/** `??` / `||` mi? (C1: bunlar `&&` gibi `when`'e çevrilmemeli) */
const isFallbackLogical = (e: t.Expression): boolean =>
    t.isLogicalExpression(e) && (e.operator === '??' || e.operator === '||');

const makeReportedCatch = (state: State, ...fallback: t.Statement[]): t.CatchClause => {
    state.set(motifReport(), motifReport());
    return t.catchClause(t.identifier('__e'), t.blockStatement([
        t.expressionStatement(t.callExpression(t.identifier(motifReport()), [t.identifier('__e')])),
        ...fallback
    ]));
};

const fallbackFn = (cx: t.LogicalExpression, state: State): t.ArrowFunctionExpression => {
    const l = t.identifier('__l');
    return t.arrowFunctionExpression([], t.blockStatement([
        t.variableDeclaration('let', [t.variableDeclarator(t.identifier('__l'))]),
        t.tryStatement(
            t.blockStatement([t.expressionStatement(t.assignmentExpression('=', l, cx.left as t.Expression))]),
            makeReportedCatch(state, t.expressionStatement(t.assignmentExpression('=', t.identifier('__l'), t.identifier('undefined'))))
        ),
        t.returnStatement(t.logicalExpression(cx.operator, t.identifier('__l'), cx.right))
    ]));
};

const makeFallbackChild = (cx: t.LogicalExpression, state: State): t.CallExpression =>
    t.callExpression(id('sender.bindings.method'), [fallbackFn(cx, state)]);

const makeMemberCallChild = (call: t.CallExpression, state: State): t.CallExpression =>
    t.callExpression(id('sender.bindings.method'), [t.arrowFunctionExpression([], t.blockStatement([
        t.tryStatement(
            t.blockStatement([t.returnStatement(call)]),
            makeReportedCatch(state, t.returnStatement(t.identifier('undefined')))
        )
    ]))]);

/** JSXElement'in etiket adı (yalnızca basit tanımlayıcı; `<Foo.Bar>` için null). */
const jsxTagName = (p: NodePath<t.JSXElement>): string | null => {
    const n = p.node.openingElement.name;
    return t.isJSXIdentifier(n) ? n.name : null;
};

const isInsideSvgTree = (path: NodePath<t.JSXElement>): boolean => {
    let p: NodePath | null = path.parentPath;
    while (p) {
        if (p.isJSXElement()) {
            const n = jsxTagName(p as NodePath<t.JSXElement>);
            if (n === 'foreignObject') return false;
            if (n === 'svg' || (n && svgTags.includes(n) && !htmlTags.includes(n as any))) return true;
        }
        p = p.parentPath;
    }
    return false;
};

const listSource = (src: t.Expression): t.Expression => {
    if (t.isArrowFunctionExpression(src) || t.isFunctionExpression(src)) return src;
    if (t.isMemberExpression(src) || t.isIdentifier(src) || t.isLogicalExpression(src) || t.isBinaryExpression(src) || t.isCallExpression(src)) {
        return returnIfStatement(src, true, t.arrayExpression());
    }
    return t.arrowFunctionExpression([], src);
};

const listRender = (args: t.CallExpression['arguments']): t.Expression => {
    const render = args[1] as t.Expression;
    const thisArg = args[2];
    if (!thisArg || !t.isExpression(thisArg)) return render;
    return t.callExpression(t.memberExpression(render, t.identifier('bind')), [thisArg]);
};

const extractMemberExpressionFromFunction = (exp: t.Expression): t.MemberExpression | null => { 
    if (t.isArrowFunctionExpression(exp) && exp.params.length === 0 && t.isMemberExpression(exp.body)) {
        return exp.body;
    } 
    if ((t.isArrowFunctionExpression(exp) || t.isFunctionExpression(exp)) && exp.params.length === 0 && t.isBlockStatement(exp.body)) {
        const statements = exp.body.body;
        if (statements.length === 1 && t.isReturnStatement(statements[0]) && statements[0].argument && t.isMemberExpression(statements[0].argument)) {
            return statements[0].argument;
        }
    }
    return null;
};

const splitMemberExpression = (exp: t.MemberExpression): { object: t.Expression, property: string } | null => {
    if (!exp.computed && t.isIdentifier(exp.property)) {
        return {
            object: exp.object,
            property: exp.property.name
        };
    }
    return null;
};

const mkText = (exp: t.Expression, state: State) => {
    var a1: t.CallExpression;
 
    const childProbe: t.Expression | null =
        (t.isIdentifier(exp) || t.isMemberExpression(exp)) ? t.arrowFunctionExpression([], exp) : null;

    if (t.isStringLiteral(exp)) {
        a1 = t.callExpression(id('sender.setText'), [exp]);
    } else if (t.isMemberExpression(exp)) {
        const split = splitMemberExpression(exp);
        if (split) {
            a1 = t.callExpression(id('sender.bindings.add'), [
                t.stringLiteral("textContent"),
                split.object,
                t.stringLiteral(split.property)
            ]);
        } else {
            var ifStatement = findIfStatements(exp);
            var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp), t.stringLiteral('function'));
            var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp, []), t.arrowFunctionExpression([], exp)));
            var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
            var kx = cacheGuardCalls(t.arrowFunctionExpression([], t.blockStatement([rtrns])), [exp]);
            a1 = t.callExpression(id('sender.bindings.add'), [t.stringLiteral("textContent"), kx]);
        }
    } else if (t.isObjectExpression(exp) || t.isIdentifier(exp)) {
        var ifStatement = findIfStatements(exp);
        var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp), t.stringLiteral('function'));
        var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp, []), t.arrowFunctionExpression([], exp)));
        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
        var kx = t.arrowFunctionExpression([], t.blockStatement([rtrns])); 
        a1 = t.callExpression(id('sender.bindings.add'), [t.stringLiteral("textContent"), kx]);
    } else if (t.isArrowFunctionExpression(exp)) { 
        const memberExp = extractMemberExpressionFromFunction(exp);
        if (memberExp) {
            const split = splitMemberExpression(memberExp);
            if (split) {
                a1 = t.callExpression(id('sender.bindings.add'), [
                    t.stringLiteral("textContent"),
                    split.object,
                    t.stringLiteral(split.property)
                ]);
            } else {
                var ifStatement = findIfStatements(exp);
                var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp), t.stringLiteral('function'));
                var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp, []), t.arrowFunctionExpression([], exp)));
                var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
                var kx = t.arrowFunctionExpression([], t.blockStatement([rtrns]));
                a1 = t.callExpression(id('sender.bindings.add'), [t.stringLiteral("textContent"), kx]);
            }
        } else {
            var ifStatement = findIfStatements(exp);
            var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp), t.stringLiteral('function'));
            var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp, []), t.arrowFunctionExpression([], exp)));
            var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
            var kx = t.arrowFunctionExpression([], t.blockStatement([rtrns])); 
            a1 = t.callExpression(id('sender.bindings.add'), [t.stringLiteral("textContent"), kx]);
        }

    } else if (isFallbackLogical(exp)) { 
        a1 = t.callExpression(id('sender.bindings.add'), [t.stringLiteral("textContent"), fallbackFn(exp as t.LogicalExpression, state)]);
    } else if (t.isLogicalExpression(exp)) {
        var ifStatement = findIfStatements(exp.left);
        if (t.isFunction(exp.left) || t.isArrowFunctionExpression(exp.left) || t.isFunctionExpression(exp.left) || t.isFunctionDeclaration(exp.left)) {

            var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp.left), t.stringLiteral('function'));
            var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp.left, []), t.arrowFunctionExpression([], exp.left)));
            var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
            var kx = t.arrowFunctionExpression([], t.blockStatement([rtrns]));
            if (!t.isFunctionDeclaration(exp.right) && !t.isArrowFunctionExpression(exp.right)) {

                var ifst = t.ifStatement(t.identifier('__v'),
                    t.blockStatement([t.returnStatement(exp.right)]),
                    t.blockStatement([t.returnStatement(t.callExpression(t.identifier(motifComponent()), [t.objectExpression([])]))]))

                exp.right = t.arrowFunctionExpression([t.identifier("__v")], t.blockStatement([t.returnStatement(exp.right)]))
            }
            var a1 = t.callExpression(id('sender.bindings.when'), [kx, exp.right]);
        } else {
            // var rtrn = t.returnStatement(t.arrowFunctionExpression([], exp.left));
            // //var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
            // var kx = t.arrowFunctionExpression([], t.blockStatement([rtrn]));
            // if (!t.isFunctionDeclaration(exp.right) && !t.isArrowFunctionExpression(exp.right)) {

            //     var ifst = t.ifStatement(t.identifier('val'),

            // var a1 = t.callExpression(id('sender.bind.logic'), [kx, exp.right]);

            var rtrns = t.ifStatement(ifStatement!, t.blockStatement([t.returnStatement(exp.left)]));
            var tryStatement = t.tryStatement(t.blockStatement([rtrns]), makeReportedCatch(state, t.returnStatement(t.nullLiteral())), null);
            var kx = cacheGuardCalls(t.arrowFunctionExpression([], t.blockStatement([tryStatement])), [exp.left]);

            if (!t.isFunctionDeclaration(exp.right) && !t.isArrowFunctionExpression(exp.right)) {

                var ifst = t.ifStatement(t.identifier('__v'),
                    t.blockStatement([t.returnStatement(exp.right)]),
                    t.blockStatement([t.returnStatement(t.callExpression(t.identifier(motifComponent()), [t.objectExpression([])]))]))

                exp.right = t.arrowFunctionExpression([t.identifier("__v")], t.blockStatement([t.returnStatement(exp.right)]))
            }
            var a1 = t.callExpression(id('sender.bindings.when'), [kx, exp.right]);
        }
        // var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp.left), t.stringLiteral('function'));
        // var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp.left, []), t.arrowFunctionExpression([], exp.left)));
        // var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
        // var kx = t.arrowFunctionExpression([], t.blockStatement([rtrns]));
        // if (!t.isFunctionDeclaration(exp.right) && !t.isArrowFunctionExpression(exp.right)) {

        //     var ifst = t.ifStatement(t.identifier('val'),

        // var a1 = t.callExpression(id('sender.bind.logic'), [kx, exp.right]);

    } else if (t.isBinaryExpression(exp)) {
        var ifStatement = findIfStatements(exp);

        var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp), t.stringLiteral('function'));
        var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp, []), t.arrowFunctionExpression([], exp)));
        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
        var kx = cacheGuardCalls(t.arrowFunctionExpression([], t.blockStatement([rtrns])), [exp]); 
        a1 = t.callExpression(id('sender.bindings.add'), [t.stringLiteral("textContent"), kx]);
    } else {
        var ifStatement = findIfStatements(exp);
        var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp), t.stringLiteral('function'));
        var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp, []), t.arrowFunctionExpression([], exp)));
        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
        var kx = cacheGuardCalls(t.arrowFunctionExpression([], t.blockStatement([rtrns])), [exp]); 
        a1 = t.callExpression(id('sender.bindings.add'), [t.stringLiteral("textContent"), kx]);
    }

    var arrayBody = t.arrowFunctionExpression([id('sender')], t.blockStatement([t.expressionStatement(a1)]));
    const bodyProps: t.ObjectProperty[] = [t.objectProperty(id('initializeComponent'), arrayBody)];
    if (childProbe) { bodyProps.push(t.objectProperty(id('__childExpr'), childProbe)); }
    var body = t.objectExpression(bodyProps);

    return t.callExpression(id(motifComponent()), [t.stringLiteral('text'), body]);
}
 
/** `sender.bindings.*` çağrısı olarak gelen çocuk (ternary, switchCase, method, list…). */
function explainBindingCall(cx: t.CallExpression, fileName: string, where?: string): void {
    const name = t.isIdentifier(cx.callee) ? cx.callee.name.replace(/^sender\.bindings\./, '') : '';
    const suffix = where ? ` — ${where}` : '';
    const lowered = codeOf(cx) + suffix;
    if (name === 'ternary') {
        explainChild(cx, fileName, { site: 'child', shape: 'ternary', lowered, reactive: 'live', deps: DEPS.cond, note: 'Frame: the first branch is built SYNCHRONOUSLY, later switches in a microtask; a new instance on every switch' });
    } else if (name === 'switchCase') {
        explainChild(cx, fileName, { site: 'child', shape: 'switch', lowered, reactive: 'live', deps: 'fields read in the discriminant getter; branches are rebuilt inside a Frame' });
    } else if (name === 'method') {
        explainChild(cx, fileName, { site: 'child', shape: 'method', lowered, reactive: 'live', deps: DEPS.getter, note: 'reactive text if the result is text, a Frame if it is a component' });
    } else if (name === 'list') {
        explainChild(cx, fileName, { site: 'child', shape: 'list', lowered, reactive: 'live', deps: DEPS.list });
    } else if (name === 'when') {
        explainChild(cx, fileName, { site: 'child', shape: 'when', lowered, reactive: 'live', deps: DEPS.cond });
    } else {
        explainChild(cx, fileName, { site: 'child', shape: name || 'binding', lowered, reactive: 'live', deps: DEPS.getter });
    }
}

/** `const _comp = cx; sender.controls.add(_comp)` yoluyla yerleştirilen çocuk. */
function explainPlaced(cx: t.Node, fileName: string, where?: string): void {
    const suffix = where ? ` — ${where}` : '';
    if (t.isCallExpression(cx) && t.isIdentifier(cx.callee) && cx.callee.name === motifComponent() && cx.arguments.length === 1 && t.isObjectExpression(cx.arguments[0])) {
        const init = cx.arguments[0].properties.find(p => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'initializeComponent') as t.ObjectProperty | undefined;
        const st = init && t.isArrowFunctionExpression(init.value) && t.isBlockStatement(init.value.body) ? init.value.body.body[0] : null;
        if (st && t.isExpressionStatement(st) && t.isCallExpression(st.expression) && t.isIdentifier(st.expression.callee) && st.expression.callee.name === 'sender.bindings.list') {
            explainChild(cx, fileName, { site: 'child', shape: 'list', lowered: codeOf(st.expression) + suffix, reactive: 'live', deps: DEPS.list, note: 'rows are matched by the item object (primitive items by value), not by key; a key is only checked for duplicates (MJX202)' });
            return;
        }
    }
    const text = describeTextNode(cx);
    if (text) {
        explainChild(cx, fileName, { site: 'child', shape: text.shape, lowered: text.lowered + suffix, reactive: text.reactive, deps: text.deps, note: text.note });
        return;
    }
    if (t.isCallExpression(cx) && t.isIdentifier(cx.callee) && (cx.callee.name === motifComponent() || cx.callee.name === motifFragment())) {
        const tagArg = cx.arguments[0];
        const tagName = t.isStringLiteral(tagArg) ? `<${tagArg.value}>` : t.isIdentifier(tagArg) || t.isMemberExpression(tagArg) ? `<${codeOf(tagArg)}>` : 'fragment';
        explainChild(cx, fileName, { site: 'element', shape: t.isStringLiteral(tagArg) ? 'element.dom' : cx.callee.name === motifFragment() ? 'fragment' : 'element.component', lowered: `sender.controls.add(${cx.callee.name}(${tagName}, …))${suffix}`, reactive: 'static', deps: 'none — the element itself is built once; bindings inside it are their own effects' });
        return;
    }
    explainChild(cx, fileName, { site: 'child', shape: 'value', lowered: `sender.controls.add(${codeOf(cx)})${suffix}`, reactive: 'once', deps: DEPS.once, note: 'the raw expression is placed once (components/arrays/undefined are filtered)' });
}

function makeInitializeComponentProp(statements: t.Statement[], userInit: t.Expression | null): t.ObjectProperty | null {
    if (statements.length > 0) {
        const compiled = t.arrowFunctionExpression([id('sender')], t.blockStatement([...statements]));
        return t.objectProperty(t.identifier('initializeComponent'), userInit ? t.arrayExpression([userInit, compiled]) : compiled);
    }
    return userInit ? t.objectProperty(t.identifier('initializeComponent'), userInit) : null;
}

export function ParseComponent(path: NodePath<t.JSXElement>, state: State): t.CallExpression | t.Expression | t.ObjectMethod {



    const props = path.get('openingElement').get('attributes');
    var tag = getTag(path); 
    let isSvgHere = false;
    if (t.isStringLiteral(tag)) {
        const tagName = tag.value;
        if (tagName === 'svg') isSvgHere = true;
        else if (svgTags.includes(tagName) && (!htmlTags.includes(tagName as any) || isInsideSvgTree(path))) isSvgHere = true;
    }
    const { htmlProps, eventProps, objectExpression, componentEvents, setupProps, directives, preDirectives, thisStatement, spreadProps, userInit } = getProps(props, path, state)
    const fileName = String(state.get('filename') ?? '');
    const isComponentTag = !t.isStringLiteral(tag);

    const children = getChildren(path.get('children'), state);
    if (isSvgHere) {
        objectExpression.push(t.objectProperty(t.identifier('__isSvgElement'), t.booleanLiteral(true)));
    }

    var callArgs: t.Expression[] = [];
    let statements: t.Statement[] = [];
    var childs: t.Expression[] = [];

    if (thisStatement.length > 0) {
        statements.push(thisStatement[0])

    }

    children.forEach(exp => {
        if (t.isExpression(exp)) {

            if (exp !== null) {

                if (t.isCallExpression(exp) && t.isIdentifier(exp.callee) && exp.callee.name === 'sender.repeater') {

                    var callerFn = t.objectProperty(t.identifier('initializeComponent'), t.arrowFunctionExpression([id('sender')], t.blockStatement([t.expressionStatement(
                        t.callExpression(id('sender.bindings.list'), [
                            listSource(exp.arguments[0] as t.Expression),
                            listRender(exp.arguments)
                        ])
                    )])));

                    var cex = t.callExpression(id('_mc'), [t.objectExpression([callerFn])]);
                    transferOrigin(exp, cex);
                    childs.push(cex);
                } else {
                    childs.push(exp);
                }
            }
        }
    })
    if (htmlProps.length > 0) {
        htmlProps.forEach(d => {
            statements.push(d);
        })
    }

    if (eventProps.length > 0) {
        eventProps.forEach(d => {
            statements.push(d);
        })
    }

    var hasLoop = false;
    if (directives.length > 0) {
        directives.forEach(d => {
            statements.push(d);
        })
    }

    var bodyExpression = t.objectExpression([]);

    var existThis = false;
    const slotChilds: t.Expression[] = [];
    const IN_SLOT = 'inside the childs slot';
    const PLACED_IN_SLOT = 'childs: […] — the component places it with {this.childs}';
    const emitBound = (cx: t.Expression, bound: t.Expression): t.Node => {
        if (!isComponentTag) {
            const st = t.expressionStatement(bound);
            statements.push(st);
            return st;
        }
        const init = t.objectProperty(t.identifier('initializeComponent'), t.arrowFunctionExpression([id('sender')], t.blockStatement([t.expressionStatement(bound)])));
        const wrapped = t.callExpression(id(motifComponent()), [t.objectExpression([init])]);
        transferOrigin(cx, wrapped);
        slotChilds.push(wrapped);
        return wrapped;
    };
    const loweredOf = (emitted: t.Node, bound: t.Expression): t.Node | string => isComponentTag ? codeOf(bound) + ' — ' + IN_SLOT : emitted;
    if (childs.length > 0) {
        childs.forEach(cx => {

            if (t.isCallExpression(cx) && t.isIdentifier(cx.callee) && cx.callee.name.startsWith('sender.bindings.')) {
                emitBound(cx, cx);
                explainBindingCall(cx, fileName, isComponentTag ? IN_SLOT : undefined);
            }
            else if (t.isArrayExpression(cx)) {
                if (isComponentTag) {
                    slotChilds.push(cx);
                    explainPlaced(cx, fileName, PLACED_IN_SLOT);
                } else {
                    statements.push(t.expressionStatement(t.callExpression(id('sender.controls.add'), [cx])));
                    explainChild(cx, fileName, { site: 'child', shape: 'array', lowered: statements[statements.length - 1], reactive: 'static', deps: DEPS.none, note: 'the component array is placed once' });
                }
            }
            else
                if (t.isFunctionExpression(cx)) {
                    fail('MJX008', 'A function expression cannot be a JSX child; use an arrow function: {() => …}.', path as NodePath<t.Node>);
                }
                // else if (t.isArrowFunctionExpression(cx)) {
                else if (t.isAssignmentExpression(cx)) {
                    statements.push(t.expressionStatement(cx))
                } else if (isFallbackLogical(cx)) {
                    // C1: `{a ?? b}` / `{a || b}` — `when` DEĞİL
                    const fallback = makeFallbackChild(cx as t.LogicalExpression, state);
                    const emitted = emitBound(cx, fallback);
                    explainChild(cx, fileName, { site: 'child', shape: 'fallback', lowered: loweredOf(emitted, fallback), reactive: 'live', deps: DEPS.getter, note: 'reactive text if the result is text, a Frame if it is a component' });
                } else if (t.isLogicalExpression(cx)) {


                    var ifStatement = findIfStatements(cx.left);


                    if (t.isFunction(cx.left) || t.isArrowFunctionExpression(cx.left) || t.isFunctionExpression(cx.left) || t.isFunctionDeclaration(cx.left)) {

                        var mx = t.binaryExpression('===', t.unaryExpression('typeof', cx.left), t.stringLiteral('function'));
                        var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(cx.left, []), t.arrowFunctionExpression([], cx.left)));
                        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
                        var kx = t.arrowFunctionExpression([], t.blockStatement([rtrns]));
                        var tryStatement = t.tryStatement(t.blockStatement([rtrns]), null, null);
                        if (!t.isFunctionDeclaration(cx.right) && !t.isArrowFunctionExpression(cx.right)) {

                            var ifst = t.ifStatement(t.identifier('__v'),
                                t.blockStatement([t.returnStatement(cx.right)]),
                                t.blockStatement([t.returnStatement(t.callExpression(t.identifier(motifComponent()), [t.objectExpression([])]))]))

                            cx.right = t.arrowFunctionExpression([t.identifier("__v")], t.blockStatement([t.returnStatement(cx.right)]))
                        }
                        var a1 = t.callExpression(id('sender.bindings.when'), [kx, cx.right]);
                    } else {
                        // var mx = t.binaryExpression('===', t.unaryExpression('typeof', cx.left), t.stringLiteral('function'));
                        // var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(cx.left, []), t.arrowFunctionExpression([], cx.left)));
                        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([t.returnStatement(cx.left)]));
                        var tryStatement = t.tryStatement(t.blockStatement([rtrns]), makeReportedCatch(state, t.returnStatement(t.nullLiteral())), null);
                        var kx = cacheGuardCalls(t.arrowFunctionExpression([], t.blockStatement([tryStatement])), [cx.left]);

                        if (!t.isFunctionDeclaration(cx.right) && !t.isArrowFunctionExpression(cx.right)) {

                            var ifst = t.ifStatement(t.identifier('__v'),
                                t.blockStatement([t.returnStatement(cx.right)]),
                                t.blockStatement([t.returnStatement(t.callExpression(t.identifier(motifComponent()), [t.objectExpression([])]))]))

                            cx.right = t.arrowFunctionExpression([t.identifier("__v")], t.blockStatement([t.returnStatement(cx.right)]))
                        }
                        var a1 = t.callExpression(id('sender.bindings.when'), [kx, cx.right]);
                    }

                    // var mx = t.binaryExpression('===', t.unaryExpression('typeof', cx.left), t.stringLiteral('function'));
                    // var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(cx.left, []), t.arrowFunctionExpression([], cx.left)));
                    // var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]), t.blockStatement([t.returnStatement(t.arrowFunctionExpression([], t.nullLiteral()))]));
                    // var kx = t.arrowFunctionExpression([], t.blockStatement([rtrns]));
                    // if (!t.isFunctionDeclaration(cx.right) && !t.isArrowFunctionExpression(cx.right)) {

                    //     var ifst = t.ifStatement(t.identifier('val'),

                    // var a1 = t.callExpression(id('sender.bind.logic'), [kx, cx.right]);
                    emitBound(cx, a1);
                    explainChild(cx, fileName, { site: 'child', shape: 'when', lowered: isComponentTag ? codeOf(a1) + ' — ' + IN_SLOT : a1, reactive: 'live', deps: DEPS.cond, note: 'JS truthiness; false → never built, a NEW instance is built on each switch to true. Deliberate alternative: x-wait' });


                } else {
                    if (t.isStringLiteral(tag)) {
                        if (t.isCallExpression(cx) && t.isIdentifier(cx.callee) && cx.callee.name === 'sender.motif.on' && existThis == false) {
                            existThis = true;
                        }
                        if (t.isCallExpression(cx) && t.isIdentifier(cx.callee) && cx.callee.name === 'sender.bindings.list') {
                            hasLoop = true;
                            statements.push(t.expressionStatement(cx));
                        } else {
                            if (((t.isFunctionExpression(cx)) && t.isJSXElement((cx as t.FunctionExpression).returnType)) || ((t.isArrowFunctionExpression(cx)) && t.isJSXElement((cx as t.ArrowFunctionExpression).returnType))) {
                                statements.push(t.expressionStatement(t.callExpression(t.identifier('sender.bindings.method'), [cx])));
                                explainChild(cx, fileName, { site: 'child', shape: 'method', lowered: statements[statements.length - 1], reactive: 'live', deps: DEPS.getter, note: 'reactive text if the result is text, a Frame if it is a component (the instance is rebuilt on every change)' });
                            } else if ((t.isArrowFunctionExpression(cx))) {
                                statements.push(t.expressionStatement(t.callExpression(t.identifier('sender.bindings.method'), [cx])));
                                explainChild(cx, fileName, { site: 'child', shape: 'method', lowered: statements[statements.length - 1], reactive: 'live', deps: DEPS.getter, note: 'reactive text if the result is text, a Frame if it is a component (the instance is rebuilt on every change)' });
                            } else {
                                var uid = path.scope.generateUid('_comp');
                                statements.push(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(uid), cx)]));
                                statements.push(t.expressionStatement(t.callExpression(t.identifier('sender.controls.add'), [t.identifier(uid)])));
                                explainPlaced(cx, fileName);
                            }

                        }
                    } else if (t.isArrowFunctionExpression(cx)) {
                        const method = t.callExpression(t.identifier('sender.bindings.method'), [cx]);
                        const emitted = emitBound(cx, method);
                        explainChild(cx, fileName, { site: 'child', shape: 'method', lowered: loweredOf(emitted, method), reactive: 'live', deps: DEPS.getter, note: 'reactive text if the result is text, a Frame if it is a component (the instance is rebuilt on every change)' });
                    } else {
                        slotChilds.push(cx);
                        explainPlaced(cx, fileName, PLACED_IN_SLOT);
                    }
                }
        });
    }



    if (t.isStringLiteral(tag)) {
        let preStatements: t.Statement[] = [];


        if (preDirectives.length > 0) {
            preStatements.push(...preDirectives);
        }

        if (preStatements.length > 0) {
            var preconfigProp = t.objectProperty(t.identifier('preconfig'), t.arrowFunctionExpression([id('sender')], t.blockStatement([...preStatements])));
            bodyExpression.properties.push(preconfigProp);
        }

        if (componentEvents.length > 0) {
            bodyExpression.properties.push(...componentEvents)
        }
        if (setupProps.length > 0) {
            bodyExpression.properties.push(...setupProps)
        }
        if (objectExpression.length > 0) {
            // var expr = t.objectProperty(t.identifier('props'), t.objectExpression(objectExpression));
            bodyExpression.properties.push(...objectExpression)
        };
        if (spreadProps.length > 0) {
            bodyExpression.properties.push(...spreadProps)
        };

        const initProp = makeInitializeComponentProp(statements, userInit);
        if (initProp) {
            bodyExpression.properties.push(initProp);
        }


    } else {
        var tts = t.objectProperty(id('childs'), t.arrayExpression(slotChilds));
        if (objectExpression.length > 0) {
            //var expr = t.objectProperty(t.identifier('props'), t.objectExpression({ ...objectExpression, ...spreadProps }));
            bodyExpression.properties.push(...objectExpression)
        };

        if (spreadProps.length > 0) {
            bodyExpression.properties.push(...spreadProps)
        };

        var takedown = t.objectExpression([]);

        const initProp = makeInitializeComponentProp(statements, userInit);
        if (initProp) {
            takedown.properties.push(initProp);
        }

        if (preDirectives.length > 0) {
            let preStatements: t.Statement[] = [];
            preStatements.push(...preDirectives)
            var preconfigProp = t.objectProperty(t.identifier('preconfig'), t.arrowFunctionExpression([id('sender')], t.blockStatement([...preStatements])));
            takedown.properties.push(preconfigProp);
        }

        if (componentEvents.length > 0) {
            takedown.properties.push(...componentEvents)
        }
        if (setupProps.length > 0) {
            takedown.properties.push(...setupProps)
        }
        var exp = t.objectProperty(id('runover'), takedown);
        bodyExpression.properties.push(exp);
        bodyExpression.properties.push(tts);
    }

    callArgs.push(bodyExpression);


    return t.callExpression(t.identifier(motifComponent()), [tag, ...callArgs]);


}

export function ParseFrament(path: NodePath<t.JSXElement>, state: State): t.CallExpression | t.Expression | t.ObjectMethod {
    const fileName = String(state.get('filename') ?? '');
    const children = getChildren(path.get('children'), state);
    var childs: t.Expression[] = [];
    var initBody: t.BlockStatement = t.blockStatement([]);
    children.forEach(exp => {
        if (t.isExpression(exp)) {
            if (exp !== null) {
                var uid = path.scope.generateUid('_comp');
                if (t.isCallExpression(exp) && t.isIdentifier(exp.callee) && exp.callee.name === 'sender.repeater') {
                    initBody.body.push(t.expressionStatement(t.callExpression(id('sender.bindings.list'), [listSource(exp.arguments[0] as t.Expression), listRender(exp.arguments)])));
                    explainChild(exp, fileName, { site: 'child', shape: 'list', lowered: initBody.body[initBody.body.length - 1], reactive: 'live', deps: DEPS.list });
                } else if (isFallbackLogical(exp)) { 
                    initBody.body.push(t.expressionStatement(makeFallbackChild(exp as t.LogicalExpression, state)));
                    explainChild(exp, fileName, { site: 'child', shape: 'fallback', lowered: initBody.body[initBody.body.length - 1], reactive: 'live', deps: DEPS.getter });
                } else if (t.isLogicalExpression(exp)) { 
                    var ifStatement = findIfStatements(exp.left);
                    var condFn: t.ArrowFunctionExpression;
                    if (t.isFunction(exp.left) || t.isArrowFunctionExpression(exp.left) || t.isFunctionExpression(exp.left) || t.isFunctionDeclaration(exp.left)) {
                        var mx = t.binaryExpression('===', t.unaryExpression('typeof', exp.left), t.stringLiteral('function'));
                        var rtrn = t.returnStatement(t.conditionalExpression(mx, t.callExpression(exp.left, []), exp.left));
                        var rtrns = t.ifStatement(ifStatement!, t.blockStatement([rtrn]));
                        condFn = t.arrowFunctionExpression([], t.blockStatement([rtrns]));
                    } else {
                        var rtrnsPlain = t.ifStatement(ifStatement!, t.blockStatement([t.returnStatement(exp.left)]));
                        var tryStatement = t.tryStatement(t.blockStatement([rtrnsPlain]), makeReportedCatch(state, t.returnStatement(t.nullLiteral())), null);
                        condFn = cacheGuardCalls(t.arrowFunctionExpression([], t.blockStatement([tryStatement])), [exp.left]);
                    }
                    if (!t.isFunctionDeclaration(exp.right) && !t.isArrowFunctionExpression(exp.right)) {
                        exp.right = t.arrowFunctionExpression([t.identifier("val")], t.blockStatement([t.returnStatement(exp.right)]))
                    }
                    var a1 = t.callExpression(id('sender.bindings.when'), [condFn, exp.right]);
                    initBody.body.push(t.expressionStatement(a1));
                    explainChild(exp, fileName, { site: 'child', shape: 'when', lowered: a1, reactive: 'live', deps: DEPS.cond, note: 'at a fragment root; JS truthiness. Deliberate alternative: x-wait' });
                }
                else {
                    childs.push(exp);
                    initBody.body.push(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(uid), exp)]));
                    if ((t.isFunctionExpression(exp)) && t.isJSXElement((exp as t.FunctionExpression).returnType)) {
                        initBody.body.push(t.expressionStatement(t.callExpression(t.identifier('sender.bindings.method'), [t.identifier(uid)])))
                        explainChild(exp, fileName, { site: 'child', shape: 'method', lowered: `sender.bindings.method(${codeOf(exp)})`, reactive: 'live', deps: DEPS.getter });
                    } else if ((t.isArrowFunctionExpression(exp)) && t.isJSXElement((exp as t.ArrowFunctionExpression).returnType)) {
                        initBody.body.push(t.expressionStatement(t.callExpression(t.identifier('sender.bindings.method'), [t.identifier(uid)])))
                        explainChild(exp, fileName, { site: 'child', shape: 'method', lowered: `sender.bindings.method(${codeOf(exp)})`, reactive: 'live', deps: DEPS.getter });
                    } else if ((t.isArrowFunctionExpression(exp))) {
                        initBody.body.push(t.expressionStatement(t.callExpression(t.identifier('sender.bindings.method'), [t.identifier(uid)])))
                        explainChild(exp, fileName, { site: 'child', shape: 'method', lowered: `sender.bindings.method(${codeOf(exp)})`, reactive: 'live', deps: DEPS.getter, note: 'reactive text if the result is text, a Frame if it is a component' });
                    } else if (t.isCallExpression(exp) && t.isIdentifier(exp.callee) && exp.callee.name.startsWith('sender.bindings.')) {
                        initBody.body.push(t.expressionStatement(t.callExpression(t.identifier('sender.controls.add'), [t.identifier(uid)])))
                        explainBindingCall(exp, fileName, 'at a fragment root');
                    } else {
                        initBody.body.push(t.expressionStatement(t.callExpression(t.identifier('sender.controls.add'), [t.identifier(uid)])))
                        explainPlaced(exp, fileName);
                    }



                }
            }
        }
    })


    if (!state.get(motifFragment())) {
        state.set(motifFragment(), motifFragment());
    }


    var tts = t.objectProperty(id('nodes'), t.arrayExpression(childs));
    var objExp = t.objectExpression([]);
    if (initBody !== null) {

        var initProp = t.objectProperty(t.identifier('initializeComponent'), t.arrowFunctionExpression([id('sender')], t.blockStatement([initBody])));

        objExp.properties.push(initProp);
    }
    return t.callExpression(t.identifier(motifFragment()), [objExp]);
}