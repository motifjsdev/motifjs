import { motifError } from "./diagnostics";
export interface Group<TKey, TElement> {
    key: TKey;
    items: TElement[];
}

function compareKeys<TKey>(a: TKey, b: TKey): number {
    return a > b ? 1 : a < b ? -1 : 0;
}

export class Query<T> implements Iterable<T> {
    private readonly source: readonly T[];

    constructor(source: Iterable<T>) {
        this.source = Array.isArray(source) ? source : Array.from(source);
    }

    static from<T>(source: Iterable<T>): Query<T> {
        return new Query(source);
    }

    where(predicate: (item: T, index: number) => boolean): Query<T> {
        return new Query(this.source.filter(predicate));
    }

    select<TResult>(selector: (item: T, index: number) => TResult): Query<TResult> {
        return new Query(this.source.map(selector));
    }

    orderBy<TKey>(keySelector: (item: T) => TKey): Query<T> {
        return new Query([...this.source].sort((a, b) => compareKeys(keySelector(a), keySelector(b))));
    }

    orderByDescending<TKey>(keySelector: (item: T) => TKey): Query<T> {
        return new Query([...this.source].sort((a, b) => compareKeys(keySelector(b), keySelector(a))));
    }

    distinctBy<TKey>(keySelector: (item: T) => TKey): Query<T> {
        const seen = new Set<TKey>();
        return new Query(this.source.filter(item => {
            const key = keySelector(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }));
    }

    groupBy<TKey>(keySelector: (item: T) => TKey): Query<Group<TKey, T>> {
        const map = new Map<TKey, T[]>();
        for (const item of this.source) {
            const key = keySelector(item);
            const group = map.get(key);
            if (group) {
                group.push(item);
            } else {
                map.set(key, [item]);
            }
        }
        return new Query(Array.from(map, ([key, items]) => ({ key, items })));
    }

    first(): T {
        if (this.source.length === 0) {
            throw motifError('MJX601');
        }
        return this.source[0];
    }

    firstOrDefault(): T | undefined {
        return this.source[0];
    }

    any(predicate?: (item: T) => boolean): boolean {
        return predicate ? this.source.some(predicate) : this.source.length > 0;
    }

    all(predicate: (item: T) => boolean): boolean {
        return this.source.every(predicate);
    }

    aggregate<TResult>(seed: TResult, func: (acc: TResult, item: T) => TResult): TResult {
        return this.source.reduce(func, seed);
    }

    toArray(): T[] {
        return [...this.source];
    }

    [Symbol.iterator](): Iterator<T> {
        return this.source[Symbol.iterator]();
    }
}
