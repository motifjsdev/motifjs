import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, arrayMutation, hasOwn, isIntrinsicSymbol, isNumericKey, pauseTracking, resetTracking } from "../common";
import { track, trigger, triggerRange } from "../reactivity-core";
import { watching, wrote } from "../../devtools/changes";

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
            /* @DEV-ONLY */ const before = isOwned && arrayMutation.target !== target && watching() ? Object.getOwnPropertyDescriptor(target, p) : undefined;
            const result = Reflect.deleteProperty(target, p);
            /* @DEV-ONLY */ if (before !== undefined && result) wrote({ target, kind: 'delete', key: p, previous: before.value });
            if (isOwned) {
                if (Array.isArray(target)) {
                    trigger(target, 'length');
                    trigger(target, ITERATE_KEY);
                    if (isNumericKey(p)) {
                        if (arrayMutation.target === target) arrayMutation.from = Math.min(arrayMutation.from, Number(p));
                        else triggerRange(target, Number(p));
                    }
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