import { devtools, storeOf } from './devbus';
import { preview, pathOf, tagOf, typeOf, effectInfoOf, ownEffect, disownEffect } from './inspect';
import { countEffectCreated, countEffectOwned, countEffectStopped, countRun, countFlush } from './counters';

type Trigger = { target: any; key: string; count: number; store?: { id: number; path: string[] } };
type Flush = { at: number; runs: number; effects: Map<object, number>; triggers: Map<string, Trigger> };

let nextOwner: { owner: object | null; kind: string } | null = null;
let pending = new Map<string, Trigger>();
let current: Flush | null = null;

export function effectCreated(e: object): void {
    if (devtools() === undefined) return;
    const info = effectInfoOf(e);
    countEffectCreated(e);
    const next = nextOwner;
    if (next === null) return;
    nextOwner = null;
    info.kind = next.kind;
    if (next.owner !== null) {
        ownEffect(next.owner, e, info);
        countEffectOwned(e);
    }
}

export function effectOwner(owner: object | null, kind: string): void {
    if (devtools() === undefined) return;
    nextOwner = { owner, kind };
}

export function effectOwnerLabel(e: object): string {
    if (devtools() === undefined) return '';
    const info = effectInfoOf(e);
    const owner = info.owner;
    if (owner === null) return info.kind === 'effect' ? '' : info.kind;
    const path = pathOf(owner);
    return `${typeOf(owner)}${path === null ? '' : ' at [' + path.join(', ') + ']'} (${info.kind})`;
}

export function effectStopped(e: object): void {
    if (devtools() === undefined) return;
    countEffectStopped(e);
    disownEffect(e);
}

export function runStarting(): number {
    return devtools() === undefined ? -1 : performance.now();
}

export function runFinished(e: object, at: number): void {
    if (at < 0) return;
    const now = performance.now();
    const info = effectInfoOf(e);
    info.runs++;
    info.lastDuration = now - at;
    info.lastRunAt = now;
    countRun();
    if (current !== null) {
        current.runs++;
        current.effects.set(e, (current.effects.get(e) ?? 0) + 1);
    }
}

export function triggered(target: object, key: unknown, effects: Iterable<object>): void {
    if (devtools() === undefined) return;
    const store = storeOf(target);
    const t: { target: any; key: string; store?: { id: number; path: string[] } } = { target: preview(target), key: store !== null && store.type !== 'reactive' ? 'value' : String(key) };
    if (store !== null) t.store = { id: store.id, path: store.path };
    for (const e of effects) effectInfoOf(e).lastTrigger = t;
    const id = t.key + '\u0000' + JSON.stringify(t.target) + '\u0000' + (store === null ? '' : store.id + '\u0000' + store.path.join('\u0000'));
    const p = pending.get(id);
    if (p) p.count++; else pending.set(id, { ...t, count: 1 });
}

export function flushStarting(): void {
    if (devtools() === undefined) return;
    current = { at: performance.now(), runs: 0, effects: new Map(), triggers: pending };
    pending = new Map();
}

export function flushFinished(): void {
    const f = current;
    current = null;
    const emit = devtools();
    if (f === null || emit === undefined) return;
    const effects = [...f.effects].map(([e, runs]) => {
        const info = effectInfoOf(e);
        const o: any = info.owner;
        return { path: o ? pathOf(o) : null, type: o ? typeOf(o) : null, tag: o ? tagOf(o) : null, kind: info.kind, runs };
    });
    const duration = performance.now() - f.at;
    countFlush(duration, f.runs);
    emit('reactivity:flush', { duration, runs: f.runs, triggers: [...f.triggers.values()], effects });
}
