import { ReactiveEngine } from "../ReactiveEngine"
import { Flags, addArrayStack, closeSetup, hasOwn, isIntrinsicSymbol, isObject, pauseTracking, resetTracking, setupActive } from "../common"
import { track } from "../reactivity-core"

const ARRAY_MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'reverse', 'sort'])

const NOT_META = Symbol('')
type MetaReader = (engine: ReactiveEngine, target: any, receiver: any) => unknown

const metaReaders = new Map<symbol, MetaReader>([
    [Flags.IS_REACTIVE, () => true],
    [Flags.IS_READONLY, engine => engine.isReadonly],
    [Flags.IS_SUPERFICIAL, engine => engine.superficial],
    [Flags.GET_SETUP, (_engine, target) => target],
    [Flags.RAW, (engine, target, receiver) => engine.ReactiveMap().get(target) === receiver ? target : NOT_META],
])

function readMeta(engine: ReactiveEngine, target: any, key: unknown, receiver: any): unknown {
    if (typeof key !== 'symbol') return NOT_META
    const reader = metaReaders.get(key)
    return reader === undefined ? NOT_META : reader(engine, target, receiver)
}

export function createGetter(engine: ReactiveEngine) {
    return function (target: any, p: any, receiver: any) {
        const meta = readMeta(engine, target, p, receiver)
        if (meta !== NOT_META) return meta

        if (Array.isArray(target) && !engine.isReadonly) {
            const patched = engine.arrayMethods.get
            if (hasOwn(patched, p)) {
                const method = patched[p]
                if (ARRAY_MUTATORS.has(p)) addArrayStack(p)
                else track(target, p)
                return method
            }
        }
        if (setupActive) {
            pauseTracking();
            engine.track(target, p);
            closeSetup();
            resetTracking();
        }

        const value = Reflect.get(target, p, receiver)
        if (p === '__proto__' || isIntrinsicSymbol(p)) return value

        if (!engine.isReadonly) track(target, p)
        if (engine.superficial || !isObject(value)) return value
        return engine.reactive(value)
    }
}
