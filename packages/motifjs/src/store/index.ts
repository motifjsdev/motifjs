
import { ReactiveEngine } from "./ReactiveEngine";
import { UnwrapValueRefs } from "./common";
import { Signal, Computed, LazyComputed } from "./Signal";
import { registerStore } from "../devtools/devbus";
export const engine = new ReactiveEngine();


export function reactiveConfig(config: {
    onValueChanged?: (info: { raw: any, proxy: any }, key: any) => any
    onItemAdded?: (model: any, key: any, value: any) => any
    onItemRemoved?: (model: any, key: any, value: any) => any
}) {
    engine.onValueChanged = config.onValueChanged;
}

// export * from "./IStoreBinder";

// export function reactiveListeners(model?: any) {
//     if (model) {
//         /* @DEV-ONLY */return debugGetDeps(model) ?? new Map();
//     return debugGetDepMap();


export function reactive<T>(model: T): UnwrapValueRefs<T> {
    const result = engine.reactive<T>(model);
    /* @DEV-ONLY */ registerStore(result as object, 'reactive', 'reactive', model);
    return result;
}

export function useModel<T>(model: T): UnwrapValueRefs<T> {
    const result = engine.reactive<T>(model);
    /* @DEV-ONLY */ registerStore(result as object, 'reactive', 'useModel', model);
    return result;
}



export function clearModel(model: any) {
    return engine.clearModel(model);
}

 

export function deepClone(item: any) {
    return engine.deepClone(item);
}

export function createSignal<T>(initialValue: T): Signal<T> {
    const sig = new Signal(initialValue);
    /* @DEV-ONLY */ registerStore(sig, 'signal', 'signal');
    return sig;
}

export function createComputed<T>(getter: () => T): Computed<T> {
    const comp = new Computed(getter);
    /* @DEV-ONLY */ registerStore(comp, 'computed', 'computed');
    return comp;
}

export function createLazyComputed<T>(getter: () => T): LazyComputed<T> {
    const comp = new LazyComputed(getter);
    /* @DEV-ONLY */ registerStore(comp, 'computed', 'lazyComputed');
    return comp;
}

export { ReactiveEngine };
export { configureReactivityLeakMonitor, track, trigger, effect, createScheduledEffect, asyncTracking, untracked } from "./reactivity-core";
export type { EffectFn, ScheduledEffect, AsyncTrackingToken } from "./reactivity-core";
export * from "./Signal";
import { untracked } from "./reactivity-core";
