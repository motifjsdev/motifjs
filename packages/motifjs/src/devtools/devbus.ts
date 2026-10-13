import { getTree, getElement, pathOfElement, inspect, getServices } from './inspect';
import { getCounters, resetCounters } from './counters';

export type DevEvent = { type: string; payload?: any };
export type DevWarning = { code: string; message: string; details?: any; count: number; firstAt: number; lastAt: number };
export type DevStore = { name: string; value: any; type: string };

const state = {
    enabled: false as boolean,
    listeners: new Set<(ev: DevEvent) => void>(),
    warnings: new Map<string, DevWarning>(),
    routes: null as any,
    stores: [] as DevStore[],
    exposed: null as object | null,
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
            state.exposed = { version: 1, on, getWarnings, getRoutes, getStores, getTree, getElement, pathOfElement, inspect, getServices, getCounters, isEnabled };
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

export function on(listener: (ev: DevEvent) => void): () => void {
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
}

function emit(type: string, payload?: any) {
    const ev: DevEvent = { type, payload };
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

export function registerStore(name: string, value: any, type: string): void {
    if (!state.enabled) return;
    state.stores.push({ name, value, type });
    if (state.stores.length > 200) state.stores.shift();
}
export function getStores(): DevStore[] { return state.stores.slice(); }
export function storeCount(): number { return state.stores.length; }
