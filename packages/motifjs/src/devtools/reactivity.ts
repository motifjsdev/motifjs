import { devtools } from './devbus';
import { preview, pathOf, tagOf, effectInfoOf, ownEffect, disownEffect } from './inspect';

type Trigger = { target: any; key: string; count: number };
type Flush = { at: number; runs: number; effects: Map<object, number>; triggers: Map<string, Trigger> };

let lastCreated: object | null = null;
let pending = new Map<string, Trigger>();
let current: Flush | null = null;

export function effectCreated(e: object): void {
    if (devtools() === undefined) return;
    effectInfoOf(e);
    lastCreated = e;
}

export function effectOwner(owner: object | null, kind: string): void {
    if (devtools() === undefined || lastCreated === null) return;
    const info = effectInfoOf(lastCreated);
    info.kind = kind;
    if (owner !== null) ownEffect(owner, lastCreated, info);
    lastCreated = null;
}

export function effectStopped(e: object): void { disownEffect(e); }

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
    if (current !== null) {
        current.runs++;
        current.effects.set(e, (current.effects.get(e) ?? 0) + 1);
    }
}

export function triggered(target: object, key: unknown, effects: Set<object>): void {
    if (devtools() === undefined) return;
    const t = { target: preview(target), key: String(key) };
    for (const e of effects) effectInfoOf(e).lastTrigger = t;
    const id = t.key + '\u0000' + JSON.stringify(t.target);
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
        return { path: o ? pathOf(o) : null, type: o ? (o.constructor?.name ?? '') : null, tag: o ? tagOf(o) : null, kind: info.kind, runs };
    });
    emit('reactivity:flush', { duration: performance.now() - f.at, runs: f.runs, triggers: [...f.triggers.values()], effects });
}
