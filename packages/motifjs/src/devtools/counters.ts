import { componentAt } from './inspect';

const live = new Map<string, number>();
let counted = new WeakSet<object>();
let countedEffects = new WeakSet<object>();
let ownedSet = new WeakSet<object>();
let liveEffects = 0, ownedEffects = 0;
let runs = 0, flushes = 0, flushRuns = 0, lastFlush = 0, maxFlush = 0;

export function resetCounters(): void {
    live.clear();
    counted = new WeakSet(); countedEffects = new WeakSet(); ownedSet = new WeakSet();
    liveEffects = 0; ownedEffects = 0;
    runs = 0; flushes = 0; flushRuns = 0; lastFlush = 0; maxFlush = 0;
}

const typeOf = (c: any): string => c.constructor?.name ?? '';

export function countCreated(c: any): void {
    counted.add(c);
    const t = typeOf(c);
    live.set(t, (live.get(t) ?? 0) + 1);
}

export function countDisposed(c: any): void {
    if (!counted.delete(c)) return;
    const t = typeOf(c);
    const n = (live.get(t) ?? 1) - 1;
    if (n > 0) live.set(t, n); else live.delete(t);
}

export function countEffectCreated(e: object): void {
    if (countedEffects.has(e)) return;
    countedEffects.add(e);
    liveEffects++;
}

export function countEffectOwned(e: object): void {
    if (!countedEffects.has(e) || ownedSet.has(e)) return;
    ownedSet.add(e);
    ownedEffects++;
}

export function countEffectStopped(e: object): void {
    if (countedEffects.delete(e)) liveEffects--;
    if (ownedSet.delete(e)) ownedEffects--;
}

export function countRun(): void { runs++; }

export function countFlush(duration: number, flushRunCount: number): void {
    flushes++;
    flushRuns += flushRunCount;
    lastFlush = duration;
    if (duration > maxFlush) maxFlush = duration;
}

export function getCounters() {
    let inTree = 0, bindings = 0, dom = 0, component = 0;
    const visit = (c: any) => {
        inTree++;
        bindings += c._bindings?._items.length ?? 0;
        for (let r = c._eventHandlers; r; r = r.next) {
            if ((r.flags & 64) !== 0) continue;
            if ((r.flags & 32) !== 0) dom++; else component++;
        }
        for (const ch of c._controls?.items ?? []) visit(ch);
    };
    const root = componentAt([]);
    if (root !== null) visit(root);
    let total = 0;
    const byType: Record<string, number> = {};
    for (const [t, n] of live) { byType[t] = n; total += n; }
    return {
        components: { live: total, inTree, notInTree: Math.max(0, total - inTree), byType },
        bindings,
        listeners: { dom, component },
        effects: { live: liveEffects, owned: ownedEffects },
        reactivity: { runs, flushes, flushRuns, lastFlushDuration: lastFlush, maxFlushDuration: maxFlush },
    };
}
