

export const enum Flags {
    SKIP = '[__skip__]',
    IS_REACTIVE = '[__isReactive__]',
    IS_READONLY = '[__isReadonly__]',
    IS_SUPERFICIAL = '[__issuperficial__]',
    RAW = '[__raw__]',
    CONTEXT = 'context',
    GET_SETUP = '[__get_setup__]'
}

export const enum TargetType {
    SYSTEM = 0,
    INVALID = SYSTEM,
    COMMON = 0b01,
    COLLECTION = 0b10
}

export const ITERATE_KEY = Symbol('')
export let followTracking: boolean = true;
export let arrayScope: { enabled: boolean, key: string } = { enabled: false, key: '' };


export function getRaw<T>(value: T): T {
    let current = value;
    while (current && (current as any)[Flags.RAW]) {
        current = (current as any)[Flags.RAW];
    }
    return current;
}

export function isReadonly(candidate: unknown): boolean {
    if (candidate == null) return false;
    return Boolean((candidate as any)[Flags.IS_READONLY]);
}

export function hasOwn(target: object, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(target, key);
}

export function isObject(value: unknown): value is Record<any, any> {
    return typeof value === 'object' && value !== null;
}

const intrinsicSymbols: ReadonlySet<symbol> = new Set(
    Object.values(Object.getOwnPropertyDescriptors(Symbol))
        .map(descriptor => descriptor.value)
        .filter((value): value is symbol => typeof value === 'symbol')
);

export function isIntrinsicSymbol(key: unknown): boolean {
    return typeof key === 'symbol' && intrinsicSymbols.has(key);
}

const proxyableTags = new Map<string, TargetType>([
    ['[object Object]', TargetType.COMMON],
    ['[object Array]', TargetType.COMMON],
    ['[object Map]', TargetType.COLLECTION],
    ['[object Set]', TargetType.COLLECTION],
    ['[object WeakMap]', TargetType.COLLECTION],
    ['[object WeakSet]', TargetType.COLLECTION],
]);

export function getTargetType(value: any): TargetType {
    var proto = Object.getPrototypeOf(value);
    var cname = "";
    if (proto && proto.constructor) {
        cname = proto.constructor.name;
    }
    if ((cname === "Control" || cname == "RouteManager" || cname == "ServiceManager")) {
        return TargetType.SYSTEM;
    }
    if (!Object.isExtensible(value)) {
        return TargetType.INVALID;
    }
    return proxyableTags.get(Object.prototype.toString.call(value)) ?? TargetType.INVALID;
}

const canonicalIndex = /^(?:0|[1-9]\d*)$/;
export const isNumericKey = (key: unknown): boolean =>
    typeof key === 'string' && canonicalIndex.test(key) && String(Number(key)) === key;


const savedTracking: boolean[] = [];
let trackingDepth = 0;

function enterTracking(enabled: boolean) {
    savedTracking[trackingDepth++] = followTracking;
    followTracking = enabled;
}

export function pauseTracking() {
    enterTracking(false);
}

export function enableTracking() {
    enterTracking(true);
}

export function resetTracking() {
    followTracking = trackingDepth > 0 ? savedTracking[--trackingDepth] : true;
}

const arrayStack: { enabled: boolean, key: string }[] = []


export function addArrayStack(key: any) {
    arrayStack.push(arrayScope)
    arrayScope.enabled = true;
    arrayScope.key = key;
}
export function removeArrayStack() {
    const last = arrayStack.pop();
    if (arrayStack.length > 0) {
        arrayScope = last === undefined ? { enabled: false, key: '' } : last;
    } else {
        arrayScope = { enabled: false, key: '' }
    }

}


declare const opaqueBrand: unique symbol
declare const shallowBrand: unique symbol

type OpaqueState = Function | Map<any, any> | Set<any> | WeakMap<any, any> | WeakSet<any> | string | number | boolean | { [opaqueBrand]?: true }

type DeepState<T> = T extends OpaqueState ? T
    : T extends Array<any> ? { [Index in keyof T]: DeepState<T[Index]> }
    : T extends object & { [shallowBrand]?: never } ? { [Key in keyof T]: Key extends symbol ? T[Key] : DeepState<T[Key]> }
    : T

interface BoxedPrimitive<T> { value: T }

export type UnwrapValueRefs<T> = T extends number | string | boolean ? BoxedPrimitive<T> : DeepState<T>;


export var setupListener: any;
export var setupActive = false;

export function listenSetup(key: any) {
    setupListener = key;
    setupActive = true;
}

export function closeSetup() {
    setupListener = null;
    setupActive = false;
}