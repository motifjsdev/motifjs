import { ReactiveEngine } from "../ReactiveEngine";
import { getRaw, pauseTracking, resetTracking } from "../common";

type PatchKind = 'lookup' | 'order' | 'join' | 'structural';

const PATCHED_ARRAY_METHODS: ReadonlyArray<readonly [string, PatchKind]> = [
    ['includes', 'lookup'],
    ['indexOf', 'lookup'],
    ['lastIndexOf', 'lookup'],
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

export class ArrayMethods {
    constructor(public engine: ReactiveEngine) { }
    get: Record<string, Function> = this.createArrayMethods();

    createArrayMethods(): Record<string, Function> {
        const table: Record<string, Function> = {};
        for (const [name, kind] of PATCHED_ARRAY_METHODS) {
            table[name] = this.patch(name, kind);
        }
        return table;
    }

    private patch(name: string, kind: PatchKind): Function {
        const owner = this;
        switch (kind) {
            case 'lookup':
                return function (this: unknown[], ...needles: any[]) {
                    const source = getRaw(this) as any;
                    owner.engine.track(source, 'length');
                    const direct = source[name](...needles);
                    if (!isLookupMiss(direct)) return direct;
                    return source[name](...needles.map(needle => getRaw(needle)));
                };
            case 'order':
                return function (this: unknown[], ...args: any[]) {
                    const source = getRaw(this) as any;
                    const size = this.length;
                    for (let index = 0; index < size; index++) {
                        owner.engine.track(source, String(index));
                    }
                    const sorted = source[name].apply(this, args);
                    owner.engine.track(source, name);
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
                        return source[name].apply(this, args);
                    } finally {
                        resetTracking();
                    }
                };
        }
    }

}
