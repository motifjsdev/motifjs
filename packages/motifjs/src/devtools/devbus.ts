import { getTree, getElement, pathOfElement, inspect, getServices, componentAt, holdersOf, type StoreHolder } from './inspect';
import { getCounters, resetCounters } from './counters';
import { getExtensions, readExtension, inspectExtensions, bindExtensionEmitter } from './extensions';
import { setClass, setAttribute, setVisible, writeModel, setProp, navigate, BLOCKED_KEYS, type WriteResult } from './writes';
import { readValue, readFrom } from './read';
import type { MotifDevtools, DevtoolsEvent } from './types';

export type DevWarning = { code: string; message: string; details?: any; count: number; firstAt: number; lastAt: number };
type StoreEntry = { id: number; name: string; type: 'reactive' | 'signal' | 'computed'; ref: WeakRef<object> };
export type DevStore = { id: number; name: string; type: StoreEntry['type']; value: any; stale?: boolean; holders: StoreHolder[] };
export type DevNavigation = { requested: string; uri: string | null; outcome: string; reason?: string; params?: any; duration: number; at: number };
export type DevError = { context: string; name: string; message: string; error: any; count: number; firstAt: number; lastAt: number };

const state = {
    enabled: false as boolean,
    listeners: new Set<(ev: DevtoolsEvent) => void>(),
    warnings: new Map<string, DevWarning>(),
    routes: null as any,
    stores: new Map<number, StoreEntry>(),
    storeSeq: 0,
    storePrune: 256,
    navigations: [] as DevNavigation[],
    route: null as { uri: string; params: any; chain: string[] } | null,
    errors: new Map<string, DevError>(),
    exposed: null as MotifDevtools | null,
};

/** Dev modu: devtools açık ya da `globalThis.__MOTIF_DEV__ === true`. */
export function isDevLike(): boolean {
    return state.enabled || (globalThis as any).__MOTIF_DEV__ === true;
}

let earlyStores = (() => { try { return (globalThis as any).__MOTIF_DEV__ === true; } catch { return false; } })();

export function setDevtoolsEnabled(enabled: boolean) {
    earlyStores = enabled;
    if (enabled && !state.enabled) resetCounters();
    state.enabled = enabled;
    try {
        const g = globalThis as any;
        if (enabled) {
            state.exposed = { version: 1, on, getWarnings, getRoutes, getStores, getTree, getElement, pathOfElement, inspect: inspectWithExtensions, getServices, getCounters, getRoute, getNavigations, getErrors, getExtensions, readExtension, readValue, readStore, setClass, setAttribute, setVisible, writeModel, setProp, navigate, setStoreValue, isEnabled };
            g.__MOTIF_DEVTOOLS__ = state.exposed;
        } else {
            if (state.exposed !== null && g.__MOTIF_DEVTOOLS__ === state.exposed) delete g.__MOTIF_DEVTOOLS__;
            state.exposed = null;
        }
    } catch { }
}

export function isEnabled(): boolean { return state.enabled; }

export function devtools(): ((type: string, payload?: any) => void) | undefined {
    return state.enabled ? emit : undefined;
}

bindExtensionEmitter(devtools);

function inspectWithExtensions(path: number[]) {
    const r = inspect(path);
    if (r !== null) r.extensions = inspectExtensions(componentAt(path));
    return r;
}

export function on(listener: (ev: DevtoolsEvent) => void): () => void {
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
}

function emit(type: string, payload?: any) {
    const ev = { type, payload } as DevtoolsEvent;
    for (const l of state.listeners) {
        try { l(ev); } catch { }
    }
}

export function warn(code: string, message: string, details?: any) {
    if (!isDevLike()) return;
    const key = code + '\u0000' + message;
    const now = Date.now();
    let w = state.warnings.get(key);
    if (w === undefined) {
        w = { code, message, details, count: 1, firstAt: now, lastAt: now };
    } else {
        state.warnings.delete(key);
        w.count++;
        w.lastAt = now;
    }
    state.warnings.set(key, w);
    if (state.warnings.size > 200) state.warnings.delete(state.warnings.keys().next().value!);
    try { if (typeof console !== 'undefined') details === undefined ? console.warn(`[motifjs] ${code}: ${message}`) : console.warn(`[motifjs] ${code}: ${message}`, details); } catch { }
    devtools()?.('warning', { code, message, details });
}

export function getWarnings(): DevWarning[] { return Array.from(state.warnings.values(), w => ({ ...w })); }

export function setRoutes(routes: any) { state.routes = routes; }
export function getRoutes(): any { return state.routes; }

export function navigationStarted(uri: string): { requested: string; at: number } | null {
    if (!state.enabled) return null;
    emit('route:navigation-start', { uri });
    return { requested: uri, at: performance.now() };
}

function outcomeOf(result: any): { outcome: string; reason?: string } {
    if (result === undefined || result === null) return { outcome: 'error' };
    if (result.skipped) return { outcome: 'skipped' };
    if (result.cancelled) return { outcome: 'cancelled', reason: result.reason };
    if (result.ok === false) return { outcome: result.route?.name === 'error' ? 'error' : 'notFound' };
    return { outcome: 'done' };
}

export function navigationFinished(started: { requested: string; at: number } | null, result: any, chainOf: (r: any) => string[]): void {
    if (started === null || !state.enabled) return;
    const { requested } = started;
    const { outcome, reason } = outcomeOf(result);
    const uri: string | null = result?.uri ?? null;
    const nav: DevNavigation = { requested, uri, outcome, reason, params: result?.params, duration: performance.now() - started.at, at: Date.now() };
    state.navigations.push(nav);
    if (state.navigations.length > 50) state.navigations.shift();
    if ((outcome === 'done' || outcome === 'notFound' || outcome === 'error') && uri !== null && Array.isArray(result?.chain)) {
        let chain: string[] = [];
        try { chain = chainOf(result); } catch { }
        state.route = { uri, params: result.params, chain };
    }
    emit('route:navigation-end', { uri: uri ?? requested, requested, outcome, reason, params: result?.params, duration: nav.duration });
}

export function getRoute() { return state.route === null ? null : { ...state.route }; }
export function getNavigations(): DevNavigation[] { return state.navigations.map(n => ({ ...n })); }

export function errorCaught(context: string, error: any, serialize: () => any): void {
    if (!state.enabled) return;
    const name = String(error?.name ?? ''), message = String(error?.message ?? error);
    const key = context + '\u0000' + name + '\u0000' + message;
    const now = Date.now();
    const serialized = serialize();
    let e = state.errors.get(key);
    if (e === undefined) {
        e = { context, name, message, error: serialized, count: 1, firstAt: now, lastAt: now };
    } else {
        state.errors.delete(key);
        e.count++;
        e.lastAt = now;
    }
    state.errors.set(key, e);
    if (state.errors.size > 100) state.errors.delete(state.errors.keys().next().value!);
    emit('error:caught', { context, error: serialized });
}

export function getErrors(): DevError[] { return Array.from(state.errors.values(), e => ({ ...e })); }

export function registerStore(value: object, type: StoreEntry['type'], fallback: string, model?: unknown): void {
    if (!state.enabled && !earlyStores) return;
    addStore(value, type, classNameOf(model) ?? fallback);
}

function addStore(value: object, type: StoreEntry['type'], name: string): number {
    const id = ++state.storeSeq;
    state.stores.set(id, { id, name, type, ref: new WeakRef(value) });
    if (state.stores.size >= state.storePrune) pruneStores();
    return id;
}

const IS_REACTIVE = Symbol.for('motif.isReactive');
const internal = new WeakSet<object>();

export function internalState(value: object): void { internal.add(value); }

function storeTypeOf(v: any): StoreEntry['type'] | null {
    if (internal.has(v)) return null;
    try { if (v[IS_REACTIVE] === true) return 'reactive'; } catch { }
    if (typeof v.peek === 'function' && '_target' in v && '_value' in v) return '_getter' in v ? 'computed' : 'signal';
    return null;
}

function adopt(v: any, ids: Map<object, number>): number | undefined {
    const type = storeTypeOf(v);
    if (type === null) return undefined;
    const id = addStore(v, type, type === 'reactive' ? (classNameOf(rawOf(v)) ?? 'reactive') : type);
    ids.set(v, id);
    return id;
}

function classNameOf(model: unknown): string | null {
    if (model === null || typeof model !== 'object') return null;
    const proto = Object.getPrototypeOf(model);
    return proto === null || proto === Object.prototype ? null : (proto.constructor?.name || null);
}

function pruneStores(): void {
    for (const [id, e] of state.stores) if (e.ref.deref() === undefined) state.stores.delete(id);
    state.storePrune = Math.max(256, state.stores.size * 2);
}

export function getStores(): DevStore[] {
    pruneStores();
    const ids = new Map<object, number>();
    for (const e of state.stores.values()) {
        const target = e.ref.deref();
        if (target !== undefined) ids.set(target, e.id);
    }
    const holders = holdersOf(v => ids.get(v) ?? adopt(v, ids));
    const live: [StoreEntry, any][] = [];
    for (const e of state.stores.values()) {
        const target: any = e.ref.deref();
        if (target !== undefined) live.push([e, target]);
    }
    return live.map(([e, target]) => {
        const base = { id: e.id, name: e.name, type: e.type, holders: holders.get(e.id) ?? [] };
        if (e.type === 'reactive') return { ...base, value: target };
        return target._dirty === true ? { ...base, value: target._value, stale: true } : { ...base, value: target._value };
    });
}

const RAW = Symbol.for('motif.raw');
type StoreLocation = { id: number; type: StoreEntry['type']; path: string[] };
const located = new WeakMap<object, StoreLocation>();

function rootOf(e: StoreEntry): object | undefined {
    const t: any = e.ref.deref();
    if (t === undefined) return undefined;
    return e.type === 'reactive' ? rawOf(t) : t._target;
}

function rawOf(v: any): any {
    let c = v;
    try { while (c && c[RAW]) c = c[RAW]; } catch { }
    return c;
}

function childrenOf(v: any): [string, any][] {
    if (v instanceof Map) return [...v].map(([k, x]) => [String(k), rawOf(x)]);
    if (v instanceof Set) return [...v].map((x, i) => [String(i), rawOf(x)]);
    const out: [string, any][] = [];
    for (const k of Object.keys(v)) {
        const d = Object.getOwnPropertyDescriptor(v, k);
        if (d && 'value' in d) out.push([k, rawOf(d.value)]);
    }
    return out;
}

function childAt(v: any, key: string): any {
    if (v instanceof Map) {
        for (const [k, x] of v) if (String(k) === key) return rawOf(x);
        return undefined;
    }
    if (v instanceof Set) {
        let i = 0;
        for (const x of v) if (String(i++) === key) return rawOf(x);
        return undefined;
    }
    const d = Object.getOwnPropertyDescriptor(v, key);
    return d && 'value' in d ? rawOf(d.value) : undefined;
}

function reach(loc: StoreLocation): object | undefined {
    const e = state.stores.get(loc.id);
    let v: any = e && rootOf(e);
    for (const k of loc.path) {
        if (v === null || typeof v !== 'object') return undefined;
        v = childAt(v, k);
    }
    return v;
}

export function storeOf(raw: object): StoreLocation | null {
    const hit = located.get(raw);
    if (hit !== undefined && reach(hit) === raw) return hit;
    const found = searchStores(raw);
    if (found === null) located.delete(raw);
    return found;
}

function searchStores(raw: object): StoreLocation | null {
    const queue: [any, StoreEntry, string[]][] = [];
    for (const e of state.stores.values()) {
        const root = rootOf(e);
        if (root === undefined) continue;
        const loc: StoreLocation = { id: e.id, type: e.type, path: [] };
        located.set(root, loc);
        if (root === raw) return loc;
        if (e.type === 'reactive') queue.push([root, e, []]);
    }
    const seen = new Set<object>();
    for (let i = 0; i < queue.length && i < 20000; i++) {
        const [v, e, path] = queue[i];
        if (path.length >= 8 || seen.has(v)) continue;
        seen.add(v);
        let found: StoreLocation | null = null;
        for (const [k, x] of childrenOf(v)) {
            if (x === null || typeof x !== 'object' || seen.has(x)) continue;
            const loc: StoreLocation = { id: e.id, type: e.type, path: [...path, k] };
            located.set(x, loc);
            if (x === raw && found === null) found = loc;
            queue.push([x, e, loc.path]);
        }
        if (found !== null) return found;
    }
    return null;
}

export function readStore(id: number, keys: string[]): WriteResult {
    const entry = state.stores.get(id);
    const target: any = entry?.ref.deref();
    if (!entry || target === undefined) return { ok: false, error: 'no store' };
    return readFrom(entry.type === 'reactive' ? target : target._value, keys);
}

export function setStoreValue(id: number, keys: string[], value: unknown): WriteResult {
    const entry = state.stores.get(id);
    const store: any = entry?.ref.deref();
    if (!entry || store === undefined || entry.type === 'computed') return { ok: false, error: 'not a writable store' };
    if (!Array.isArray(keys) || keys.some(k => BLOCKED_KEYS.has(String(k)))) return { ok: false, error: 'invalid key' };
    if (entry.type === 'reactive' && keys.length === 0) return { ok: false, error: 'invalid key' };
    try {
        if (entry.type === 'signal' && keys.length === 0) { store.value = value; return { ok: true }; }
        let target = entry.type === 'signal' ? store.peek() : store;
        for (const k of keys.slice(0, -1)) {
            target = target[k];
            if (target === null || typeof target !== 'object') return { ok: false, error: 'path not found' };
        }
        target[keys[keys.length - 1]] = value;
        if (entry.type === 'signal') store.notify();
        return { ok: true };
    } catch (error) { return { ok: false, error: String((error as any)?.message ?? error) }; }
}
