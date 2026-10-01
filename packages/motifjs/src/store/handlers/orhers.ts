import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, hasOwn, isIntrinsicSymbol, pauseTracking, resetTracking } from "../common";
import { track, trigger } from "../reactivity-core";

export function createOwn(engine: ReactiveEngine) {
    return function ownKeys(target: any) {
        const shapeKey = Array.isArray(target) ? 'length' : ITERATE_KEY;
        track(target, shapeKey);
        return Reflect.ownKeys(target);
    }
}

export function createHas(engine: ReactiveEngine) {
    return function has(target: any, p: any) {
        const found = Reflect.has(target, p);
        if (isIntrinsicSymbol(p)) return found;
        track(target, p);
        return found;
    }
}

export function createDelete(engine: ReactiveEngine) {
    return function deleteProperty(target: any, p: any) {
        pauseTracking()
        try {
            const isOwned = hasOwn(target, p);
            const result = Reflect.deleteProperty(target, p);
            if (isOwned) {
                if (Array.isArray(target)) {
                    trigger(target, 'length');
                } else {
                    trigger(target, p);
                    trigger(target, ITERATE_KEY);
                }
            }
            return result
        } finally { 
            resetTracking();
        }
    }
}