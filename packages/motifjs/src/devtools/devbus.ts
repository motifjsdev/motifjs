import { getTree, getElement, pathOfElement, inspect, getServices, componentAt, holdersOf, type StoreHolder } from './inspect';
import { getCounters, resetCounters } from './counters';
import { getExtensions, readExtension, inspectExtensions, bindExtensionEmitter } from './extensions';
import { setClass, setAttribute, setVisible, writeModel, setProp, navigate, BLOCKED_KEYS, type WriteResult } from './writes';
import { readValue } from './read';
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

export function setDevtoolsEnabled(enabled: boolean) {
    if (enabled && !state.enabled) resetCounters();
    state.enabled = enabled;
    try {
        const g = globalThis as any;
        if (enabled) {
            state.exposed = { version: 1, on, getWarnings, getRoutes, getStores, getTree, getElement, pathOfElement, inspect: inspectWithExtensions, getServices, getCounters, getRoute, getNavigations, getErrors, getExtensions, readExtension, readValue, setClass, setAttribute, setVisible, writeModel, setProp, navigate, setStoreValue, isEnabled };
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
    if (!state.enabled) return;
    const id = ++state.storeSeq;
    state.stores.set(id, { id, name: classNameOf(model) ?? fallback, type, ref: new WeakRef(value) });
    if (state.stores.size >= state.storePrune) pruneStores();
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
    const live: [StoreEntry, any][] = [];
    for (const e of state.stores.values()) {
        const target: any = e.ref.deref();
        if (target !== undefined) live.push([e, target]);
    }
    const holders = holdersOf(new Map(live.map(([e, target]) => [target, e.id])));
    return live.map(([e, target]) => {
        const base = { id: e.id, name: e.name, type: e.type, holders: holders.get(e.id) ?? [] };
        if (e.type === 'reactive') return { ...base, value: target };
        return target._dirty === true ? { ...base, value: target._value, stale: true } : { ...base, value: target._value };
    });
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
