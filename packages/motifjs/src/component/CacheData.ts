import { ComponentBase } from "../";


const cacheDataValues = new WeakMap<any, any>();
const symbolsCache = <{ key: any, symbol: Symbol, stringKey: string }[]>[];

function setCache<T>(key: Symbol | string, data: T, owner: ComponentBase): T;
function setCache<T>(key: Symbol | string, data: T): T;
function setCache<T>(): T {
    var args = arguments;
    var key = args[0];
    var data = args[1];
    if (typeof key === 'string') {
        var exist = symbolsCache.find(t => t.stringKey === key);
        if (exist) {
            key = exist.symbol;
        } else {
            var stringKey = key;
            key = Symbol(key);
            symbolsCache.push({
                key: key,
                symbol: key,
                stringKey: stringKey
            })
        }
    }
    if (args.length > 2) {
        var c = args[2];
        if (c && c instanceof ComponentBase && !c.isDisposed) {
            c.motif.on('x:disposing', () => {
                clearCache(key);
            });
        }
    }
    if (!cacheDataValues.has(key)) {
        cacheDataValues.set(key, data);
    }
    return cacheDataValues.get(data);
};

function setReactiveCache<T>(key: Symbol | string, data: T, owner: ComponentBase) {

    if (typeof key === 'string') {
        var exist = symbolsCache.find(t => t.stringKey === key);
        if (exist) {
            key = exist.symbol;
        } else {
            var stringKey = key;
            key = Symbol(key);
            symbolsCache.push({
                key: key,
                symbol: key,
                stringKey: stringKey
            })
        }
    }

    if (owner && owner instanceof ComponentBase && !owner.isDisposed) {
        owner.motif.on('x:disposing', () => {
            clearCache(key);
        });
    }

    if (!cacheDataValues.has(key)) {
        cacheDataValues.set(key, data);
    }
    return cacheDataValues.get(data);
};

function getCache<T>(key: Symbol | string): T {
    if (typeof key === 'string') {
        var exist = symbolsCache.find(t => t.stringKey === key);
        if (exist) {
            key = exist.symbol;
        } else {
            return null as T;
        }
    }
    if (cacheDataValues.has(key)) {
        return cacheDataValues.get(key);
    }
    return null as T;
};

function hasCache<T>(key: Symbol | string): T {
    if (typeof key === 'string') {
        var exist = symbolsCache.find(t => t.stringKey === key);
        if (exist) {
            key = exist.symbol;
        } else {
            return null as T;
        }
    }
    if (cacheDataValues.has(key)) {
        return cacheDataValues.get(key);
    }
    return null as T;
};

function clearCache(key: Symbol | string) {
    if (typeof key === 'string') {
        var exist = symbolsCache.find(t => t.stringKey === key);
        if (exist) {
            key = exist.symbol;

        }
    }
    var ref = symbolsCache.find(t => t.key === key);
    ref && symbolsCache.splice(symbolsCache.indexOf(ref), 1);
    if (typeof key !== 'string') {
        if (cacheDataValues.has(key)) {
            cacheDataValues.delete(key);
        }
    }

};
export const cache = {
    set: setCache,
    setReactive: setReactiveCache,
    get: getCache,
    has: hasCache
}