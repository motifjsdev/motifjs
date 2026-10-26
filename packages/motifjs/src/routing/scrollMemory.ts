
import type { NavigationDirection, ScrollMemoryOptions } from './common';

export interface ScrollViewport {
    scrollTop(): number;
    scrollTo(top: number, left?: number, behavior?: ScrollBehavior): void;
    scrollToAnchor(id: string, follow?: boolean): boolean;
}

const DEFAULT_LIMIT = 60;
const DEFAULT_SETTLE_MS = 1200;

const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

export class ScrollMemory {
    private readonly options: ScrollMemoryOptions;
    private readonly viewport: ScrollViewport;
    private readonly positions = new Map<string, number>();

    private currentKey = '';
    private currentPath: string | null = null;

    private visited = false;
    private restoring = false;
    private cancelFrame: (() => void) | null = null;
    private disarmAbort: (() => void) | null = null;
    private readonly offs: Array<() => void> = [];

    public locationAnchor = true;

    private readonly onSave: ((positions: Record<string, number>) => void) | null;

    constructor(options: ScrollMemoryOptions = {}, viewport?: ScrollViewport, onSave?: (positions: Record<string, number>) => void) {
        this.options = options;
        this.viewport = viewport ?? (options.container ? containerViewport(options.container) : windowViewport());
        this.onSave = onSave ?? null;

        try {
            if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
                history.scrollRestoration = 'manual';
            }
        } catch { /* salt okunur bırakan gömülü tarayıcılar  */ }

        if (typeof window !== 'undefined') {
            this.offs.push(listen(window, 'pagehide', () => this.save()));
            this.offs.push(listen(document, 'visibilitychange', () => {
                if (document.visibilityState === 'hidden') this.save();
            }));
        }
    }

    public leaving(): void {
        this.cancelRestore();
        if (!this.visited) return;
        this.remember(this.currentKey, this.viewport.scrollTop());
        this.onSave?.(this.snapshot());
    }

    public save(): void {
        this.rememberCurrent();
        this.onSave?.(this.snapshot());
    }

    public snapshot(): Record<string, number> {
        this.rememberCurrent();
        const out: Record<string, number> = {};
        for (const [key, top] of this.positions) if (top > 0) out[key] = top;
        return out;
    }

    public adopt(positions: Record<string, number> | null | undefined): void {
        if (!positions || typeof positions !== 'object') return;
        for (const key of Object.keys(positions)) {
            const top = Number(positions[key]);
            if (Number.isFinite(top) && top > 0) this.remember(key, top);
        }
    }

    public arrived(uri: string, direction?: NavigationDirection, restore: boolean = true): void {
        this.visited = true;
        const { path, hash } = splitUri(uri);
        const inPage = !!hash && path === this.currentPath && (direction === 'push' || direction === 'replace' || direction === 'traverse');
        this.currentPath = path;
        this.currentKey = this.keyOf(path);
        if (!restore) { this.cancelRestore(); return; }
        this.restore(this.currentKey, this.options.anchor === false ? '' : hash || (this.locationAnchor ? locationHash() : ''), inPage);
    }

    public scrollTo(top: number, left?: number, behavior: ScrollBehavior = 'auto'): void {
        this.cancelRestore();
        this.viewport.scrollTo(top, left, behavior);
    }

    public saved(key: string): number {
        return this.positions.get(this.keyOf(splitUri(key).path)) ?? 0;
    }

    public dispose(save: boolean = false): void {
        this.cancelRestore();
        if (save) this.save();
        for (const off of this.offs.splice(0)) off();
        this.positions.clear();
    }


    private keyOf(path: string): string {
        const key = this.options.key ? this.options.key(path) : path;
        return key || '/';
    }

    private remember(key: string, top: number): void {
        const limit = this.options.limit ?? DEFAULT_LIMIT;
        this.positions.delete(key);
        this.positions.set(key, Math.max(0, Math.round(top)));
        while (this.positions.size > limit) {
            const oldest = this.positions.keys().next();
            if (oldest.done) break;
            this.positions.delete(oldest.value);
        }
    }

    private restore(key: string, anchor: string, follow: boolean): void {
        this.cancelRestore();

        const target = this.positions.get(key) ?? 0;

        if (!anchor && target <= 0) {
            if (this.options.top !== false) this.viewport.scrollTo(0);
            return;
        }

        this.restoring = true;
        const settleMs = this.options.settleMs ?? DEFAULT_SETTLE_MS;
        const startedAt = Date.now();

        const attempt = (): void => {
            this.cancelFrame = null;
            const done = anchor ? this.viewport.scrollToAnchor(anchor, follow) : this.reached(target);
            if (done || Date.now() - startedAt >= settleMs) {
                this.cancelRestore();
                this.remember(key, this.viewport.scrollTop());
                return;
            }
            this.armAbort();
            this.cancelFrame = frame(attempt);
        };
        attempt();
    }

    private reached(target: number): boolean {
        this.viewport.scrollTo(target);
        return this.viewport.scrollTop() >= target - 1;
    }

    private armAbort(): void {
        if (this.disarmAbort || typeof window === 'undefined') return;
        const abort = () => this.cancelRestore();
        const removers = USER_INPUT.map((type) => listen(window, type, abort, { passive: true }));
        this.disarmAbort = () => { for (const remove of removers) remove(); };
    }

    private cancelRestore(): void {
        this.cancelFrame?.();
        this.cancelFrame = null;
        this.disarmAbort?.();
        this.disarmAbort = null;
        this.restoring = false;
    }
    private rememberCurrent(): void {
        if (this.visited && !this.restoring) {
            this.remember(this.currentKey, this.viewport.scrollTop());
        }
    }
}

/** Gerçek pencere (`documentElement`). */
function windowViewport(): ScrollViewport {
    return {
        scrollTop: () => {
            try { return window.scrollY || document.documentElement?.scrollTop || 0; } catch { return 0; }
        },
        scrollTo: (top, left, behavior = 'instant') => {
            try { window.scrollTo(left === undefined ? { top, behavior } : { top, left, behavior }); }
            catch { try { window.scrollTo(left ?? 0, top); } catch { } }
        },
        scrollToAnchor: (id, follow) => {
            try {
                const node = document.getElementById(id);
                if (!node) return false;
                if (follow) node.scrollIntoView();
                else {
                    try { node.scrollIntoView({ behavior: 'instant' }); }
                    catch { node.scrollIntoView(); }
                }
                return true;
            } catch { return false; }
        },
    };
}

function containerViewport(container: NonNullable<ScrollMemoryOptions['container']>): ScrollViewport {
    const fallback = windowViewport();
    const resolve = (): HTMLElement | null => {
        try {
            if (typeof container === 'string') return document.querySelector(container) as HTMLElement | null;
            if (typeof container === 'function') return container() ?? null;
            return container;
        } catch { return null; }
    };
    return {
        scrollTop: () => {
            const el = resolve();
            if (!el) return fallback.scrollTop();
            return el.scrollTop || 0;
        },
        scrollTo: (top, left, behavior = 'instant') => {
            const el = resolve();
            if (!el) { fallback.scrollTo(top, left, behavior); return; }
            try { el.scrollTo(left === undefined ? { top, behavior } : { top, left, behavior }); }
            catch { try { el.scrollTop = top; if (left !== undefined) el.scrollLeft = left; } catch { } }
        },
        scrollToAnchor: (id, follow) => fallback.scrollToAnchor(id, follow),
    };
}

/** `/docs/x#bolum` → `{ path: '/docs/x', hash: 'bolum' }`. */
function splitUri(uri: string): { path: string; hash: string } {
    const index = uri.indexOf('#');
    if (index < 0) return { path: uri, hash: '' };
    return { path: uri.slice(0, index) || '/', hash: decodeHash(uri.slice(index + 1)) };
}

function locationHash(): string {
    try {
        const hash = location?.hash ?? '';
        return hash.length > 1 ? decodeHash(hash.slice(1)) : '';
    } catch { return ''; }
}

function decodeHash(value: string): string {
    try { return decodeURIComponent(value); } catch { return value; }
}

function frame(run: () => void): () => void {
    if (typeof requestAnimationFrame !== 'function') {
        const id = setTimeout(run, 16);
        return () => clearTimeout(id);
    }
    const id = requestAnimationFrame(run);
    return () => cancelAnimationFrame(id);
}

function listen(
    target: EventTarget,
    type: string,
    handler: () => void,
    options?: AddEventListenerOptions,
): () => void {
    try {
        target.addEventListener(type, handler, options);
        return () => { try { target.removeEventListener(type, handler, options); } catch { } };
    } catch {
        return () => { };
    }
}