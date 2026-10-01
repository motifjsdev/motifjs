import { ComponentBase } from "./componentBase";
import { resolveComponent } from "./resolveComponent";
import { Lazy } from "./Lazy";
import { reportError } from "../common/diagnostics";

export interface NavigationHost extends ComponentBase {
    current: ComponentBase | ComponentBase[] | null;
    previouspage: any;
    isBusy: boolean;
    _latestNavigateId: number;
    _navLock: Promise<void>;
    _navAbort?: AbortController;
    _navPending?: number;
}

export function cancelAnimationsDeep(target: any): void {
    if (!target || target.isDisposed) return;
    if (Array.isArray(target)) {
        target.forEach(cancelAnimationsDeep);
        return;
    }
    try { target.motif.options?.transition?.activeCssCancel?.(); } catch { }
    try {
        const anims = target.motif.options?.transition?.activeAnimations;
        if (Array.isArray(anims)) {
            anims.forEach((anim: any) => {
                try {
                    if (anim && typeof anim.cancel === 'function') {
                        anim.cancel();
                    }
                } catch { }
            });
            anims.length = 0;
        }
    } catch { }
    try {
        if (target.controls && target.controls.items) {
            for (const child of target.controls.items) {
                cancelAnimationsDeep(child);
            }
        }
    } catch { }
}

export async function disposeNavigationTarget(target: ComponentBase | ComponentBase[] | null): Promise<void> {
    if (!target) return;

    if (Array.isArray(target)) {
        for (const xr of target) {
            try {
                if (xr && !xr.isDisposed) {
                    await xr.dispose({ deep: true, skipLeaveTransition: true });
                }
            } catch (err) {
                reportError('MJX115', err);
            }
        }
    } else {
        if (!target.isDisposed) {
            await target.dispose({ deep: true, skipLeaveTransition: true });
        }
    }
}

export async function navigateHost(host: NavigationHost, page: ComponentBase | ComponentBase[], keepOldControl: boolean = false): Promise<void> {
    if (host.isDisposed || page == null) return;
    if (host.current !== null && host.current === (page as any)) return;

    const navigateId = ++host._latestNavigateId;
    host.isBusy = true;

    const complete = (value: any) => {
        if (host.isDisposed) return;
        if (navigateId !== host._latestNavigateId) return;
        const xP = resolveComponent(value);
        host.current = xP;
        try {
            if (Array.isArray(xP)) {
                host.controls.add(...xP);
            } else {
                host.controls.add(xP);
            }
        } catch (error) {
            reportError('MJX114', error);
        }
        host.isBusy = false;
        host.previouspage = xP;
    };

    if (!(host._navPending ?? 0) && host.current === null && !(page instanceof Promise)) {
        try {
            complete(page);
        } catch (error) {
            reportError('MJX114', error);
            host.isBusy = false;
        }
        return;
    }

    host._navPending = (host._navPending ?? 0) + 1;
    const prevLock = host._navLock ?? Promise.resolve();
    host._navLock = (async () => {
        try {
            await prevLock;

            try { host._navAbort?.abort(); } catch { }
            host._navAbort = new AbortController();

            const oldPage = host.current;
            if (oldPage && !keepOldControl) {
                cancelAnimationsDeep(oldPage);
                cancelAnimationsDeep(host);
                try { await disposeNavigationTarget(oldPage); } catch { }
            }

            try {
                if (page instanceof Promise) {
                    const caller = () => page;
                    const lazyFrame = Lazy({ caller, options: { signal: host._navAbort?.signal } as any });
                    complete(lazyFrame);
                } else {
                    complete(page);
                }
            } catch (error) {
                reportError('MJX114', error);
                host.isBusy = false;
            }
        } finally {
            host._navPending = Math.max(0, (host._navPending ?? 1) - 1);
        }
    })();
    await host._navLock;
}