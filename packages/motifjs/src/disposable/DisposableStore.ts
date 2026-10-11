import { IDisposable } from "./IDisposable";
import { disposableCore } from "./DisposableCore";
import { MotifError, formatMotifMessage, motifError, reportWarning } from "../common/diagnostics";

export class DisposableStore implements IDisposable {

    private _items?: Set<IDisposable>;
    private _one?: IDisposable;
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
        } else if (this._items !== undefined) {
            this._items.add(item);
        } else if (this._one === undefined) {
            this._one = item;
        } else if (this._one !== item) {
            this._items = new Set([this._one, item]);
            this._one = undefined;
        }
        return item;
    }

    private _take(item: IDisposable): boolean {
        if (this._items !== undefined) return this._items.delete(item);
        if (this._one === item) { this._one = undefined; return true; }
        return false;
    }

    delete<T extends IDisposable>(item: T): void {
        if (!item) {
            return;
        }
        if ((item as unknown) === this) {
            throw motifError('MJX505');
        }
        this._take(item);
        item.dispose();
    }

    detach<T extends IDisposable>(item: T): void {
        if (item && this._take(item)) {
            disposableCore.notifyOwner(item, null);
        }
    }

    clear(): void {
        if (this._one === undefined && (this._items === undefined || this._items.size === 0)) {
            return;
        }
        const failures: unknown[] = [];
        let done: IDisposable | undefined;
        for (;;) {
            const items = this._items;
            if (items !== undefined) {
                for (const item of items) {
                    if (item === done) continue;
                    try {
                        item?.dispose();
                    } catch (error) {
                        failures.push(error);
                    }
                }
                items.clear();
                break;
            }
            const one = this._one;
            if (one === undefined || one === done) break;
            done = one;
            try {
                one.dispose();
            } catch (error) {
                failures.push(error);
            }
        }
        this._one = undefined;
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
