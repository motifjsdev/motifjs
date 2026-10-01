export type DevEvent = { type: string; payload?: any };
export type DevWarning = { code: string; message: string; details?: any };

const state = {
    enabled: false as boolean,
    listeners: new Set<(ev: DevEvent) => void>(),
    warnings: [] as DevWarning[],
    routes: null as any,
};

/** Dev modu: devtools açık ya da `globalThis.__MOTIF_DEV__ === true`. */
export function isDevLike(): boolean {
    return state.enabled || (globalThis as any).__MOTIF_DEV__ === true;
}

function detectEnabled(): boolean {
    try {
        if (typeof window === 'undefined') return false;
        const w = window as any;
        if (w.__motif_DEVTOOLS === true) return true;
        if ((globalThis as any).__MOTIF_DEVTOOLS__ === true) return true;
        if ((globalThis as any).__MOTIF_DEVTOOLS_FLAG === true) return true;
        const qs = (w.location && w.location.search) || '';
        if (qs && /(?:[?&])devtools=1(?:&|$)/i.test(qs)) return true;
        return false;
    } catch { return false; }
}

export function ensureDevtoolsFlagInitialized() {
    if (state.enabled) return;
    state.enabled = detectEnabled();
    if (state.enabled) {
        try { (window as any).__motifDevBus = { on, emit, warn, getWarnings, isEnabled, setRoutes, getRoutes }; } catch { }
    }
}

export function isEnabled(): boolean { return state.enabled; }

export function on(listener: (ev: DevEvent) => void): () => void {
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
}

export function emit(type: string, payload?: any) {
    const ev: DevEvent = { type, payload };
    for (const l of state.listeners) {
        try { l(ev); } catch { }
    }
    try {
        const bus = (globalThis as any).__MOTIF_DEVTOOLS_BUS__;
        if (bus && typeof bus.publish === 'function') {
            bus.publish('devtools:' + type, payload);
        }
    } catch { }
}

export function warn(code: string, message: string, details?: any) {
    if (!isDevLike()) return;
    const w: DevWarning = { code, message, details };
    state.warnings.push(w);
    try { if (typeof console !== 'undefined') details === undefined ? console.warn(`[motifjs] ${code}: ${message}`) : console.warn(`[motifjs] ${code}: ${message}`, details); } catch { }
    emit('warning', w);
}

export function getWarnings(): DevWarning[] { return state.warnings.slice(); }

export function setRoutes(routes: any) { state.routes = routes; }
export function getRoutes(): any { return state.routes; }