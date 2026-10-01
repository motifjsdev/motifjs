
import { ReactiveEngine } from "./ReactiveEngine";
import { UnwrapValueRefs } from "./common";
import { Signal, Computed, LazyComputed } from "./Signal";
export const engine = new ReactiveEngine();


/* @DEV-ONLY */ const reactiveRegistry: Array<{ name: string; value: any; type: string }> = [];
const isDevRegistryEnabled = () => {
    try {
        const g = globalThis as any;
        if (!g.__MOTIF_DEV__) return false;
        if (g.__MOTIF_STORE_REGISTRY__ !== reactiveRegistry) g.__MOTIF_STORE_REGISTRY__ = reactiveRegistry;
        return true;
    } catch { return false; }
};

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
    /* @DEV-ONLY */ try {
    /* @DEV-ONLY */     if (isDevRegistryEnabled()) {
    /* @DEV-ONLY */         const name = (model as any)?.constructor?.name || 'reactive';
    /* @DEV-ONLY */         reactiveRegistry.push({ name, value: result, type: 'reactive' });
    /* @DEV-ONLY */         if (reactiveRegistry.length > 200) reactiveRegistry.shift();
            /* @DEV-ONLY */}
        /* @DEV-ONLY */
     /* @DEV-ONLY */ } catch { }
    return result;
}

export function useModel<T>(model: T): UnwrapValueRefs<T> {
    const result = engine.reactive<T>(model);


    /* @DEV-ONLY */ try {
    /* @DEV-ONLY */     if (isDevRegistryEnabled()) {
    /* @DEV-ONLY */         const name = (model as any)?.constructor?.name || 'useModel';
    /* @DEV-ONLY */         reactiveRegistry.push({ name, value: result, type: 'reactive' });
    /* @DEV-ONLY */         if (reactiveRegistry.length > 200) reactiveRegistry.shift();
            /* @DEV-ONLY */        }
/* @DEV-ONLY */
     /* @DEV-ONLY */ } catch { }
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
    /* @DEV-ONLY */ try {
    /* @DEV-ONLY */     if (isDevRegistryEnabled()) {
    /* @DEV-ONLY */         const name = `signal_${reactiveRegistry.length}`;
    /* @DEV-ONLY */         reactiveRegistry.push({ name, value: sig.value, type: 'signal' });
    /* @DEV-ONLY */         if (reactiveRegistry.length > 200) reactiveRegistry.shift();
            /* @DEV-ONLY */}
        /* @DEV-ONLY */
     /* @DEV-ONLY */ } catch { }
    return sig;
}

export function createComputed<T>(getter: () => T): Computed<T> {
    const comp = new Computed(getter);
    /* @DEV-ONLY */ try {
    /* @DEV-ONLY */     if (isDevRegistryEnabled()) {
    /* @DEV-ONLY */         const name = `computed_${reactiveRegistry.length}`;
    /* @DEV-ONLY */         reactiveRegistry.push({ name, value: comp.value, type: 'computed' });
    /* @DEV-ONLY */         if (reactiveRegistry.length > 200) reactiveRegistry.shift();
            /* @DEV-ONLY */}
        /* @DEV-ONLY */
     /* @DEV-ONLY */ } catch { }
    return comp;
}

export function createLazyComputed<T>(getter: () => T): LazyComputed<T> {
    const comp = new LazyComputed(getter);
    /* @DEV-ONLY */ try {
    /* @DEV-ONLY */     if (isDevRegistryEnabled()) {
    /* @DEV-ONLY */         const name = `lazyComputed_${reactiveRegistry.length}`;
    /* @DEV-ONLY */         reactiveRegistry.push({ name, value: undefined, type: 'computed' });
    /* @DEV-ONLY */         if (reactiveRegistry.length > 200) reactiveRegistry.shift();
            /* @DEV-ONLY */}
        /* @DEV-ONLY */
      /* @DEV-ONLY */} catch { }
    return comp;
}

export { ReactiveEngine };
export { configureReactivityLeakMonitor, track, trigger, effect, createScheduledEffect, asyncTracking, untracked } from "./reactivity-core";
export type { EffectFn, ScheduledEffect, AsyncTrackingToken } from "./reactivity-core";
export * from "./Signal";
import { untracked } from "./reactivity-core";
