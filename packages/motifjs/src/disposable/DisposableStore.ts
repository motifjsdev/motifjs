import { IDisposable } from "./IDisposable";
import { disposableCore } from "./DisposableCore";
import { MotifError, formatMotifMessage, motifError, reportWarning } from "../common/diagnostics";

export class DisposableStore implements IDisposable {

    private readonly _items = new Set<IDisposable>();
    private _closed = false;

    constructor() {
        disposableCore.notifyCreated(this);
    }

    get isDisposed(): boolean {
        return this._closed;
    }

    add<T extends IDisposable>(item: T): T {
        if (!item) {
            return item;
        }
        if ((item as unknown) === this) {
            throw motifError('MJX502');
        }
        disposableCore.notifyOwner(item, this);
        if (this._closed) {
            reportWarning('MJX504', [], new Error().stack);
        } else {
            this._items.add(item);
        }
        return item;
    }

    delete<T extends IDisposable>(item: T): void {
        if (!item) {
            return;
        }
        if ((item as unknown) === this) {
            throw motifError('MJX505');
        }
        this._items.delete(item);
        item.dispose();
    }

    detach<T extends IDisposable>(item: T): void {
        if (item && this._items.delete(item)) {
            disposableCore.notifyOwner(item, null);
        }
    }

    clear(): void {
        if (this._items.size === 0) {
            return;
        }
        const failures: unknown[] = [];
        for (const item of this._items) {
            try {
                item?.dispose();
            } catch (error) {
                failures.push(error);
            }
        }
        this._items.clear();
        if (failures.length === 1) {
            throw failures[0];
        }
        if (failures.length > 1) {
            throw new MotifError('MJX503', formatMotifMessage('MJX503'), { cause: new AggregateError(failures) });
        }
    }

    dispose(): void {
        if (this._closed) {
            return;
        }
        disposableCore.notifyDisposed(this);
        this._closed = true;
        this.clear();
    }
}
