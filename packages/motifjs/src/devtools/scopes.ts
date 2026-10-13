import { preview, rootProvider, tokenName } from './inspect';

type Emit = (type: string, payload?: any) => void;

export type DevScope = {
    id: number; kind: 'root' | 'navigation' | 'user'; name: string | null; parent: number | null;
    current: boolean; pending: boolean; pins: number;
    services: { token: string; lifetime: string; instance: unknown; creating?: true }[];
    transients: unknown[];
};

const ids = new WeakMap<object, number>();
const created = new Map<number, WeakRef<any>>();
let seq = 0;
let recording = false;
let pending = false;
let emitter: () => Emit | undefined = () => undefined;

export function recordScopes(on: boolean): void { recording = on; }
export function bindScopesEmitter(fn: () => Emit | undefined): void { emitter = fn; }

function idOf(scope: object): number {
    let id = ids.get(scope);
    if (id === undefined) ids.set(scope, id = ++seq);
    return id;
}

export function scopesChanged(): void {
    if (pending || emitter() === undefined) return;
    pending = true;
    queueMicrotask(() => { pending = false; emitter()?.('scopes:changed', {}); });
}

export function scopeCreated(scope: object): void {
    if (!recording) return;
    created.set(idOf(scope), new WeakRef(scope));
    scopesChanged();
}

export function scopeDisposed(scope: object): void {
    const id = ids.get(scope);
    if (id !== undefined) created.delete(id);
    const emit = emitter();
    if (emit !== undefined) servicesDisposed(scope, emit);
    scopesChanged();
}

const transientTokens = new WeakMap<object, any>();

const sourceOf = (desc: any) => desc.useValue !== undefined ? 'value' : desc.useFactory ? 'factory' : 'class';

export function serviceCreated(scope: object, desc: any, inst: any): void {
    const emit = emitter();
    if (emit === undefined) return;
    if (desc.lifetime === 'transient' && inst !== null && typeof inst === 'object') transientTokens.set(inst, desc.token);
    emit('service:created', { scope: idOf(scope), token: tokenName(desc.token), lifetime: desc.lifetime, source: sourceOf(desc), instance: preview(inst) });
}

function servicesDisposed(scope: any, emit: Emit): void {
    const lifetimes: Map<any, any> | undefined = scope.root.services?.descriptors;
    const send = (token: any, inst: any, lifetime: string) =>
        emit('service:disposed', { scope: idOf(scope), token: tokenName(token), lifetime, instance: preview(inst) });
    if (scope.root === scope) for (const [token, inst] of scope.singletonCache) send(token, inst, 'singleton');
    for (const [token, inst] of scope.scopedCache) send(token, inst, lifetimes?.get(token)?.lifetime ?? 'scoped');
    for (const inst of scope.transientSet) send(transientTokens.get(inst) ?? null, inst, 'transient');
}

function listScopes(root: any): Set<any> {
    const list = new Set<any>([root, ...(root._navigation?.scopes ?? [])]);
    for (const [id, ref] of [...created].sort((a, b) => a[0] - b[0])) {
        const s = ref.deref();
        if (s === undefined) { created.delete(id); continue; }
        if (s.root !== root) continue;
        const chain: any[] = [];
        for (let p = s; p && !list.has(p); p = p.parent) chain.unshift(p);
        for (const p of chain) list.add(p);
    }
    return list;
}

export function serviceInstance(scopeId: number, token: string): { found: boolean; value?: any; error?: string } {
    const root = rootProvider();
    const scope = root === null ? undefined : [...listScopes(root)].find(s => ids.get(s) === scopeId);
    if (scope === undefined) return { found: false, error: 'no scope' };
    const caches: Map<any, any>[] = scope === root ? [scope.singletonCache, scope.scopedCache] : [scope.scopedCache];
    for (const cache of caches) for (const [t, inst] of cache) if (tokenName(t) === token) return { found: true, value: inst };
    return { found: false, error: 'no service' };
}

export function getScopes(): DevScope[] {
    const root = rootProvider();
    if (root === null) return [];
    const list = listScopes(root);
    const descriptors: Map<any, any> | undefined = root.services?.descriptors;
    const lifetimeOf = (token: any) => descriptors?.get(token)?.lifetime ?? '';
    return [...list].map(s => {
        const services: DevScope['services'] = [];
        const add = (cache: Map<any, any>, building: Map<any, any>) => {
            for (const [token, inst] of cache) services.push({ token: tokenName(token), lifetime: lifetimeOf(token), instance: preview(inst) });
            for (const token of building.keys()) if (!cache.has(token)) services.push({ token: tokenName(token), lifetime: lifetimeOf(token), instance: null, creating: true });
        };
        if (s === root) add(s.singletonCache, s.pendingSingleton);
        add(s.scopedCache, s.pendingScoped);
        return {
            id: idOf(s), kind: s.kind, name: s.scopeName ?? null, parent: s.parent ? idOf(s.parent) : null,
            current: (root._navigation?.current ?? root) === s, pending: s._pending, pins: s._livePins,
            services, transients: [...s.transientSet].map(preview),
        };
    });
}
