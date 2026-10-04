import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, getRaw, hasOwn, isObject } from "../common";
import { track, trigger } from "../reactivity-core";
import { NOT_META, readMeta } from "./getter";

type AnyCollection = Map<any, any> | Set<any>;

const KEYS_KEY = Symbol('');

function changed(target: object, key: unknown, keysChanged: boolean) {
    trigger(target, key as any);
    trigger(target, ITERATE_KEY);
    if (keysChanged) trigger(target, KEYS_KEY);
}

function lookupKey(target: AnyCollection, key: unknown) {
    return target.has(key) ? key : getRaw(key);
}

function wrapIterator(source: Iterator<any>, convert: (item: any) => any): IterableIterator<any> {
    return {
        next() {
            const step = source.next();
            return step.done ? step : { value: convert(step.value), done: false };
        },
        [Symbol.iterator]() {
            return this;
        },
    };
}

function createCollectionMethods(engine: ReactiveEngine): Record<PropertyKey, Function> {
    const wrap = (value: unknown) => isObject(value) ? engine.reactive(value) : value;
    const wrapEntry = (target: AnyCollection) =>
        target instanceof Map
            ? ([key, value]: [unknown, unknown]) => [key, wrap(value)]
            : ([value]: [unknown, unknown]) => { const item = wrap(value); return [item, item]; };

    return {
        get(this: Map<any, any>, key: unknown) {
            const target = getRaw(this);
            const found = lookupKey(target, key);
            track(target, found as any);
            return wrap(target.get(found));
        },
        has(this: AnyCollection, key: unknown) {
            const target = getRaw(this);
            const found = lookupKey(target, key);
            track(target, found as any);
            return target.has(found);
        },
        set(this: Map<any, any>, key: unknown, value: unknown) {
            const target = getRaw(this);
            const stored = lookupKey(target, key);
            const raw = getRaw(value);
            const existed = target.has(stored);
            const previous = target.get(stored);
            target.set(stored, raw);
            if (!existed) changed(target, stored, true);
            else if (!Object.is(previous, raw)) changed(target, stored, false);
            return this;
        },
        add(this: Set<any>, value: unknown) {
            const target = getRaw(this);
            const stored = lookupKey(target, value);
            if (!target.has(stored)) {
                target.add(stored);
                changed(target, stored, true);
            }
            return this;
        },
        delete(this: AnyCollection, key: unknown) {
            const target = getRaw(this);
            const found = lookupKey(target, key);
            const removed = target.delete(found);
            if (removed) changed(target, found, true);
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
            const isMap = target instanceof Map;
            target.forEach((value: any, key: any) => {
                const item = wrap(value);
                callback.call(thisArg, item, isMap ? key : item, owner);
            });
        },
        keys(this: AnyCollection) {
            const target = getRaw(this);
            if (target instanceof Map) {
                track(target, KEYS_KEY);
                return target.keys();
            }
            track(target, ITERATE_KEY);
            return wrapIterator(target.keys(), wrap);
        },
        values(this: AnyCollection) {
            const target = getRaw(this);
            track(target, ITERATE_KEY);
            return wrapIterator(target.values(), wrap);
        },
        entries(this: AnyCollection) {
            const target = getRaw(this);
            track(target, ITERATE_KEY);
            return wrapIterator(target.entries(), wrapEntry(target));
        },
        [Symbol.iterator](this: AnyCollection) {
            const target = getRaw(this);
            track(target, ITERATE_KEY);
            return target instanceof Map
                ? wrapIterator(target.entries(), wrapEntry(target))
                : wrapIterator(target.values(), wrap);
        },
    };
}

export function createCollectionHandler(engine: ReactiveEngine): ProxyHandler<AnyCollection> {
    const methods = createCollectionMethods(engine);
    return {
        get(target, key, receiver) {
            const meta = readMeta(engine, target, key, receiver);
            if (meta !== NOT_META) return meta;
            if (key === 'size') {
                track(target, ITERATE_KEY);
                return target.size;
            }
            if ((typeof key === 'string' || key === Symbol.iterator) && hasOwn(methods, key) && key in target) {
                return methods[key as any];
            }
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    };
}
