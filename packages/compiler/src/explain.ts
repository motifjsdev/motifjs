import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
import * as generatorNs from '@babel/generator';

// CJS/ESM ikili paketlemede `default` bazen sarmalanır; iki biçimi de kabul et.
const generate: (node: any, opts?: any) => { code: string } =
    ((generatorNs as any).default?.default ?? (generatorNs as any).default ?? generatorNs) as any;


/** İfadenin JSX içindeki konumu. */
export type ExplainSite =
    | 'child'
    | 'element'
    | 'attr'
    | 'prop'
    | 'event'
    | 'directive'
    | 'component-event'
    | 'key';

export type ExplainReactivity = 'live' | 'static' | 'once' | 'receiver' | 'runtime' | 'n/a';

export interface MotifExplanation {
    file: string;
    line: number | null;
    column: number | null;
    /** Konum türü. */
    site: ExplainSite;
    /** İfade şekli */
    shape: string;
    /** Kaynak parça (tek satıra indirgenmiş, kırpılmış). */
    source: string;
    /** İndiği çağrı — üretilmiş koddan alınır, tahmin değildir. */
    lowered: string;
    reactive: ExplainReactivity;
    /** Bağımlılık yüzeyi: hangi okumalar bu bağı yeniden tetikler. */
    deps: string;
    /** Serbest not (tuzak, sözleşme). */
    note?: string;
}

let active: MotifExplanation[] | null = null;

export interface Origin { line: number | null; column: number | null; source: string }

/** Üretilmiş düğüm → kaynak konumu. getChildren'da not edilir, emisyon noktasında okunur. */
const origins = new WeakMap<object, Origin>();

export function beginExplain(): void {
    active = [];
}

export function endExplain(): MotifExplanation[] {
    const out = active ?? [];
    active = null;
    const key = (e: MotifExplanation) => (e.line ?? 1e9) * 10000 + (e.column ?? 0);
    return out.map((e, i) => ({ e, i })).sort((a, b) => key(a.e) - key(b.e) || a.i - b.i).map(x => x.e);
}

export function isExplaining(): boolean {
    return active !== null;
}

const MAX_SOURCE = 90;
const MAX_LOWERED = 220;

function oneLine(s: string, max: number): string {
    const flat = s.replace(/\s+/g, ' ').trim();
    return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/** Kaynak parçayı orijinal koddan alır (`{…}` süslüleri dahil). JSX elemanında yalnızca açılış etiketi. */
export function sourceOf(path: NodePath<t.Node> | null, originalCode: string | undefined): string {
    let n: any = path?.node;
    if (n && t.isJSXElement(n)) n = n.openingElement;
    if (!n || typeof n.start !== 'number' || typeof n.end !== 'number' || !originalCode) return '';
    return oneLine(originalCode.slice(n.start, n.end), MAX_SOURCE);
}

/** Konumu ve kaynak parçayı ANINDA alır (yol daha sonra değişebilir). */
export function captureOrigin(path: NodePath<t.Node>, originalCode: string | undefined): Origin {
    return {
        line: path.node?.loc?.start?.line ?? null,
        column: path.node?.loc?.start?.column ?? null,
        source: sourceOf(path, originalCode),
    };
}

/** Üretilmiş bir düğümü tek satır koda çevirir. Yalnızca gösterim içindir. */
export function codeOf(node: t.Node | null | undefined): string {
    if (!node) return '';
    try {
        const out = generate(node as any, { concise: true, comments: false }).code;
        return oneLine(out.replace(/;$/, ''), MAX_LOWERED);
    } catch {
        return `<${(node as any).type}>`;
    }
}

export function noteOrigin(node: unknown, path: NodePath<t.Node>, originalCode: string | undefined): void {
    if (!active || !node || typeof node !== 'object') return;
    if (origins.has(node as object)) return;
    origins.set(node as object, captureOrigin(path, originalCode));
}

/** Konumu önceden alınmış düğüm için (derleyicinin JSXElement exit'i). */
export function noteOriginRaw(node: unknown, origin: Origin): void {
    if (!active || !node || typeof node !== 'object') return;
    if (origins.has(node as object)) return;
    origins.set(node as object, origin);
}

/** `sender.repeater` → `_mc({initializeComponent: list})` gibi yeniden sarmalarda kaynağı taşır. */
export function transferOrigin(from: unknown, to: unknown): void {
    if (!active || !from || !to || typeof from !== 'object' || typeof to !== 'object') return;
    const o = origins.get(from as object);
    if (o) origins.set(to as object, o);
}

export interface ExplainInput {
    site: ExplainSite;
    shape: string;
    lowered: t.Node | string | null | undefined;
    reactive: ExplainReactivity;
    deps: string;
    note?: string;
}

/** Konumu doğrudan bilinen kayıt (öznitelikler). */
export function explainAt(path: NodePath<t.Node> | null, filename: string, originalCode: string | undefined, e: ExplainInput): void {
    if (!active) return;
    active.push({
        file: filename,
        line: path?.node?.loc?.start?.line ?? null,
        column: path?.node?.loc?.start?.column ?? null,
        site: e.site,
        shape: e.shape,
        source: sourceOf(path, originalCode),
        lowered: typeof e.lowered === 'string' ? oneLine(e.lowered, MAX_LOWERED) : codeOf(e.lowered),
        reactive: e.reactive,
        deps: e.deps,
        note: e.note,
    });
}

/** Konumu `noteOrigin` ile kaydedilmiş bir çocuk düğüm için kayıt (emisyon noktası). */
export function explainChild(produced: unknown, filename: string, e: ExplainInput): void {
    if (!active || !produced || typeof produced !== 'object') return;
    const o = origins.get(produced as object);
    if (!o) return;
    active.push({
        file: filename,
        line: o.line,
        column: o.column,
        site: e.site,
        shape: e.shape,
        source: o.source,
        lowered: typeof e.lowered === 'string' ? oneLine(e.lowered, MAX_LOWERED) : codeOf(e.lowered),
        reactive: e.reactive,
        deps: e.deps,
        note: e.note,
    });
}

 
export const DEPS = {
    none: 'none — no binding is created',
    once: 'none — evaluated once during setup, then frozen',
    getter: 'ALL reactive fields read inside the getter; collected again on every run',
    field: (obj: string, prop: string) => `${obj}.${prop} — this field only (exact)`,
    cond: 'fields read in the condition getter; bindings inside a branch are the branch\'s own effects, and the branch is rebuilt on every switch',
    list: 'the array source (length + item identity/key); bindings inside an item are the item\'s own effects',
    receiver: 'wherever the receiving component reads the getter; nowhere if it does not',
    runtime: 'if the value is a function, the fields read inside it; otherwise none (once)',
    model: 'model field ↔ DOM value, two-way',
    modelOneWay: 'ALL reactive fields read inside the getter; the expression is not assignable, so the DOM value is not written back (one-way)',
} as const;
 
export function describeTextNode(node: t.Node): { lowered: string; shape: string; reactive: ExplainReactivity; deps: string; note?: string } | null {
    if (!t.isCallExpression(node)) return null;
    const args = node.arguments;
    if (args.length < 2 || !t.isStringLiteral(args[0]) || args[0].value !== 'text' || !t.isObjectExpression(args[1])) return null;
    const init = args[1].properties.find(p => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'initializeComponent') as t.ObjectProperty | undefined;
    if (!init || !t.isArrowFunctionExpression(init.value) || !t.isBlockStatement(init.value.body)) return null;
    const stmt = init.value.body.body[0];
    if (!stmt || !t.isExpressionStatement(stmt) || !t.isCallExpression(stmt.expression)) return null;
    const call = stmt.expression;
    const callee = t.isIdentifier(call.callee) ? call.callee.name : codeOf(call.callee);
    const lowered = codeOf(call);

    if (callee === 'sender.setText') {
        return { lowered, shape: 'text.static', reactive: 'static', deps: DEPS.none };
    }
    if (callee === 'sender.bindings.add') {
        if (call.arguments.length === 3 && t.isStringLiteral(call.arguments[2])) {
            return {
                lowered, shape: 'text.field', reactive: 'live',
                deps: DEPS.field(codeOf(call.arguments[1]), (call.arguments[2] as t.StringLiteral).value),
            };
        }
        const probe = args[1].properties.some(p => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === '__childExpr');
        return {
            lowered, shape: 'text.getter', reactive: 'live', deps: DEPS.getter,
            note: probe ? 'if the variable holds a component (or an array of components), it is placed with controls.add instead of as text (__childExpr probe, untracked)' : undefined,
        };
    }
    if (callee === 'sender.bindings.when') {
        return { lowered, shape: 'when', reactive: 'live', deps: DEPS.cond };
    }
    return { lowered, shape: 'text', reactive: 'live', deps: DEPS.getter };
}
 
const REACTIVE_LABEL: Record<ExplainReactivity, string> = {
    live: 'LIVE', static: 'STATIC', once: 'ONCE', receiver: 'RECEIVER', runtime: 'RUNTIME', 'n/a': '—',
};

export function formatExplanations(list: MotifExplanation[]): string {
    if (list.length === 0) return '';
    const byFile = new Map<string, MotifExplanation[]>();
    for (const e of list) {
        const arr = byFile.get(e.file) ?? [];
        arr.push(e);
        byFile.set(e.file, arr);
    }
    const out: string[] = [];
    for (const [file, items] of byFile) {
        out.push(`[motifjs explain] ${file} — ${items.length} expressions`);
        for (const e of items) {
            const where = e.line === null ? '?' : `${e.line}:${(e.column ?? 0) + 1}`;
            out.push(`  ${where.padEnd(8)} ${(e.site + '/' + e.shape).padEnd(24)} ${e.source}`);
            out.push(`           => ${e.lowered}`);
            out.push(`           ${REACTIVE_LABEL[e.reactive]} · deps: ${e.deps}`);
            if (e.note) out.push(`           note: ${e.note}`);
        }
    }
    return out.join('\n');
}

export function printExplanations(list: MotifExplanation[]): void {
    const text = formatExplanations(list);
    if (text) console.info(text);
}