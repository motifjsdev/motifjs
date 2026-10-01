import { Component } from "./";
import { IBaseProp } from "./";
import { LazyOptions } from "./Lazy";
import { motifError } from "../common/diagnostics";


export function promises<T>(lazy: Promise<T>): Promise<T> {
    return lazy
}

export interface SuspenseGroupProps {
    children?: any[],
    options?: LazyOptions<any>,
}

export type ListenerProps = SuspenseGroupProps;

export class SuspenseGroupComponent extends Component<any, SuspenseGroupProps> {
    private _abort?: AbortController;
    constructor();
    constructor(props: any);
    constructor(props: IBaseProp<SuspenseGroupProps>);
    constructor() {
        const args = arguments as unknown as any[];
        super(args.length > 0 ? (args[0] as any) : undefined);
    }

    extractFunction(source: any): any {
        if (typeof source == 'function') {
            try {
                var result = (source as Function)();
                if (typeof result == 'function') {
                    return this.extractFunction(result);
                } else {
                    return result;
                }
            } catch {
                return source;
            }
        }
        return source;
    }

    getDefault(source: any): any {
        if (typeof source['default'] === "function") {
            return source.default;
        }
        return source
    }

    public async dispose() {
        try {
            this._abort?.abort();
        } finally {
            await super.dispose();
        }
    }

    async initializeComponent(sender: Component<any, SuspenseGroupProps>) {
        const baseOpts: LazyOptions<any> = { ...(this.props.options || {}) };

        const groupAbort = new AbortController();
        this._abort = groupAbort;
        if (baseOpts.signal) {
            const ext = baseOpts.signal;
            if (ext.aborted) {
                try { groupAbort.abort(); } catch { }
            } else {
                const onAbort = () => {
                    ext.removeEventListener('abort', onAbort);
                    try { groupAbort.abort(); } catch { }
                };
                ext.addEventListener('abort', onAbort, { once: true });
            }
        }
        const opts: LazyOptions<any> = { ...baseOpts, signal: groupAbort.signal };

        const all: any[] = [];
        if (Array.isArray(this.childs)) all.push(...this.childs);
        if (Array.isArray(this.props.children)) all.push(...this.props.children);
        if (all.length === 0) { return; }

        const started = Date.now();
        const minDelay = Math.max(0, opts.minDelayMs || 0);
        const ensureMinDelay = async () => {
            const elapsed = Date.now() - started;
            const remain = minDelay - elapsed;
            if (remain > 0) { await new Promise(r => setTimeout(r, remain)); }
        };

        let loaderAdded = false;
        if (opts.Loaderview) {
            try { this.controls.add(opts.Loaderview as any); loaderAdded = true; } catch { }
        }

        const childPromises = all.map(async (raw) => {
            if (this.isDisposed) return null;
            const val = (typeof raw === 'function') ? this.extractFunction(raw) : raw;
            const materialized = val instanceof Promise ? await val : val;
            const mapped = (typeof opts.mapResult === 'function') ? opts.mapResult(materialized) : this.getDefault(materialized);
            return mapped;
        });

        const guards: Promise<never>[] = [];
        if (opts.signal) {
            guards.push(new Promise<never>((_, rej) => {
                const onAbort = () => rej(new DOMException('Aborted', 'AbortError'));
                opts.signal!.addEventListener('abort', onAbort, { once: true });
            }));
        }
        if (opts.timeoutMs && opts.timeoutMs > 0) {
            guards.push(new Promise<never>((_, rej) => setTimeout(() => rej(motifError('MJX116', opts.timeoutMs!)), opts.timeoutMs)));
        }

        try {
            const allResolved = Promise.all(childPromises);
            const results = await Promise.race([allResolved, ...guards]);

            await ensureMinDelay();
            if (this.isDisposed) { return; }

            if (loaderAdded) {
                try {
                    if (opts.Loaderview) {
                        opts.Loaderview.dispose();
                    }
                    this.controls.clear();
                } catch {

                }
            }
            this.controls.add(...(results as any[]).filter(x => x != null));
        } catch (e) {
            try { opts.onError?.(e as any); } catch { }
            await ensureMinDelay();
            if (this.isDisposed) { return; }
            try { this.controls.clear(); } catch { }
            if (opts.Fallbackview) {
                try { this.controls.add(opts.Fallbackview as any); } catch { }
            }
        }
    }
}

export class Listener extends SuspenseGroupComponent { }

export function SuspenseGroup(props: IBaseProp<SuspenseGroupProps>): SuspenseGroupComponent {
    return new SuspenseGroupComponent(props);
}