let root: any = null;

export function setTreeRoot(c: any): void { root = c; }
export function clearTreeRoot(c: any): void { if (root === c) root = null; }

export type TreeNode = {
    path: number[]; type: string; tag: string;
    built: boolean; visible: boolean; waiting: boolean; disposed: boolean; connected: boolean;
    childCount: number; children?: TreeNode[];
};

export function tagOf(c: any): string {
    const n = c.element as Node | null;
    return !n ? '' : n.nodeType === 8 ? '#fragment' : n.nodeType === 3 ? '#text' : String(n.nodeName).toLowerCase();
}

export function pathOf(c: any): number[] | null {
    const path: number[] = [];
    let cur = c;
    while (cur.parent) {
        const i = cur.parent._controls?.items.indexOf(cur) ?? -1;
        if (i < 0) return null;
        path.push(i);
        cur = cur.parent;
    }
    return path.reverse();
}

export function componentAt(path: number[]): any | null {
    let cur = root;
    for (const i of path) {
        if (cur === null) return null;
        cur = cur._controls?.items[i] ?? null;
    }
    return cur;
}

function nodeOf(c: any, path: number[], depth: number): TreeNode {
    const items: any[] = c._controls?.items ?? [];
    const out: TreeNode = {
        path, type: c.constructor?.name ?? '', tag: tagOf(c),
        built: !!c.isBuilt, visible: !!c.isVisible, waiting: !!c.isWait, disposed: !!c.isDisposed,
        connected: !!(c.element as any)?.isConnected,
        childCount: items.length,
    };
    if (depth > 0) out.children = items.map((ch, i) => nodeOf(ch, [...path, i], depth - 1));
    return out;
}

export function getTree(path: number[] = [], depth: number = Infinity): TreeNode | null {
    const c = componentAt(path);
    return c === null ? null : nodeOf(c, path.slice(), depth);
}

const requested = new WeakMap<object, Set<any>>();
let scopeResolver: ((owner: object) => any) | null = null;

export function recordService(owner: object, token: any): void {
    let s = requested.get(owner);
    if (s === undefined) requested.set(owner, s = new Set());
    s.add(token);
}
export function setScopeResolver(fn: (owner: object) => any): void { scopeResolver = fn; }

const tokenName = (t: any): string => typeof t === 'function' ? (t.name || '[AnonymousClass]') : String(t);
const isComponent = (v: any): boolean => typeof v.build === 'function' && 'isDisposed' in v && 'motif' in v;

export function preview(v: any): any {
    if (v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'bigint' || typeof v === 'symbol') return v.toString();
    if (typeof v === 'function') return { kind: 'function', name: v.name || '' };
    if (typeof v.nodeType === 'number') return { kind: 'node', tag: String(v.nodeName).toLowerCase() };
    if (isComponent(v)) return { kind: 'component', path: pathOf(v), type: v.constructor?.name ?? '' };
    if (Array.isArray(v)) return { kind: 'array', length: v.length };
    return { kind: 'object', type: v.constructor?.name ?? 'Object', keys: Object.keys(v).length };
}

const MODIFIERS: [number, string][] = [[1, 'self'], [2, 'trusted'], [4, 'prevent'], [8, 'stop'], [16, 'capture']];
const HOOKS: [string, string][] = [
    ['initializeComponent', '_initializeComponentHandlers'], ['onInitializing', '_onInitializingHandlers'],
    ['onInitialized', '_onInitializedHandlers'], ['onConfig', '_onConfigHandlers'],
    ['onConfigured', '_onConfiguredHandlers'], ['onBuilding', '_onBuildingHandlers'],
    ['onBuilt', '_onBuiltHandlers'], ['onMounted', '_onMountedHandlers'],
    ['onVisibilityChanged', '_onVisibilityChangedHandlers'], ['onActivated', '_onActivatedHandlers'],
    ['onDeactivated', '_onDeactivatedHandlers'], ['onDisposing', '_onDisposingHandlers'],
    ['onDisposed', '_onDisposedHandlers'],
];

function bindingsOf(c: any) {
    const items: any[] = c._bindings?._items ?? [];
    return items.map(b => {
        const prop = String(b.propertyName ?? '');
        const kind = prop === '__list__' ? 'list' : prop === '__conditional__' ? 'conditional'
            : prop.startsWith('__class:') ? 'class' : prop.startsWith('__attr:') ? 'attr' : prop === '__style' ? 'style' : 'property';
        return { kind, property: kind === 'property' ? prop : undefined, member: b.dataMember, updateMode: b.updateMode, active: b._isActive ?? null };
    });
}

function eventsOf(c: any) {
    const out: any[] = [];
    for (let r = c._eventHandlers; r; r = r.next) {
        if ((r.flags & 64) !== 0) continue;
        out.push({ name: r.key, type: r.type, dom: (r.flags & 32) !== 0, handler: r.original?.name ?? '', modifiers: MODIFIERS.filter(([f]) => (r.flags & f) !== 0).map(([, n]) => n) });
    }
    return out;
}

function hooksOf(c: any) {
    const ctx = c._baseCtx;
    const out: any[] = [];
    for (const [name, slot] of HOOKS) {
        const h = ctx?.[slot];
        const handlers = h == null ? 0 : Array.isArray(h) ? h.length : 1;
        const method = typeof c[name] === 'function';
        if (method || handlers > 0) out.push({ name, method, handlers });
    }
    return out;
}

function classesOf(c: any) {
    const k = c._class;
    if (!k) return { static: [], reactive: [] };
    const st = new Set<string>();
    if (k._plain) for (const n of String(k._plain).split(' ')) if (n) st.add(n);
    if (k._staticSetStore) for (const n of k._staticSetStore) st.add(n);
    const watchers: any[] = [];
    if (k._watcherOne) watchers.push(k._watcherOne);
    if (k._watchersStore) for (const w of k._watchersStore.values()) watchers.push(w);
    return { static: [...st], reactive: watchers.map(w => ({ id: w.id, classes: [...w.set] })) };
}

function attributesOf(c: any) {
    const a = c._baseCtx?._attr;
    const map: Map<any, any> | undefined = a?._attrMapStore;
    if (!map) return [];
    return [...map].map(([name, value]) => ({ name: String(name), value: preview(value), reactive: !!a._watchersStore?.has(name) }));
}

function providerOf(c: any): any {
    for (let p = c; p; p = p.parent) if (p.provider) return p.provider;
    return null;
}

function servicesOf(c: any) {
    const scope = scopeResolver?.(c) ?? providerOf(c)?._currentScope?.() ?? null;
    return {
        scope: scope ? { kind: scope.kind, name: scope.scopeName ?? null } : null,
        requested: [...(requested.get(c) ?? [])].map(tokenName),
    };
}

export type EffectInfo = { owner: object | null; kind: string; runs: number; lastDuration: number; lastRunAt: number; lastTrigger: { target: any; key: string } | null };

const effectInfos = new WeakMap<object, EffectInfo>();
const ownedEffects = new WeakMap<object, Set<object>>();

export function effectInfoOf(e: object): EffectInfo {
    let i = effectInfos.get(e);
    if (i === undefined) effectInfos.set(e, i = { owner: null, kind: 'effect', runs: 0, lastDuration: 0, lastRunAt: 0, lastTrigger: null });
    return i;
}

export function ownEffect(owner: object, e: object, info: EffectInfo): void {
    info.owner = owner;
    let s = ownedEffects.get(owner);
    if (s === undefined) ownedEffects.set(owner, s = new Set());
    s.add(e);
}

export function disownEffect(e: object): void {
    const owner = effectInfos.get(e)?.owner;
    if (owner) ownedEffects.get(owner)?.delete(e);
}

function effectsOf(c: any) {
    const s = ownedEffects.get(c);
    if (s === undefined) return [];
    return [...s].filter(e => (e as any).active !== false).map(e => {
        const i = effectInfoOf(e);
        const deps: any[] = (e as any).deps ?? [];
        return { kind: i.kind, runs: i.runs, lastDuration: i.lastDuration, lastTrigger: i.lastTrigger, deps: deps.map(([t, k]) => ({ target: preview(t), key: String(k) })) };
    });
}

export function inspect(path: number[]): any | null {
    const c = componentAt(path);
    if (c === null) return null;
    const props: Record<string, any> = {};
    if (c.props) for (const k of Object.keys(c.props)) props[k] = preview(c.props[k]);
    return {
        ...nodeOf(c, path.slice(), 0),
        props, bindings: bindingsOf(c), events: eventsOf(c), hooks: hooksOf(c),
        classes: classesOf(c), attributes: attributesOf(c), services: servicesOf(c), effects: effectsOf(c),
    };
}

export function getServices(): any[] {
    const sp = root?.provider;
    const descriptors: Map<any, any> | undefined = sp?.services?.descriptors;
    if (!descriptors) return [];
    const scope = sp._currentScope?.();
    return [...descriptors.values()].map(d => ({
        token: tokenName(d.token),
        lifetime: d.lifetime,
        created: !!(sp.singletonCache?.has(d.token) || scope?.scopedCache?.has(d.token)),
    }));
}

export function getElement(path: number[]): Node | null {
    return componentAt(path)?.element ?? null;
}

export function pathOfElement(node: Node | null): number[] | null {
    if (root === null || !node) return null;
    const byNode = new Map<Node, number[]>();
    const walk = (c: any, path: number[]) => {
        if (c.element) byNode.set(c.element, path);
        const items: any[] = c._controls?.items ?? [];
        for (let i = 0; i < items.length; i++) walk(items[i], [...path, i]);
    };
    walk(root, []);
    for (let n: Node | null = node; n; n = n.parentNode) {
        const p = byNode.get(n);
        if (p) return p;
    }
    return null;
}
