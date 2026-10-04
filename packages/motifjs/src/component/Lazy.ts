import { ComponentBase, IBaseProp } from ".";
import { Component } from "./Component";
import { Frame } from "./Frame";
import { resolveComponent } from "./resolveComponent";
import { disposableCore } from "../disposable";
import { motifError, reportError } from "../common/diagnostics";

export interface LazyOptions<T = any> { 
    Loaderview?: ComponentBase; 
    Placeholderview?: ComponentBase; 
    Fallbackview?: ComponentBase;
    minDelayMs?: number;
    onError?: (error: unknown) => void;
    mapResult?: (result: T) => any; 
    timeoutMs?: number;
    signal?: AbortSignal;
    retry?: number | LazyRetryOptions;
    onRetry?: (attempt: number, error: unknown) => void;
}

export interface LazyRetryOptions {
    count: number;
    delayMs?: number;
    whenOnline?: boolean;
}

function normalizeRetry(retry: LazyOptions['retry']): Required<LazyRetryOptions> {
    if (typeof retry === 'number') return { count: Math.max(0, Math.floor(retry)), delayMs: 500, whenOnline: true };
    if (retry && typeof retry === 'object') {
        return {
            count: Math.max(0, Math.floor(retry.count || 0)),
            delayMs: Math.max(0, retry.delayMs ?? 500),
            whenOnline: retry.whenOnline !== false,
        };
    }
    return { count: 0, delayMs: 0, whenOnline: false };
}

function defaultMapper(result: any) {
    if (result && typeof result === "object" && typeof (result as any).default === "function") {
        return (result as any).default;
    }
    return result;
}



export function Lazy<T>(props: { caller: () => Promise<T>, options?: LazyOptions<T> }): Component;
export function Lazy(props: any): Component;
export function Lazy(props: any): Component {
    const opts: LazyOptions<any> = (props && props.options) || {};
    const frame = new Frame();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const trackTimer = (id: ReturnType<typeof setTimeout>) => { try { timers.add(id); } catch { } return id; };
    const clearAllTimers = () => {
        try { timers.forEach(id => { try { clearTimeout(id); } catch { } }); } catch { }
        try { timers.clear(); } catch { }
    };
    try { frame.motif.register(disposableCore.toDisposable(() => clearAllTimers())); } catch { }
    const initial = opts.Placeholderview ?? opts.Loaderview;
    if (initial != null) {
        frame.navigate(resolveComponent(initial));
    }

    const attemptLoad = () => {
        if (!opts.timeoutMs && !opts.signal) {
            return props.caller();
        }
        const parts: Promise<any>[] = [props.caller()];
        if (opts.timeoutMs && opts.timeoutMs > 0) {
            parts.push(new Promise<any>((_, reject) => {
                const id = trackTimer(setTimeout(() => reject(motifError('MJX110', opts.timeoutMs!)), opts.timeoutMs));
                parts[0].finally(() => { try { clearTimeout(id); timers.delete(id); } catch { } }).catch(() => { /* noop */ });
                if (opts.signal) {
                    const onAbortClear = () => { try { clearTimeout(id); timers.delete(id); } catch { } };
                    try { opts.signal.addEventListener("abort", onAbortClear, { once: true }); } catch { }
                }
            }));
        }
        if (opts.signal) {
            parts.push(new Promise<any>((_, reject) => {
                if (opts.signal!.aborted) {
                    reject(motifError('MJX111'));
                    return;
                }
                const onAbort = () => {
                    opts.signal!.removeEventListener("abort", onAbort);
                    clearAllTimers();
                    reject(motifError('MJX111'));
                };
                opts.signal!.addEventListener("abort", onAbort, { once: true });
            }));
        }
        return Promise.race(parts);
    };

    const retry = normalizeRetry(opts.retry);
    const cleanups = new Set<() => void>();
    try { frame.motif.register(disposableCore.toDisposable(() => { cleanups.forEach(c => { try { c(); } catch { } }); cleanups.clear(); })); } catch { }

    const waitBeforeRetry = (attempt: number): Promise<boolean> => new Promise<boolean>(resolve => {
        let settled = false;
        const finish = (go: boolean) => {
            if (settled) return;
            settled = true;
            cleanups.delete(cancel);
            try { if (onlineHandler) window.removeEventListener('online', onlineHandler); } catch { }
            try { if (id !== undefined) { clearTimeout(id); timers.delete(id); } } catch { }
            try { opts.signal?.removeEventListener('abort', onAbort); } catch { }
            resolve(go);
        };
        const cancel = () => finish(false);
        const onAbort = () => finish(false);
        let onlineHandler: (() => void) | null = null;
        let id: ReturnType<typeof setTimeout> | undefined = undefined;
        cleanups.add(cancel);
        try { opts.signal?.addEventListener('abort', onAbort, { once: true }); } catch { }
        const schedule = () => { id = trackTimer(setTimeout(() => finish(true), retry.delayMs * attempt)); };
        const offline = retry.whenOnline && typeof navigator !== 'undefined' && navigator.onLine === false && typeof window !== 'undefined';
        if (offline) {
            onlineHandler = () => {
                try { window.removeEventListener('online', onlineHandler!); } catch { }
                onlineHandler = null;
                schedule();
            };
            window.addEventListener('online', onlineHandler);
        } else {
            schedule();
        }
    });

    const loadWithRetry = async (): Promise<any> => {
        let attempt = 0;
        for (; ;) {
            try {
                return await attemptLoad();
            } catch (err) {
                if (opts.signal?.aborted || (frame as any).isDisposed || attempt >= retry.count) throw err;
                attempt++;
                try { opts.onRetry?.(attempt, err); } catch { }
                const go = await waitBeforeRetry(attempt);
                if (!go || opts.signal?.aborted || (frame as any).isDisposed) throw err;
            }
        }
    };

    const loadPromise = retry.count > 0 ? loadWithRetry() : attemptLoad();

    const startTs = Date.now();

    loadPromise
        .then((result: any) => {
            if (opts.signal?.aborted) { return; }
            const mapper = opts.mapResult ?? defaultMapper;
            const target = mapper(result);
            const elapsed = Date.now() - startTs;
            const minDelay = Math.max(0, (opts.minDelayMs ?? 0));
            const remaining = Math.max(0, minDelay - elapsed);
            if (remaining > 0) {
                const id = trackTimer(setTimeout(() => {
                    if (!opts.signal?.aborted) {
                        frame.navigate(resolveComponent(target));
                    }
                }, remaining));
                if (opts.signal) {
                    const onAbortClearDelay = () => { try { clearTimeout(id); timers.delete(id); } catch { } };
                    try { opts.signal.addEventListener("abort", onAbortClearDelay, { once: true }); } catch { }
                }
            } else {
                frame.navigate(resolveComponent(target));
            }
        })
        .catch((err: any) => {
            try { opts.onError?.(err); } catch { /* swallow */ }
            if (opts.signal?.aborted) return;
            if (opts.Fallbackview != null) {
                frame.navigate(resolveComponent(opts.Fallbackview));
            } else {
                reportError('MJX126', err);
                try { frame.motif.clear().catch(() => { }); } catch { }
            }
        });

    return frame;
}
