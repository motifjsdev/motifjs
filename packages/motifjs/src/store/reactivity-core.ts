
import { LeakMonitor } from "../common/LeakMonitor";
import { reportError, reportWarning } from "../common/diagnostics";
import { getRaw, followTracking } from "./common";
import { pushTight } from "../common/pushTight";
import { effectCreated, effectStopped, runStarting, runFinished, triggered, flushStarting, flushFinished } from "../devtools/reactivity";

export type EffectFn = () => void;

class Effect {
    deps: [object, string | symbol][] = [];
    active = true;
    running = false;
    scheduler?: () => void;
    constructor(public fn: EffectFn, private callback?: (value: unknown) => void) { }
    run() {
        let value: unknown;
        if (!this.active || this.running) return;
        cleanup(this);
        effectStack.push(this);
        this.running = true;
        /* @DEV-ONLY */ const devAt = runStarting();
        try {
            value = this.fn();
        } finally {
            effectStack.pop();
            this.running = false;
            /* @DEV-ONLY */ runFinished(this, devAt);
            if (this.callback) {
                this.callback(value);
            }
        }
    }
    stop() {
        this.active = false;
        cleanup(this);
        /* @DEV-ONLY */ effectStopped(this);
    }
}

const depMap = new WeakMap<object, Map<string | symbol, Set<Effect>>>();
const effectStack: Effect[] = [];
const effectQueue = new Set<Effect>();
let isFlushing = false;

let leakEnabled = false;
let leakThreshold = -1;
let leakMonitor: LeakMonitor | undefined;
const leakCleanups = new WeakMap<Set<Effect>, Map<Effect, () => void>>();
export function configureReactivityLeakMonitor(opts: { enabled?: boolean; threshold?: number; name?: string } = {}) {
    leakEnabled = !!opts.enabled;
    leakThreshold = typeof opts.threshold === 'number' ? opts.threshold : (leakEnabled ? 200 : -1);
    leakMonitor = leakEnabled && leakThreshold > 0 ? new LeakMonitor(leakThreshold, opts.name ?? 'reactivity-core') : undefined;
}

export function track(target: object, key: string | symbol) {
    if (!followTracking) return;
    const rawTarget = getRaw(target as any);
    const effect = effectStack[effectStack.length - 1];
    if (!effect || !effect.active) return;
    let deps = depMap.get(rawTarget);
    if (!deps) depMap.set(rawTarget, (deps = new Map()));
    let dep = deps.get(key);
    if (!dep) deps.set(key, (dep = new Set()));
    if (!dep.has(effect)) {
        dep.add(effect);
        pushTight(effect.deps, [rawTarget, key]);
        if (leakEnabled && leakMonitor && leakThreshold > 0) {
            try {
                const cleanup = leakMonitor.check(dep.size);
                if (cleanup) {
                    let m = leakCleanups.get(dep);
                    if (!m) { m = new Map(); leakCleanups.set(dep, m); }
                    m.set(effect, cleanup);
                }
            } catch { }
        }
    }
}

export function trigger(target: object, key: string | symbol) {
    const rawTarget = getRaw(target as any);
    const deps = depMap.get(rawTarget);
    if (!deps) return;
    const effects = deps.get(key);
    if (!effects) return;
    /* @DEV-ONLY */ triggered(rawTarget, key, effects);
    let queued = false;
    effects.forEach(effect => {
        if (!effect.active) return;
        if (effect.scheduler) {
            runReported(effect.scheduler);
            return;
        }
        effectQueue.add(effect);
        queued = true;
    });
    if (queued) flushEffects();
}

function runReported(fn: () => unknown) {
    try {
        fn();
    } catch (error) {
        reportError('MJX208', error);
    }
}

const MAX_EFFECT_RUNS_PER_FLUSH = 50;

function flushEffects() {
    if (isFlushing) return;
    isFlushing = true;
    Promise.resolve().then(() => {
        /* @DEV-ONLY */ flushStarting();
        const runCounts = new Map<Effect, number>();
        try {
            while (effectQueue.size > 0) {
                const batch = Array.from(effectQueue);
                effectQueue.clear();
                for (const e of batch) {
                    const runs = (runCounts.get(e) ?? 0) + 1;
                    runCounts.set(e, runs);
                    if (runs > MAX_EFFECT_RUNS_PER_FLUSH) {
                        if (runs === MAX_EFFECT_RUNS_PER_FLUSH + 1) {
                            reportWarning('MJX203', [MAX_EFFECT_RUNS_PER_FLUSH], { fn: String((e as any).fn).slice(0, 200) });
                        }
                        continue;
                    }
                    runReported(() => e.run());
                }
            }
        } finally {
            effectQueue.clear();
            isFlushing = false;
            /* @DEV-ONLY */ flushFinished();
        }
    });
}

function cleanup(effect: Effect) {
    for (const [target, key] of effect.deps) {
        const keyMap = depMap.get(target);
        if (!keyMap) continue;
        const depSet = keyMap.get(key);
        if (!depSet) continue;
        depSet.delete(effect);
        try {
            const map = leakCleanups.get(depSet);
            const fn = map?.get(effect);
            if (fn) { try { fn(); } catch { } map!.delete(effect); }
        } catch { }
        if (depSet.size === 0) {
            keyMap.delete(key);
        }
        if (keyMap.size === 0) {
            depMap.delete(target);
        }
    }
    effect.deps = [];
}


export function effect<T>(fn: () => T, onValueChanged?: (value: NoInfer<T>) => void) {
    const e = new Effect(fn, onValueChanged as ((value: unknown) => void) | undefined);
    runReported(() => e.run());
    /* @DEV-ONLY */ effectCreated(e);
    return () => e.stop();
}

export interface ScheduledEffect {
    run(): void;
    stop(): void;
}

export function createScheduledEffect(fn: EffectFn, scheduler: () => void): ScheduledEffect {
    const e = new Effect(fn);
    e.scheduler = scheduler;
    /* @DEV-ONLY */ effectCreated(e);
    return {
        run: () => { runReported(() => e.run()); },
        stop: () => e.stop(),
    };
}

export interface AsyncTrackingToken { effect: Effect | undefined; pushed: boolean }
function popAsyncTracking(t: AsyncTrackingToken) {
    if (!t.pushed) return;
    t.pushed = false;
    const i = effectStack.lastIndexOf(t.effect!);
    if (i >= 0) effectStack.splice(i, 1);
}
export const asyncTracking = {
    capture(): AsyncTrackingToken {
        return { effect: effectStack[effectStack.length - 1], pushed: false };
    },
    suspend<T>(t: AsyncTrackingToken, value: T): T {
        popAsyncTracking(t);
        return value;
    },
    resume<T>(t: AsyncTrackingToken, value: T): T {
        if (t.effect && t.effect.active && !t.pushed) {
            effectStack.push(t.effect);
            t.pushed = true;
        }
        return value;
    },
    end(t: AsyncTrackingToken): void {
        popAsyncTracking(t);
    },
};

const UNTRACKED_SENTINEL = new Effect(() => { });
UNTRACKED_SENTINEL.active = false;
export function untracked<T>(fn: () => T): T {
    effectStack.push(UNTRACKED_SENTINEL);
    try {
        return fn();
    } finally {
        effectStack.pop();
    }
}



export function debugGetDeps(target: object): Map<string | symbol, Set<Effect>> | undefined {
    const rawTarget = getRaw(target as any);
    return depMap.get(rawTarget);
}
export function debugGetDepMap(): WeakMap<object, Map<string | symbol, Set<Effect>>> {
    return depMap;
}
