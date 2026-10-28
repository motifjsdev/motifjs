
import { LeakMonitor } from "../common/LeakMonitor";
import { reportError, reportWarning } from "../common/diagnostics";
import { getRaw, followTracking, RANGE_KEY } from "./common";
import { effectCreated, effectStopped, effectOwnerLabel, runStarting, runFinished, triggered, flushStarting, flushFinished } from "../devtools/reactivity";
import { configureScanMonitor, scanEffectStopped } from "./scanMonitor";

export type EffectFn = () => void;

type Mark = Effect | EffectMark;
type Dep = Mark | Map<Effect, number>;

class EffectMark {
    constructor(public effect: Effect) { }
}

class Effect {
    deps: (object | string | symbol)[] = [];
    active = true;
    running = false;
    runs = 0;
    mark: EffectMark | undefined = undefined;
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
        /* @DEV-ONLY */ scanEffectStopped(this);
    }
}

const depMap = new WeakMap<object, Map<string | symbol, Dep>>();
const effectStack: Effect[] = [];
const rangeMax = new WeakMap<object, Map<Effect, number>>();
const effectQueue = new Set<Effect>();
let isFlushing = false;

let dependencyLimit = 1000;
let dependencyWarnings = 0;
const MAX_DEPENDENCY_WARNINGS = 10;
let leakEnabled = false;
let leakThreshold = -1;
let leakMonitor: LeakMonitor | undefined;
const leakCleanups = new WeakMap<Map<Effect, number>, Map<Effect, () => void>>();
export function configureReactivityLeakMonitor(opts: { enabled?: boolean; threshold?: number; name?: string; dependencies?: number; scans?: boolean } = {}) {
    if (typeof opts.scans === 'boolean') configureScanMonitor(opts.scans);
    if (typeof opts.dependencies === 'number') {
        dependencyLimit = opts.dependencies;
        dependencyWarnings = 0;
    }
    if (opts.enabled === undefined && opts.threshold === undefined && opts.name === undefined) return;
    leakEnabled = !!opts.enabled;
    leakThreshold = typeof opts.threshold === 'number' ? opts.threshold : (leakEnabled ? 200 : -1);
    leakMonitor = leakEnabled && leakThreshold > 0 ? new LeakMonitor(leakThreshold, opts.name ?? 'reactivity-core') : undefined;
}

export function trackingEffect(): object | null {
    if (!followTracking) return null;
    const effect = effectStack[effectStack.length - 1];
    return effect !== undefined && effect.active ? effect : null;
}

export function track(target: object, key: string | symbol) {
    if (!followTracking) return;
    const rawTarget = getRaw(target as any);
    const effect = effectStack[effectStack.length - 1];
    if (!effect || !effect.active) return;
    let deps = depMap.get(rawTarget);
    if (!deps) depMap.set(rawTarget, (deps = new Map()));
    const dep = deps.get(key);
    if (dep instanceof Map) {
        const seen = dep.get(effect);
        if (seen === effect.runs) return;
        dep.set(effect, effect.runs);
        if (seen !== undefined) return;
    } else {
        const mark = markOf(effect, effect.runs);
        if (dep === mark) return;
        if (dep === undefined) {
            deps.set(key, mark);
        } else if (ownerOf(dep) === effect) {
            deps.set(key, mark);
            return;
        } else {
            deps.set(key, new Map([[ownerOf(dep), runOf(dep)], [effect, effect.runs]]));
        }
    }
    const list = effect.deps;
    if (list.length === 0) {
        list.length = 2;
        list[0] = rawTarget;
        list[1] = key;
    } else {
        list.push(rawTarget, key);
    }
    if (leakEnabled && leakMonitor && leakThreshold > 0) {
        try {
            let subscribers = deps.get(key)!;
            const cleanup = leakMonitor.check(subscribers instanceof Map ? subscribers.size : 1);
            if (cleanup) {
                if (!(subscribers instanceof Map)) deps.set(key, (subscribers = new Map([[effect, effect.runs]])));
                let m = leakCleanups.get(subscribers);
                if (!m) { m = new Map(); leakCleanups.set(subscribers, m); }
                m.set(effect, cleanup);
            }
        } catch { }
    }
}

function markOf(effect: Effect, runs: number): Mark {
    if ((runs & 1) === 1) return effect;
    return effect.mark ?? (effect.mark = new EffectMark(effect));
}

function ownerOf(mark: Mark): Effect {
    return mark instanceof EffectMark ? mark.effect : mark;
}

function runOf(mark: Mark): number {
    const effect = ownerOf(mark);
    return ((effect.runs & 1) === 1) === (mark === effect) ? effect.runs : effect.runs - 1;
}

function seenInRun(dep: Dep | undefined, effect: Effect): boolean {
    if (dep === undefined) return false;
    if (dep instanceof Map) return dep.get(effect) === effect.runs;
    return dep === ((effect.runs & 1) === 1 ? effect : effect.mark);
}

export function trackRange(target: object, maxIndex: number) {
    if (!followTracking) return;
    const rawTarget = getRaw(target as any);
    const effect = effectStack[effectStack.length - 1];
    if (!effect || !effect.active) return;
    let ranges = rangeMax.get(rawTarget);
    if (!ranges) rangeMax.set(rawTarget, (ranges = new Map()));
    const fresh = !seenInRun(depMap.get(rawTarget)?.get(RANGE_KEY), effect);
    ranges.set(effect, fresh ? maxIndex : Math.max(ranges.get(effect) ?? -1, maxIndex));
    track(rawTarget, RANGE_KEY);
}

export function triggerRange(target: object, from: number) {
    const rawTarget = getRaw(target as any);
    const effects = depMap.get(rawTarget)?.get(RANGE_KEY);
    if (!effects) return;
    const ranges = rangeMax.get(rawTarget);
    const woken: Effect[] = [];
    const wake = (effect: Effect) => { if (effect.active && (ranges?.get(effect) ?? Infinity) >= from) woken.push(effect); };
    if (effects instanceof Map) effects.forEach((_run, effect) => wake(effect));
    else wake(ownerOf(effects));
    if (woken.length === 0) return;
    /* @DEV-ONLY */ triggered(rawTarget, RANGE_KEY, woken);
    let queued = false;
    for (const effect of woken) {
        if (effect.scheduler) {
            runReported(effect.scheduler);
            continue;
        }
        effectQueue.add(effect);
        queued = true;
    }
    if (queued) flushEffects();
}

export function trigger(target: object, key: string | symbol) {
    const rawTarget = getRaw(target as any);
    const deps = depMap.get(rawTarget);
    if (!deps) return;
    const effects = deps.get(key);
    if (!effects) return;
    if (!(effects instanceof Map)) {
        const effect = ownerOf(effects);
        /* @DEV-ONLY */ triggered(rawTarget, key, [effect]);
        if (!effect.active) return;
        if (effect.scheduler) {
            runReported(effect.scheduler);
            return;
        }
        effectQueue.add(effect);
        flushEffects();
        return;
    }
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
    const count = effect.deps.length / 2;
    if (effect.warned || dependencyLimit <= 0 || count < dependencyLimit || dependencyWarnings >= MAX_DEPENDENCY_WARNINGS) return;
    effect.warned = true;
    dependencyWarnings++;
    reportWarning('MJX209', [count, dependencyLimit, effectOwnerLabel(effect)], { fn: String(effect.fn).slice(0, 200) });
}

function release(effect: Effect, target: object, key: string | symbol) {
    const keyMap = depMap.get(target);
    if (!keyMap) return;
    const dep = keyMap.get(key);
    if (!dep) return;
    if (key === RANGE_KEY) rangeMax.get(target)?.delete(effect);
    if (dep instanceof Map) {
        dep.delete(effect);
        try {
            const map = leakCleanups.get(dep);
            const fn = map?.get(effect);
            if (fn) { try { fn(); } catch { } map!.delete(effect); }
        } catch { }
        if (dep.size === 0) {
            keyMap.delete(key);
        } else if (dep.size === 1 && !leakCleanups.get(dep)?.size) {
            const [owner, runs] = dep.entries().next().value!;
            keyMap.set(key, markOf(owner, runs));
        }
    } else if (ownerOf(dep) === effect) {
        keyMap.delete(key);
    }
    if (keyMap.size === 0) {
        depMap.delete(target);
    }
}

function cleanup(effect: Effect) {
    const list = effect.deps;
    for (let i = 0; i < list.length; i += 2) release(effect, list[i] as object, list[i + 1] as string | symbol);
    effect.deps = [];
}

function sweep(effect: Effect) {
    const list = effect.deps;
    let kept = 0;
    for (let i = 0; i < list.length; i += 2) {
        const target = list[i] as object;
        const key = list[i + 1] as string | symbol;
        if (seenInRun(depMap.get(target)?.get(key), effect)) {
            list[kept++] = target;
            list[kept++] = key;
            continue;
        }
        release(effect, target, key);
    }
    list.length = kept;
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
    const deps = depMap.get(rawTarget);
    if (!deps) return undefined;
    const view = new Map<string | symbol, Map<Effect, number>>();
    deps.forEach((dep, key) => view.set(key, dep instanceof Map ? dep : new Map([[ownerOf(dep), runOf(dep)]])));
    return view;
}

class DepMapView extends WeakMap<object, Map<string | symbol, Map<Effect, number>>> {
    get(target: object) { return debugGetDeps(target); }
    has(target: object) { return depMap.has(getRaw(target as any)); }
}
const depMapView = new DepMapView();
export function debugGetDepMap(): WeakMap<object, Map<string | symbol, Map<Effect, number>>> {
    return depMapView;
}
