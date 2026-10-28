import type { ComponentBase } from "./componentBase";
import { reportError } from "../common/diagnostics";

type HostState = { turn: number; used: number };

const states = new WeakMap<ComponentBase, HostState>();
const queue: ComponentBase[] = [];
let turn = 0;
let turnEndQueued = false;
let pumpQueued = false;
let releasing: ComponentBase | null = null;

export function chunkOf(host: ComponentBase | null | undefined): number {
    const n = (host as any)?.motif?.options?.chunk;
    return typeof n === 'number' && n > 0 ? Math.floor(n) : 0;
}

function stateOf(host: ComponentBase): HostState {
    let state = states.get(host);
    if (state === undefined) states.set(host, state = { turn: -1, used: 0 });
    if (state.turn !== turn) {
        state.turn = turn;
        state.used = 0;
    }
    if (!turnEndQueued) {
        turnEndQueued = true;
        queueMicrotask(() => { turnEndQueued = false; turn++; });
    }
    return state;
}

function hasWaitBinding(c: ComponentBase): boolean {
    const items = (c as any)._bindings?._items;
    return Array.isArray(items) && items.some((b: any) => b?.propertyName === 'isWait');
}

export function sliceRemaining(host: ComponentBase): number {
    const chunk = chunkOf(host);
    if (chunk === 0) return Infinity;
    return Math.max(0, chunk - stateOf(host).used);
}

export function sliceWanted(host: ComponentBase, c: ComponentBase): boolean {
    const chunk = chunkOf(host);
    if (chunk === 0 || c === releasing) return false;
    if ((c.element as Node | null)?.nodeType === Node.COMMENT_NODE) return false;
    if (hasWaitBinding(c)) return false;
    const state = stateOf(host);
    if (state.used < chunk) {
        state.used++;
        return false;
    }
    return true;
}

export function sliceDefer(c: ComponentBase, host: ComponentBase): void {
    (c as any)._slice = true;
    (c as any)._sliceHost = host;
    if (!c.isWait) c.isWait = true;
    queue.push(c);
    schedulePump();
}

export function slicesPending(): number {
    return queue.length;
}

function nextFrame(run: () => void): void {
    const raf = (globalThis as any).requestAnimationFrame;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (typeof raf === 'function' && !hidden) raf(() => setTimeout(run, 0));
    else setTimeout(run, 16);
}

function schedulePump(): void {
    if (pumpQueued) return;
    pumpQueued = true;
    nextFrame(pump);
}

function pump(): void {
    pumpQueued = false;
    const pending = queue.splice(0);
    const used = new Map<ComponentBase, number>();
    const rest: ComponentBase[] = [];
    for (const c of pending) {
        if (c.isDisposed || !(c as any)._slice) continue;
        if (!c.isWait) {
            (c as any)._slice = false;
            continue;
        }
        const host = (c as any)._sliceHost as ComponentBase | undefined;
        const chunk = host && !host.isDisposed ? chunkOf(host) : 0;
        if (host && chunk > 0) {
            const n = used.get(host) ?? 0;
            if (n >= chunk) {
                rest.push(c);
                continue;
            }
            used.set(host, n + 1);
        }
        (c as any)._slice = false;
        (c as any)._sliceHost = undefined;
        releasing = c;
        try {
            const materialize = (c as any)._materialize;
            if (typeof materialize === 'function') materialize.call(c);
            else c.isWait = false;
        } catch (error) {
            reportError('MJX130', error);
        } finally {
            releasing = null;
        }
    }
    if (rest.length) {
        queue.push(...rest);
        schedulePump();
    }
}
