import { IDisposable } from "./IDisposable";
import { disposableCore } from "./DisposableCore";

class QuietCleanup implements IDisposable {
    constructor(private _fn: (() => void) | undefined) { }

    dispose(): void {
        const fn = this._fn;
        if (fn === undefined) return;
        this._fn = undefined;
        try { fn(); } catch { }
    }
}

class TrackedCleanup implements IDisposable {
    constructor(private _fn: (() => void) | undefined) {
        disposableCore.notifyCreated(this);
    }

    dispose(): void {
        const fn = this._fn;
        if (fn === undefined) return;
        this._fn = undefined;
        disposableCore.notifyDisposed(this);
        fn();
    }
}

const coreToDisposable = disposableCore.toDisposable;

export function quietCleanup(fn: () => void): IDisposable {
    return new QuietCleanup(fn);
}

export function trackedCleanup(fn: () => void): IDisposable {
    return disposableCore.toDisposable === coreToDisposable ? new TrackedCleanup(fn) : disposableCore.toDisposable(fn);
}
