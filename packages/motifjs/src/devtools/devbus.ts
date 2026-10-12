export type DevEvent = { type: string; payload?: any };
export type DevWarning = { code: string; message: string; details?: any };

const state = {
    enabled: false as boolean,
    listeners: new Set<(ev: DevEvent) => void>(),
    warnings: [] as DevWarning[],
    routes: null as any,
    exposed: null as object | null,
};

/** Dev modu: devtools açık ya da `globalThis.__MOTIF_DEV__ === true`. */
export function isDevLike(): boolean {
    return state.enabled || (globalThis as any).__MOTIF_DEV__ === true;
}

export function setDevtoolsEnabled(enabled: boolean) {
    state.enabled = enabled;
    try {
        const g = globalThis as any;
        if (enabled) {
            state.exposed = { version: 1, on, getWarnings, getRoutes, isEnabled };
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
    const w: DevWarning = { code, message, details };
    state.warnings.push(w);
    try { if (typeof console !== 'undefined') details === undefined ? console.warn(`[motifjs] ${code}: ${message}`) : console.warn(`[motifjs] ${code}: ${message}`, details); } catch { }
    devtools()?.('warning', w);
}

export function getWarnings(): DevWarning[] { return state.warnings.slice(); }

export function setRoutes(routes: any) { state.routes = routes; }
export function getRoutes(): any { return state.routes; }
