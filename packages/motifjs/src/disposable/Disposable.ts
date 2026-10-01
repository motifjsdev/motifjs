import { motifError, reportWarning } from "../common/diagnostics";
import { IDisposable } from "./IDisposable";
import { disposableCore } from "./DisposableCore";
import { DisposableStore } from "./DisposableStore";

export abstract class Disposable implements IDisposable {

    protected readonly _disposables = new DisposableStore();

    constructor() {
        disposableCore.notifyCreated(this);
        disposableCore.notifyOwner(this._disposables, this);
    }

    public dispose(): void {
        disposableCore.notifyDisposed(this);
        const owned = this._disposables;
        if (owned && typeof owned.dispose === 'function') {
            owned.dispose();
        } else {
            reportWarning('MJX501', [], { disposable: this });
        }
    }

    protected _register<T extends IDisposable>(item: T): T {
        if ((item as unknown) === this) {
            throw motifError('MJX502');
        }
        return this._disposables.add(item);
    }
}
