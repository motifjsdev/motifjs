import { ReactiveEngine } from "../ReactiveEngine";
import { ITERATE_KEY, arrayMutation, getRaw, isObject, pauseTracking, resetTracking } from "../common";
import { scanObserved } from "../scanMonitor";
import { watching, wrote } from "../../devtools/changes";

type PatchKind = 'lookup' | 'scan' | 'fold' | 'read' | 'iterate' | 'order' | 'join' | 'structural';

const SCAN_LOOKUPS = new Set<string | symbol>(['find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every']);
const PREFIX_SCANS = new Set<string | symbol>(['find', 'findIndex', 'some', 'every']);
const stoppedEarly = (name: string | symbol, result: unknown) => name === 'find' ? result !== undefined : name === 'findIndex' ? result !== -1 : name === 'some' ? result === true : result === false;

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

type ArrayChange = { index: number; removed: unknown[]; added: unknown[] };

// dizinin kendi kuralıyla: eksi başlangıç sondan sayılır, sayı verilmezse sona kadar silinir
function arrayChange(source: unknown[], method: string, args: unknown[]): ArrayChange | null {
    const length = source.length;
    switch (method) {
        case 'push': return { index: length, removed: [], added: args };
        case 'unshift': return { index: 0, removed: [], added: args };
        case 'pop': return length === 0 ? null : { index: length - 1, removed: [source[length - 1]], added: [] };
        case 'shift': return length === 0 ? null : { index: 0, removed: [source[0]], added: [] };
        case 'splice': {
            if (args.length === 0) return null;
            const start = Math.trunc(Number(args[0])) || 0;
            const index = start < 0 ? Math.max(length + start, 0) : Math.min(start, length);
            const count = args.length === 1 ? length - index : Math.min(Math.max(Math.trunc(Number(args[1])) || 0, 0), length - index);
            return { index, removed: source.slice(index, index + count), added: args.slice(2) };
        }
        default: return { index: 0, removed: source.slice(), added: [] };
    }
}

function changeStart(source: unknown[], method: string, args: unknown[]): number {
    const length = source.length;
    if (method === 'push') return length;
    if (method === 'pop') return Math.max(length - 1, 0);
    if (method !== 'splice') return 0;
    if (args.length === 0) return length;
    const start = Math.trunc(Number(args[0])) || 0;
    return start < 0 ? Math.max(length + start, 0) : Math.min(start, length);
}

function rawItems(method: string, args: unknown[]): unknown[] {
    const from = method === 'splice' ? 2 : method === 'push' || method === 'unshift' ? 0 : args.length;
    if (from >= args.length) return args;
    const items = args.slice();
    for (let i = from; i < items.length; i++) {
        const item = items[i];
        if (isObject(item)) items[i] = getRaw(item);
    }
    return items;
}

function reportArrayChange(source: unknown[], method: string, change: ArrayChange): void {
    if (method === 'sort' || method === 'reverse') {
        if (change.removed.every((item, i) => Object.is(item, source[i]))) return;
        change.added = source.slice();
    }
    if (change.removed.length === 0 && change.added.length === 0) return;
    wrote({ target: source, kind: 'splice', method, index: change.index, removed: change.removed, added: change.added });
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
        /* @DEV-ONLY */ const change = watching() ? arrayChange(source, String(name), args) : null;
        const previous = arrayMutation.target;
        const previousFrom = arrayMutation.from;
        arrayMutation.target = source;
        arrayMutation.from = Infinity;
        try {
            const result = source[name as any].apply(proxy, args);
            /* @DEV-ONLY */ if (change !== null) reportArrayChange(source, String(name), change);
            return result;
        } finally {
            const from = arrayMutation.from;
            arrayMutation.target = previous;
            arrayMutation.from = previousFrom;
            this.engine.trigger(source, ITERATE_KEY, undefined);
            if (from !== Infinity) this.engine.triggerRange(source, from);
        }
    }

    private mutateRaw(source: any[], proxy: unknown, name: string | symbol, args: unknown[]) {
        const method = (Array.prototype as any)[name];
        if (typeof name !== 'string' || source[name as any] !== method) return this.mutate(source, proxy, name, args);
        /* @DEV-ONLY */ const change = watching() ? arrayChange(source, name, args) : null;
        const oldLength = source.length;
        const start = changeStart(source, name, args);
        const before = name === 'push' || name === 'pop' ? null : source.slice(start);
        let input = rawItems(name, args);
        if (name === 'sort' && typeof args[0] === 'function') {
            const compare = args[0] as (a: unknown, b: unknown) => number;
            input = [(a: unknown, b: unknown) => compare(this.wrap(a), this.wrap(b))];
        }
        const previous = arrayMutation.target;
        const previousFrom = arrayMutation.from;
        arrayMutation.target = source;
        arrayMutation.from = Infinity;
        let result: any;
        try {
            result = method.apply(source, input);
            /* @DEV-ONLY */ if (change !== null) reportArrayChange(source, name, change);
        } finally {
            const nested = arrayMutation.from;
            arrayMutation.target = previous;
            arrayMutation.from = previousFrom;
            const from = Math.min(nested, this.triggerChanges(source, start, before, oldLength));
            this.engine.trigger(source, ITERATE_KEY, undefined);
            if (from !== Infinity) this.engine.triggerRange(source, from);
        }
        if (name === 'shift' || name === 'pop') return this.wrap(result);
        if (name === 'splice') return (result as unknown[]).map(value => this.wrap(value));
        if (name === 'sort' || name === 'reverse') return proxy;
        return result;
    }

    private triggerChanges(source: any[], start: number, before: unknown[] | null, oldLength: number): number {
        const newLength = source.length;
        let from = Infinity;
        if (before === null) {
            const low = Math.min(oldLength, newLength);
            const high = Math.max(oldLength, newLength);
            for (let i = low; i < high; i++) this.engine.trigger(source, String(i), undefined);
            if (high > low) from = low;
        } else {
            const end = Math.max(oldLength, newLength);
            for (let i = start; i < end; i++) {
                const k = i - start;
                const was = i < oldLength ? before[k] : undefined;
                const now = i < newLength ? source[i] : undefined;
                if (Object.is(was, now) && (was !== undefined || (i < oldLength && k in before) === (i < newLength && i in source))) continue;
                this.engine.trigger(source, String(i), undefined);
                if (from === Infinity) from = i;
            }
        }
        if (newLength !== oldLength) {
            this.engine.trigger(source, 'length', undefined);
            from = Math.min(from, newLength);
        }
        return from;
    }

    private patch(name: string | symbol, kind: PatchKind): Function {
        const owner = this;
        switch (kind) {
            case 'lookup':
                return function (this: unknown[], ...needles: any[]) {
                    const source = getRaw(this) as any;
                    const direct = source[name](...needles);
                    const outcome = isLookupMiss(direct) ? source[name](...needles.map(needle => getRaw(needle))) : direct;
                    let at = -1;
                    if (name === 'indexOf') at = outcome;
                    else if (name === 'includes' && outcome === true) { at = source.indexOf(needles[0], needles[1]); if (at < 0) at = source.indexOf(getRaw(needles[0]), needles[1]); }
                    if (at >= 0) owner.engine.trackRange(source, at);
                    else owner.engine.track(source, ITERATE_KEY);
                    return outcome;
                };
            case 'scan':
                return function (this: unknown[], callback: Function, thisArg?: unknown) {
                    const source = getRaw(this) as any;
                    /* @DEV-ONLY */ if (SCAN_LOOKUPS.has(name)) scanObserved(source, name as string);
                    const proxy = this;
                    let last = -1;
                    let completed = false;
                    let result: any;
                    try {
                        result = source[name]((value: unknown, index: number) => { last = index; return callback.call(thisArg, owner.wrap(value), index, proxy); });
                        completed = true;
                    } finally {
                        if (completed && last >= 0 && PREFIX_SCANS.has(name) && stoppedEarly(name, result)) owner.engine.trackRange(source, last);
                        else owner.engine.track(source, ITERATE_KEY);
                    }
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
                    const sorted = owner.mutateRaw(source, this, name, args);
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
                        return owner.mutateRaw(source, this, name, args);
                    } finally {
                        resetTracking();
                    }
                };
        }
    }

}
