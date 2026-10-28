
import { TargetType, UnwrapValueRefs, getRaw, getTargetType, isObject, pauseTracking, resetTracking, enableTracking } from "./common";
import { createGetter } from "./handlers/getter";
import { createSetter } from "./handlers/setter";
import { createDelete, createHas, createOwn } from "./handlers/orhers";
import { ArrayMethods } from "./handlers/ArrayMethods";
import { createCollectionHandler } from "./handlers/collections";
import { LinkedList } from "../common/LinkedList";
import { track, trigger, trackRange, triggerRange } from "./reactivity-core";
export const ReactiveEngineMapper = new WeakSet<ReactiveEngine>();

const AllreactiveMap: WeakMap<any, any> = new WeakMap();
function armgetter() { return AllreactiveMap; }


function cloneDeep(item: any, seen: WeakMap<object, any>): any {
    if (item === null || typeof item !== 'object') return item;
    const source: any = getRaw(item);
    if (seen.has(source)) return seen.get(source);
    if (source instanceof Number || source instanceof String || source instanceof Boolean) return source.valueOf();
    if (source instanceof Date) {
        const copy = new Date(source.getTime());
        seen.set(source, copy);
        return copy;
    }
    if (source instanceof RegExp) {
        const copy = new RegExp(source.source, source.flags);
        copy.lastIndex = source.lastIndex;
        seen.set(source, copy);
        return copy;
    }
    if (source instanceof WeakMap || source instanceof WeakSet) return source;
    if (typeof source.nodeType === 'number' && typeof source.cloneNode === 'function') {
        const copy = source.cloneNode(true);
        seen.set(source, copy);
        return copy;
    }
    if (source instanceof Map) {
        const copy = new Map();
        seen.set(source, copy);
        source.forEach((value: any, key: any) => copy.set(cloneDeep(key, seen), cloneDeep(value, seen)));
        return copy;
    }
    if (source instanceof Set) {
        const copy = new Set();
        seen.set(source, copy);
        source.forEach((value: any) => copy.add(cloneDeep(value, seen)));
        return copy;
    }
    if (Array.isArray(source)) {
        const copy: any[] = [];
        seen.set(source, copy);
        for (let i = 0; i < source.length; i++) copy[i] = cloneDeep(source[i], seen);
        return copy;
    }
    const copy = Object.create(Object.getPrototypeOf(source));
    seen.set(source, copy);
    for (const key of Object.keys(source)) copy[key] = cloneDeep(source[key], seen);
    return copy;
}

export class ReactiveEngine {
    _gci: any;
    public startGc(_intervalMs: number = 10000) { /* no-op */ }
    public stopGc() { if (this._gci) { try { clearInterval(this._gci); } catch { } this._gci = undefined; } }
    constructor() {
        ReactiveEngineMapper.add(this);
        this.startGc();
    }
 
    DisposeMapper = new LinkedList();
    arrayTriggerCache = new Map<any, { method: string, key: any, value: any }>();
    ReactiveMap: () => WeakMap<any, any> = () => armgetter();
    activeCallback: any;
    isReadonly: boolean = false;
    superficial: boolean = false;
    arrayMethods: ArrayMethods = new ArrayMethods(this);
    arrayHandler = {
        get: createGetter(this),
        set: createSetter(this),
        has: createHas(this),
        deleteProperty: createDelete(this),
        ownKeys: createOwn(this)
    }
    deepHandler = {
        get: createGetter(this),
        set: createSetter(this),
        has: createHas(this),
        deleteProperty: createDelete(this),
        ownKeys: createOwn(this)
    } as ProxyHandler<any>
    collectionHandler = createCollectionHandler(this) as ProxyHandler<any>
    reactive<T>(model: T): UnwrapValueRefs<T> {

        var self = this;
        if (!isObject(model)) {
            model = { value: model } as any;
        }
        const targetType = getTargetType(model);
        if (targetType === TargetType.SYSTEM) {
            return model as any
        }

        let existingProxy = AllreactiveMap.get(model)
        if (existingProxy) {
            return existingProxy as any
        }
        existingProxy = AllreactiveMap.get(getRaw(model))
        if (existingProxy) {
            return existingProxy as any
        }
        // if (targetType === TargetType.INVALID) {
        if (targetType === TargetType.COLLECTION) {
            var proxy = new Proxy(model, this.collectionHandler);
            AllreactiveMap.set(model, proxy);
            return proxy;
        } else if (Array.isArray(model)) {
            var proxy = new Proxy(model, this.arrayHandler);
            // var original = Object.getPrototypeOf(proxy);
            // original["copy"] = () => { return model; }
            //     return "copied";
            AllreactiveMap.set(model, proxy);
            // try { this.startGc(); } catch { }
            return proxy;
        } else {
            var proxy = new Proxy(model, this.deepHandler);
            AllreactiveMap.set(model, proxy);
            // try { this.startGc(); } catch { }
            return proxy;
        }
    }

    clearModel(model: any): void {
        if (model != null && model != undefined) {
            Object.keys(model).forEach((key) => {
                if (typeof model[key] === 'object') {
                    if (AllreactiveMap.has(model[key]) || AllreactiveMap.has(getRaw(model[key]))) {
                        this.clearModel(model[key])
                    }
                }
                AllreactiveMap.delete(getRaw(model[key]));
                AllreactiveMap.delete(model[key]);
            })
            AllreactiveMap.delete(getRaw(model));
            AllreactiveMap.delete(model);
        }
    }

    track(model: any, key: any) {
        track(model, key);
    }
    trackRange(model: any, maxIndex: number) {
        trackRange(model, maxIndex);
    }
    triggerRange(model: any, from: number) {
        triggerRange(model, from);
    }
    trigger(model: any, key: any, value: any) {
        trigger(model, key);
    }
    ArrayTrigger(target: any, key: any, ...args: any) {
        this.trigger(target, key, args);
    }
    onValueChanged?: (info: { raw: any, proxy: any }, key: any) => any;
    toRaw(item: any) {
        return JSON.parse(JSON.stringify(this.deepClone(item)));
    }
    deepClone(item: any) {
        return cloneDeep(item, new WeakMap());
    }
    pauseTracking() {
        pauseTracking();
    }
    enableTracking() {
        enableTracking();
    }
    resetTracking() {
        resetTracking();
    }
    dispose() {
        var cnt = true;
        this.stopGc();
        while (cnt == true) {
            if (this.DisposeMapper.size > 0) {
                const element = this.DisposeMapper.pop();
                //     if (ApplicationService.current?.Options?.onReactiveEffectRun) {
                AllreactiveMap.delete(element);
            } else {
                cnt = false
            }
        }
        this.DisposeMapper.clear();
        ReactiveEngineMapper.delete(this);
        // if (ApplicationService.current?.Options?.onReactiveEffectRun) {
    }

}