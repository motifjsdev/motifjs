import { motifError, reportWarning } from "../common/diagnostics";
import { IDisposable } from "./IDisposable";
import { disposableCore } from "./DisposableCore";
import { DisposableStore } from "./DisposableStore";

let closedStore: DisposableStore | undefined;

function sharedClosedStore(): DisposableStore {
    if (closedStore === undefined) {
        closedStore = new DisposableStore();
        closedStore.dispose();
    }
    return closedStore;
}

export abstract class Disposable implements IDisposable {

    private _store?: DisposableStore | null = undefined;

    protected get _disposables(): DisposableStore {
        let store = this._store;
        if (store === undefined) {
            store = this._store = new DisposableStore();
            disposableCore.notifyOwner(store, this);
        }
        return store as DisposableStore;
    }

    constructor() {
        disposableCore.notifyCreated(this);
    }

    public dispose(): void {
        const owned = this._store;
        if (owned === null) {
            reportWarning('MJX501', [], { disposable: this });
            return;
        }
        if (owned !== undefined && owned.isDisposed) return;
        disposableCore.notifyDisposed(this);
        if (owned === undefined) {
            this._store = sharedClosedStore();
        } else {
            owned.dispose();
        }
    }

    protected _register<T extends IDisposable>(item: T): T {
        if ((item as unknown) === this) {
            throw motifError('MJX502');
        }
        return this._disposables.add(item);
    }
}
