import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, arrayMutation, getRaw, hasOwn, isNumericKey, isObject, isReadonly, removeArrayStack } from "../common";
import { trigger, triggerRange } from "../reactivity-core";
import { watching, reportSet } from "../../devtools/changes";


export function createSetter(engine: ReactiveEngine) {
    return function (target: any, p: any, newValue: any, receiver: any) {
        if (isReadonly(target)) {
            return false;
        }

        const isArray = Array.isArray(target);
        const oldValue = (target as any)[p];
        const oldLength = isArray ? target.length : 0;
        const numeric = isArray && isNumericKey(p);
        const hadKey = numeric ? Number(p) < oldLength : hasOwn(target, p);
        const value = isObject(newValue) ? getRaw(newValue) : newValue;
        const unchanged = hadKey && Object.is(value, oldValue) && (value !== undefined || hasOwn(target, p));
        /* @DEV-ONLY */ const cut = isArray && p === 'length' && arrayMutation.target !== target && Number(newValue) < oldLength && watching() ? target.slice(Number(newValue)) : null;

        const res = Reflect.set(target, p, value, receiver);

        if (engine.onValueChanged) {
            try { engine.onValueChanged({ raw: target, proxy: receiver }, p); } catch { }
        }

        if (getRaw(target) !== getRaw(receiver)) {
            return res;
        }
        if (unchanged) {
            return res;
        }
        /* @DEV-ONLY */ if (arrayMutation.target !== target && watching()) reportSet(target, p, hadKey, oldValue, value, cut);

        trigger(target, p);
        if (!isArray && !hadKey) {
            trigger(target, ITERATE_KEY);
        }
        if (isArray && arrayMutation.target !== target) {
            trigger(target, ITERATE_KEY);
            if (numeric) triggerRange(target, Number(p));
            else if (p === 'length') triggerRange(target, Number(newValue));
        } else if (isArray) {
            if (numeric) arrayMutation.from = Math.min(arrayMutation.from, Number(p));
            else if (p === 'length') arrayMutation.from = Math.min(arrayMutation.from, Number(newValue));
        }
        if (numeric && !hadKey) {
            trigger(target, 'length');
        }
        if (isArray && p === 'length') {
            const newLength = Number(newValue);
            for (let i = newLength; i < oldLength; i++) {
                trigger(target, String(i));
            }
        }
        removeArrayStack();
        return res;
    }
}
