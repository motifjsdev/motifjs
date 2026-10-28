import type { ComponentBase } from "./componentBase";
import { reportError } from "../common/diagnostics";

type HostState = { turn: number; used: number };
type HostQueue = { items: (ComponentBase | undefined)[]; head: number };

const states = new WeakMap<ComponentBase, HostState>();
const queues = new Map<ComponentBase, HostQueue>();
let queued = 0;
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
    if (!c.isWait) c.isWait = true;
    let q = queues.get(host);
    if (q === undefined) queues.set(host, q = { items: [], head: 0 });
    q.items.push(c);
    queued++;
    schedulePump();
}

export function slicesPending(): number {
    return queued;
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

function release(c: ComponentBase): void {
    (c as any)._slice = false;
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

function pump(): void {
    pumpQueued = false;
    for (const host of [...queues.keys()]) {
        const q = queues.get(host)!;
        const chunk = host.isDisposed ? 0 : chunkOf(host);
        const end = q.items.length;
        let used = 0;
        while (q.head < end && (chunk === 0 || used < chunk)) {
            const c = q.items[q.head]!;
            q.items[q.head++] = undefined;
            queued--;
            if (c.isDisposed || !(c as any)._slice) continue;
            if (!c.isWait) {
                (c as any)._slice = false;
                continue;
            }
            used++;
            release(c);
        }
        if (q.head >= q.items.length) queues.delete(host);
        else if (q.head > 1024 && q.head * 2 > q.items.length) {
            q.items = q.items.slice(q.head);
            q.head = 0;
        }
    }
    if (queues.size) schedulePump();
}
