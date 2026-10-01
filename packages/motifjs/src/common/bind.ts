export type Bind<T> = T | (() => T);

export function toGetter<T>(value: Bind<T>): () => T {
    return typeof value === 'function' ? (value as () => T) : () => value;
}

export function read<T>(value: Bind<T>): T {
    return typeof value === 'function' ? (value as () => T)() : value;
}
