import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, arrayMutation, getRaw, isObject, pauseTracking, resetTracking } from "../common";

type PatchKind = 'lookup' | 'scan' | 'fold' | 'read' | 'iterate' | 'order' | 'join' | 'structural';

const PATCHED_ARRAY_METHODS: ReadonlyArray<readonly [string | symbol, PatchKind]> = [
    ['includes', 'lookup'],
    ['indexOf', 'lookup'],
    ['lastIndexOf', 'lookup'],
    ['find', 'scan'],
    ['findIndex', 'scan'],
    ['findLast', 'scan'],
    ['findLastIndex', 'scan'],
    ['some', 'scan'],
    ['every', 'scan'],
    ['filter', 'scan'],
    ['map', 'scan'],
    ['forEach', 'scan'],
    ['flatMap', 'scan'],
    ['reduce', 'fold'],
    ['reduceRight', 'fold'],
    ['join', 'read'],
    ['slice', 'read'],
    ['values', 'iterate'],
    ['entries', 'iterate'],
    ['keys', 'iterate'],
    [Symbol.iterator, 'iterate'],
    ['sort', 'order'],
    ['concat', 'join'],
    ['push', 'structural'],
    ['pop', 'structural'],
    ['shift', 'structural'],
    ['unshift', 'structural'],
    ['splice', 'structural'],
    ['reverse', 'structural'],
];

const isLookupMiss = (outcome: unknown) => outcome === false || outcome === -1;

function mapIterator<T, R>(source: Iterator<T>, convert: (value: T) => R): IterableIterator<R> {
    const iterator: IterableIterator<R> = {
        next() {
            const step = source.next();
            return step.done ? { value: undefined as unknown as R, done: true } : { value: convert(step.value), done: false };
        },
        [Symbol.iterator]() {
            return iterator;
        },
    };
    return iterator;
}

export class ArrayMethods {
    constructor(public engine: ReactiveEngine) { }
    get: Record<string | symbol, Function> = this.createArrayMethods();

    createArrayMethods(): Record<string | symbol, Function> {
        const table: Record<string | symbol, Function> = {};
        for (const [name, kind] of PATCHED_ARRAY_METHODS) {
            if (typeof (Array.prototype as any)[name] !== 'function') continue;
            table[name as any] = this.patch(name, kind);
        }
        return table;
    }

    private wrap(value: unknown): unknown {
        return this.engine.superficial || !isObject(value) ? value : this.engine.reactive(value);
    }

    private mutate(source: any[], proxy: unknown, name: string | symbol, args: unknown[]) {
        const previous = arrayMutation.target;
        arrayMutation.target = source;
        try {
            return source[name as any].apply(proxy, args);
        } finally {
            arrayMutation.target = previous;
            this.engine.trigger(source, ITERATE_KEY, undefined);
        }
    }

    private patch(name: string | symbol, kind: PatchKind): Function {
        const owner = this;
        switch (kind) {
            case 'lookup':
                return function (this: unknown[], ...needles: any[]) {
                    const source = getRaw(this) as any;
                    owner.engine.track(source, ITERATE_KEY);
                    const direct = source[name](...needles);
                    if (!isLookupMiss(direct)) return direct;
                    return source[name](...needles.map(needle => getRaw(needle)));
                };
            case 'scan':
                return function (this: unknown[], callback: Function, thisArg?: unknown) {
                    const source = getRaw(this) as any;
                    owner.engine.track(source, ITERATE_KEY);
                    const proxy = this;
                    const result = source[name]((value: unknown, index: number) => callback.call(thisArg, owner.wrap(value), index, proxy));
                    if (name === 'filter') return (result as unknown[]).map(value => owner.wrap(value));
                    if (name === 'find' || name === 'findLast') return owner.wrap(result);
                    return result;
                };
            case 'fold':
                return function (this: unknown[], callback: Function, ...rest: unknown[]) {
                    const source = getRaw(this) as any;
                    owner.engine.track(source, ITERATE_KEY);
                    const proxy = this;
                    const step = (accumulator: unknown, value: unknown, index: number) => callback(accumulator, owner.wrap(value), index, proxy);
                    if (rest.length > 0 || source.length === 0) return source[name](step, ...rest);
                    const forward = name === 'reduce';
                    const length = source.length;
                    let accumulator = owner.wrap(source[forward ? 0 : length - 1]);
                    if (forward) for (let index = 1; index < length; index++) accumulator = step(accumulator, source[index], index);
                    else for (let index = length - 2; index >= 0; index--) accumulator = step(accumulator, source[index], index);
                    return accumulator;
                };
            case 'read':
                return function (this: unknown[], ...args: unknown[]) {
                    const source = getRaw(this) as any;
                    owner.engine.track(source, ITERATE_KEY);
                    const result = source[name](...args);
                    return name === 'slice' ? (result as unknown[]).map(value => owner.wrap(value)) : result;
                };
            case 'iterate':
                return function (this: unknown[]) {
                    const source = getRaw(this) as any;
                    owner.engine.track(source, ITERATE_KEY);
                    if (name === 'keys') return source.keys();
                    if (name === 'entries') return mapIterator<[number, unknown], [number, unknown]>(source.entries(), ([index, value]) => [index, owner.wrap(value)]);
                    return mapIterator<unknown, unknown>(source.values(), value => owner.wrap(value));
                };
            case 'order':
                return function (this: unknown[], ...args: any[]) {
                    const source = getRaw(this) as any;
                    const size = this.length;
                    for (let index = 0; index < size; index++) {
                        owner.engine.track(source, String(index));
                    }
                    const sorted = owner.mutate(source, this, name, args);
                    owner.engine.track(source, name as any);
                    return sorted;
                };
            case 'join':
                return function (this: unknown[], ...args: any[]) {
                    return Array.prototype.concat.apply(this, args);
                };
            default:
                return function (this: unknown[], ...args: any[]) {
                    pauseTracking();
                    const source = getRaw(this) as any;
                    try {
                        return owner.mutate(source, this, name, args);
                    } finally {
                        resetTracking();
                    }
                };
        }
    }

}
