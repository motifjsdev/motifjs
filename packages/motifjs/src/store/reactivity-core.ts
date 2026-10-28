
import { LeakMonitor } from "../common/LeakMonitor";
import { reportError, reportWarning } from "../common/diagnostics";
import { getRaw, followTracking } from "./common";
import { pushTight } from "../common/pushTight";
import { effectCreated, effectStopped, effectOwnerLabel, runStarting, runFinished, triggered, flushStarting, flushFinished } from "../devtools/reactivity";

export type EffectFn = () => void;

type Dep = Map<Effect, number>;

class Effect {
    deps: [object, string | symbol][] = [];
    active = true;
    running = false;
    runs = 0;
    warned = false;
    scheduler?: () => void;
    constructor(public fn: EffectFn, private callback?: (value: unknown) => void) { }
    run() {
        let value: unknown;
        let ok = false;
        if (!this.active || this.running) return;
        this.runs++;
        effectStack.push(this);
        this.running = true;
        /* @DEV-ONLY */ const devAt = runStarting();
        try {
            value = this.fn();
            ok = true;
        } finally {
            effectStack.pop();
            this.running = false;
            sweep(this);
            /* @DEV-ONLY */ checkDependencies(this);
            /* @DEV-ONLY */ runFinished(this, devAt);
            if (ok && this.callback) {
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

const depMap = new WeakMap<object, Map<string | symbol, Dep>>();
const effectStack: Effect[] = [];
const effectQueue = new Set<Effect>();
let isFlushing = false;

let dependencyLimit = 1000;
let dependencyWarnings = 0;
const MAX_DEPENDENCY_WARNINGS = 10;
let leakEnabled = false;
let leakThreshold = -1;
let leakMonitor: LeakMonitor | undefined;
const leakCleanups = new WeakMap<Dep, Map<Effect, () => void>>();
export function configureReactivityLeakMonitor(opts: { enabled?: boolean; threshold?: number; name?: string; dependencies?: number } = {}) {
    if (typeof opts.dependencies === 'number') {
        dependencyLimit = opts.dependencies;
        dependencyWarnings = 0;
    }
    if (opts.enabled === undefined && opts.threshold === undefined && opts.name === undefined) return;
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
    if (!dep) deps.set(key, (dep = new Map()));
    const seen = dep.get(effect);
    if (seen === effect.runs) return;
    dep.set(effect, effect.runs);
    if (seen === undefined) {
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
    /* @DEV-ONLY */ triggered(rawTarget, key, effects.keys());
    let queued = false;
    effects.forEach((_run, effect) => {
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

function checkDependencies(effect: Effect) {
    if (effect.warned || dependencyLimit <= 0 || effect.deps.length < dependencyLimit || dependencyWarnings >= MAX_DEPENDENCY_WARNINGS) return;
    effect.warned = true;
    dependencyWarnings++;
    const count = effect.deps.length;
    reportWarning('MJX209', [count, dependencyLimit, effectOwnerLabel(effect)], { fn: String(effect.fn).slice(0, 200) });
}

function release(effect: Effect, target: object, key: string | symbol) {
    const keyMap = depMap.get(target);
    if (!keyMap) return;
    const dep = keyMap.get(key);
    if (!dep) return;
    dep.delete(effect);
    try {
        const map = leakCleanups.get(dep);
        const fn = map?.get(effect);
        if (fn) { try { fn(); } catch { } map!.delete(effect); }
    } catch { }
    if (dep.size === 0) {
        keyMap.delete(key);
    }
    if (keyMap.size === 0) {
        depMap.delete(target);
    }
}

function cleanup(effect: Effect) {
    for (const [target, key] of effect.deps) release(effect, target, key);
    effect.deps = [];
}

function sweep(effect: Effect) {
    const deps = effect.deps;
    let kept = 0;
    for (let i = 0; i < deps.length; i++) {
        const entry = deps[i];
        if (depMap.get(entry[0])?.get(entry[1])?.get(effect) === effect.runs) {
            deps[kept++] = entry;
            continue;
        }
        release(effect, entry[0], entry[1]);
    }
    deps.length = kept;
}


export function effect<T>(fn: () => T, onValueChanged?: (value: NoInfer<T>) => void) {
    const e = new Effect(fn, onValueChanged as ((value: unknown) => void) | undefined);
    /* @DEV-ONLY */ effectCreated(e);
    runReported(() => e.run());
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



export function debugGetDeps(target: object): Map<string | symbol, Map<Effect, number>> | undefined {
    const rawTarget = getRaw(target as any);
    return depMap.get(rawTarget);
}
export function debugGetDepMap(): WeakMap<object, Map<string | symbol, Map<Effect, number>>> {
    return depMap;
}
