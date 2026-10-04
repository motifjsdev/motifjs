import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, getRaw, hasOwn } from "../common";
import { track, trigger } from "../reactivity-core";
import { NOT_META, readMeta } from "./getter";

type AnyCollection = Map<any, any> | Set<any>;

function changed(target: object, key: unknown) {
    trigger(target, key as any);
    trigger(target, ITERATE_KEY);
}

const collectionMethods: Record<string, Function> = {
    get(this: Map<any, any>, key: unknown) {
        const target = getRaw(this);
        track(target, key as any);
        return target.get(key);
    },
    has(this: AnyCollection, key: unknown) {
        const target = getRaw(this);
        track(target, key as any);
        return target.has(key);
    },
    set(this: Map<any, any>, key: unknown, value: unknown) {
        const target = getRaw(this);
        const existed = target.has(key);
        const previous = target.get(key);
        target.set(key, value);
        if (!existed || !Object.is(previous, value)) changed(target, key);
        return this;
    },
    delete(this: AnyCollection, key: unknown) {
        const target = getRaw(this);
        const removed = target.delete(key);
        if (removed) changed(target, key);
        return removed;
    },
    clear(this: AnyCollection) {
        const target = getRaw(this);
        if (target.size === 0) return;
        const keys = Array.from(target.keys());
        target.clear();
        for (const key of keys) trigger(target, key);
        trigger(target, ITERATE_KEY);
    },
};

export function createCollectionHandler(engine: ReactiveEngine): ProxyHandler<AnyCollection> {
    return {
        get(target, key, receiver) {
            const meta = readMeta(engine, target, key, receiver);
            if (meta !== NOT_META) return meta;
            if (key === 'size') {
                track(target, ITERATE_KEY);
                return target.size;
            }
            if (typeof key === 'string' && hasOwn(collectionMethods, key) && key in target) {
                return collectionMethods[key];
            }
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    };
}
