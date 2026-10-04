
import { TargetType, UnwrapValueRefs, getRaw, getTargetType, isObject, pauseTracking, resetTracking, enableTracking } from "./common";
import { createGetter } from "./handlers/getter";
import { createSetter } from "./handlers/setter";
import { createDelete, createHas, createOwn } from "./handlers/orhers";
import { ArrayMethods } from "./handlers/ArrayMethods";
import { createCollectionHandler } from "./handlers/collections";
import { LinkedList } from "../common/LinkedList";
import { track, trigger } from "./reactivity-core";
export const ReactiveEngineMapper = new WeakSet<ReactiveEngine>();

const AllreactiveMap: WeakMap<any, any> = new WeakMap();
function armgetter() { return AllreactiveMap; }


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
        if (targetType === TargetType.SYSTEM || TargetType.INVALID) {
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
        var self = this;
        if (!item) { return item; }
        var types = [Number, String, Boolean],
            result;
        types.forEach(function (type) {
            if (item instanceof type) {
                result = type(item);
            }
        });

        if (typeof result == "undefined") {
            if (Object.prototype.toString.call(item) === "[object Array]") {
                result = [];
                item.forEach(function (child: any, index: any, array: any[]) {
                    result[index] = self.deepClone(child);
                });
            } else if (typeof item == "object") {
                if (item.nodeType && typeof item.cloneNode == "function") {
                    result = item.cloneNode(true);
                } else if (!item.prototype) {
                    if (item instanceof Date) {
                        result = new Date(item);
                    } else {
                        result = <any>{};
                        for (var i in item) {
                            result[i] = self.deepClone(item[i]);
                        }
                    }
                } else {
                    if (false && item.constructor) {
                        result = new item.constructor();
                    } else {
                        result = item;
                    }
                }
            } else {
                result = item;
            }
        }
        return result;
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