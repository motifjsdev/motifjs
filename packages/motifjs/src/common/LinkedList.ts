interface Link<T> {
    value: T | undefined;
    before: Link<T>;
    after: Link<T>;
    linked: boolean;
}

function createRing<T>(): Link<T> {
    const ring = { value: undefined, linked: false } as Link<T>;
    ring.before = ring;
    ring.after = ring;
    return ring;
}

export class LinkedList<T> {

    private _ring: Link<T> = createRing<T>();
    private _count = 0;

    get size(): number {
        return this._count;
    }

    isEmpty(): boolean {
        return this._count === 0;
    }

    push(value: T): () => void {
        return this._link(value, this._ring.before);
    }

    unshift(value: T): () => void {
        return this._link(value, this._ring);
    }

    pop(): T | undefined {
        return this._take(this._ring.before);
    }

    shift(): T | undefined {
        return this._take(this._ring.after);
    }

    clear(): void {
        for (let link = this._ring.after; link !== this._ring; link = link.after) {
            link.linked = false;
        }
        this._ring = createRing<T>();
        this._count = 0;
    }

    *[Symbol.iterator](): Iterator<T> {
        const ring = this._ring;
        for (let link = ring.after; link !== ring; link = link.after) {
            yield link.value as T;
        }
    }

    private _link(value: T, previous: Link<T>): () => void {
        const link: Link<T> = { value, before: previous, after: previous.after, linked: true };
        previous.after.before = link;
        previous.after = link;
        this._count++;
        return () => this._unlink(link);
    }

    private _take(link: Link<T>): T | undefined {
        if (link === this._ring) {
            return undefined;
        }
        const value = link.value;
        this._unlink(link);
        return value;
    }

    private _unlink(link: Link<T>): void {
        if (!link.linked) {
            return;
        }
        link.linked = false;
        link.before.after = link.after;
        link.after.before = link.before;
        this._count--;
    }
}
