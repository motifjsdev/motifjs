import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, getRaw, hasOwn, isNumericKey, isReadonly, removeArrayStack } from "../common";
import { trigger } from "../reactivity-core";


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

        const res = Reflect.set(target, p, newValue, receiver);

        if (engine.onValueChanged) {
            try { engine.onValueChanged({ raw: target, proxy: receiver }, p); } catch { }
        }

        if (getRaw(target) !== getRaw(receiver)) {
            return res;
        }
        if (!isArray && hadKey && Object.is(newValue, oldValue)) {
            return res;
        }

        trigger(target, p);
        if (!isArray && !hadKey) {
            trigger(target, ITERATE_KEY);
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
