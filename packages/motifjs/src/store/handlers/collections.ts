import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, getRaw, hasOwn, isObject } from "../common";
import { track, trigger } from "../reactivity-core";
import { NOT_META, readMeta } from "./getter";
import { watching, wrote } from "../../devtools/changes";
import { motifError } from "../../common/diagnostics";

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
            if (engine.isReadonly) throw motifError('MJX212', 'call set()');
            const target = getRaw(this);
            const stored = lookupKey(target, key);
            const raw = getRaw(value);
            const existed = target.has(stored);
            const previous = target.get(stored);
            target.set(stored, raw);
            /* @DEV-ONLY */ if ((!existed || !Object.is(previous, raw)) && watching()) wrote(existed ? { target, kind: 'update', key: stored, previous, value: raw } : { target, kind: 'add', key: stored, value: raw });
            if (!existed) changed(target, stored, true);
            else if (!Object.is(previous, raw)) changed(target, stored, false);
            return this;
        },
        add(this: Set<any>, value: unknown) {
            if (engine.isReadonly) throw motifError('MJX212', 'call add()');
            const target = getRaw(this);
            const stored = lookupKey(target, value);
            if (!target.has(stored)) {
                target.add(stored);
                /* @DEV-ONLY */ if (watching()) wrote({ target, kind: 'add', key: stored, value: stored });
                changed(target, stored, true);
            }
            return this;
        },
        delete(this: AnyCollection, key: unknown) {
            if (engine.isReadonly) throw motifError('MJX212', 'call delete()');
            const target = getRaw(this);
            const found = lookupKey(target, key);
            /* @DEV-ONLY */ const before = watching() ? { value: target instanceof Map ? target.get(found) : found } : null;
            const removed = target.delete(found);
            /* @DEV-ONLY */ if (removed && before !== null) wrote({ target, kind: 'delete', key: found, previous: before.value });
            if (removed) changed(target, found, true);
            return removed;
        },
        clear(this: AnyCollection) {
            if (engine.isReadonly) throw motifError('MJX212', 'call clear()');
            const target = getRaw(this);
            if (target.size === 0) return;
            const keys = Array.from(target.keys());
            /* @DEV-ONLY */ const before = watching() ? (target instanceof Map ? Array.from(target.entries()) : Array.from(target.values())) : null;
            target.clear();
            /* @DEV-ONLY */ if (before !== null) wrote({ target, kind: 'clear', removed: before });
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
