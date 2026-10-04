import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, getRaw, hasOwn } from "../common";
import { track, trigger } from "../reactivity-core";
import { NOT_META, readMeta } from "./getter";

type AnyCollection = Map<any, any> | Set<any>;

const KEYS_KEY = Symbol('');

function changed(target: object, key: unknown, keysChanged: boolean) {
    trigger(target, key as any);
    trigger(target, ITERATE_KEY);
    if (keysChanged) trigger(target, KEYS_KEY);
}

const collectionMethods: Record<PropertyKey, Function> = {
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
        if (!existed) changed(target, key, true);
        else if (!Object.is(previous, value)) changed(target, key, false);
        return this;
    },
    add(this: Set<any>, value: unknown) {
        const target = getRaw(this);
        if (!target.has(value)) {
            target.add(value);
            changed(target, value, true);
        }
        return this;
    },
    delete(this: AnyCollection, key: unknown) {
        const target = getRaw(this);
        const removed = target.delete(key);
        if (removed) changed(target, key, true);
        return removed;
    },
    clear(this: AnyCollection) {
        const target = getRaw(this);
        if (target.size === 0) return;
        const keys = Array.from(target.keys());
        target.clear();
        for (const key of keys) trigger(target, key);
        trigger(target, ITERATE_KEY);
        trigger(target, KEYS_KEY);
    },
    forEach(this: AnyCollection, callback: (value: any, key: any, collection: any) => void, thisArg?: unknown) {
        const target = getRaw(this);
        track(target, ITERATE_KEY);
        const owner = this;
        target.forEach((value: any, key: any) => callback.call(thisArg, value, key, owner));
    },
    keys(this: AnyCollection) {
        const target = getRaw(this);
        track(target, target instanceof Map ? KEYS_KEY : ITERATE_KEY);
        return target.keys();
    },
    values(this: AnyCollection) {
        const target = getRaw(this);
        track(target, ITERATE_KEY);
        return target.values();
    },
    entries(this: AnyCollection) {
        const target = getRaw(this);
        track(target, ITERATE_KEY);
        return target.entries();
    },
    [Symbol.iterator](this: AnyCollection) {
        const target = getRaw(this);
        track(target, ITERATE_KEY);
        return target[Symbol.iterator]();
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
            if ((typeof key === 'string' || key === Symbol.iterator) && hasOwn(collectionMethods, key) && key in target) {
                return collectionMethods[key as any];
            }
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    };
}
