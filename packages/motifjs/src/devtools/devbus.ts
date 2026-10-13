import { getTree, getElement, pathOfElement, inspect, getServices, componentAt } from './inspect';
import { getCounters, resetCounters } from './counters';
import { getExtensions, readExtension, inspectExtensions, bindExtensionEmitter } from './extensions';
import { setClass, setAttribute, setVisible, writeModel, setProp, navigate, BLOCKED_KEYS, type WriteResult } from './writes';
import { readValue } from './read';
import type { MotifDevtools, DevtoolsEvent } from './types';

export type DevWarning = { code: string; message: string; details?: any; count: number; firstAt: number; lastAt: number };
export type DevStore = { name: string; value: any; type: string };
export type DevNavigation = { requested: string; uri: string | null; outcome: string; reason?: string; params?: any; duration: number; at: number };
export type DevError = { context: string; name: string; message: string; error: any; count: number; firstAt: number; lastAt: number };

const state = {
    enabled: false as boolean,
    listeners: new Set<(ev: DevtoolsEvent) => void>(),
    warnings: new Map<string, DevWarning>(),
    routes: null as any,
    stores: [] as DevStore[],
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

export function registerStore(name: string, value: any, type: string): void {
    if (!state.enabled) return;
    state.stores.push({ name, value, type });
    if (state.stores.length > 200) state.stores.shift();
}
export function getStores(): DevStore[] { return state.stores.slice(); }

export function setStoreValue(index: number, keys: string[], value: unknown): WriteResult {
    const entry = state.stores[index];
    if (!entry || entry.type !== 'reactive') return { ok: false, error: 'not a writable store' };
    if (!Array.isArray(keys) || keys.length === 0 || keys.some(k => BLOCKED_KEYS.has(String(k)))) return { ok: false, error: 'invalid key' };
    try {
        let target = entry.value;
        for (const k of keys.slice(0, -1)) {
            target = target[k];
            if (target === null || typeof target !== 'object') return { ok: false, error: 'path not found' };
        }
        target[keys[keys.length - 1]] = value;
        return { ok: true };
    } catch (error) { return { ok: false, error: String((error as any)?.message ?? error) }; }
}
export function storeCount(): number { return state.stores.length; }
