import type { ComponentBase } from "./componentBase";
import { reportError } from "../common/diagnostics";

type HostState = { turn: number; used: number };
type HostQueue = { items: (ComponentBase | undefined)[]; head: number };
type HostTurn = { host: ComponentBase; q: HostQueue; end: number };
type FramePlan = { rows: number; time: number };

const FIRST_SLICE = 100;
const FRAME_BUDGET = 10;
const FRAME_TARGET = 50;

const states = new WeakMap<ComponentBase, HostState>();
const queues = new Map<ComponentBase, HostQueue>();
const now: () => number = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();
let queued = 0;
let turn = 0;
let turnEndQueued = false;
let pumpQueued = false;
let releasing: ComponentBase | null = null;
let frameAt = -1;
let lastWork = 0;
let lastRows = 0;
let renderPerRow = Infinity;

export function chunkOf(host: ComponentBase | null | undefined): number {
    const n = (host as any)?.motif?.options?.chunk;
    if (n === true) return 0;
    return typeof n === 'number' && n >= 1 ? Math.floor(n) : -1;
}

function stateOf(host: ComponentBase): HostState {
    if (!turnEndQueued) {
        turnEndQueued = true;
        queueMicrotask(() => { turnEndQueued = false; turn++; });
    }
    let state = states.get(host);
    if (state === undefined) states.set(host, state = { turn: -1, used: 0 });
    if (state.turn !== turn) {
        state.turn = turn;
        state.used = 0;
    }
    return state;
}

function hasWaitBinding(c: ComponentBase): boolean {
    const items = (c as any)._bindings?._items;
    return Array.isArray(items) && items.some((b: any) => b?.propertyName === 'isWait');
}

function sliceOf(chunk: number): number {
    return chunk > 0 ? chunk : FIRST_SLICE;
}

export function sliceRemaining(host: ComponentBase): number {
    if (host === releasing) return Infinity;
    const chunk = chunkOf(host);
    if (chunk < 0) return Infinity;
    return Math.max(0, sliceOf(chunk) - stateOf(host).used);
}

export function sliceWanted(host: ComponentBase, c: ComponentBase): boolean {
    if (host === releasing) return false;
    const chunk = chunkOf(host);
    if (chunk < 0) return false;
    if ((c.element as Node | null)?.nodeType === Node.COMMENT_NODE) return false;
    if (hasWaitBinding(c)) return false;
    const state = stateOf(host);
    if (state.used < sliceOf(chunk)) {
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
    if (typeof raf === 'function' && !hidden) raf(() => { frameAt = now(); setTimeout(run, 0); });
    else setTimeout(run, 16);
}

function schedulePump(): void {
    if (pumpQueued) return;
    pumpQueued = true;
    nextFrame(pump);
}

function release(c: ComponentBase, host: ComponentBase): void {
    (c as any)._slice = false;
    releasing = host;
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

function releaseNext(entry: HostTurn): boolean {
    const q = entry.q;
    while (q.head < entry.end) {
        const c = q.items[q.head]!;
        q.items[q.head++] = undefined;
        queued--;
        if (c.isDisposed || !(c as any)._slice) continue;
        if (!c.isWait) {
            (c as any)._slice = false;
            continue;
        }
        release(c, entry.host);
        return true;
    }
    return false;
}

function framePlan(rendering: number): FramePlan {
    if (rendering < 0 || lastRows === 0) return { rows: Infinity, time: FRAME_BUDGET };
    const workPerRow = lastWork / lastRows;
    renderPerRow = Math.min(renderPerRow, rendering / lastRows);
    const fixed = Math.max(0, rendering - renderPerRow * lastRows);
    const room = fixed < FRAME_TARGET ? FRAME_TARGET - fixed : fixed;
    const rows = Math.max(1, Math.min(lastRows * 2, Math.floor(room / (workPerRow + renderPerRow))));
    return { rows, time: Math.max(FRAME_BUDGET, room) };
}

function pump(): void {
    pumpQueued = false;
    const started = now();
    const plan = framePlan(frameAt >= 0 ? started - frameAt : -1);
    frameAt = -1;
    let released = 0;
    let turns: HostTurn[] = [];
    for (const [host, q] of [...queues]) {
        const entry: HostTurn = { host, q, end: q.items.length };
        const chunk = host.isDisposed ? -1 : chunkOf(host);
        if (chunk < 0) {
            while (releaseNext(entry)) { }
            continue;
        }
        let quota = Math.max(chunk, 1);
        while (quota > 0 && releaseNext(entry)) {
            quota--;
            released++;
        }
        turns.push(entry);
    }
    while (turns.length && released < plan.rows && now() - started < plan.time) {
        turns = turns.filter(entry => {
            if (released >= plan.rows || !releaseNext(entry)) return false;
            released++;
            return true;
        });
    }
    lastWork = now() - started;
    lastRows = released;
    for (const [host, q] of [...queues]) {
        if (q.head >= q.items.length) queues.delete(host);
        else if (q.head > 1024 && q.head * 2 > q.items.length) {
            q.items = q.items.slice(q.head);
            q.head = 0;
        }
    }
    if (queues.size) schedulePump();
    else {
        lastWork = 0;
        lastRows = 0;
        renderPerRow = Infinity;
    }
}
