import { errorHandler } from "../common/ErrorHandler";
import { IDisposable } from "../disposable/IDisposable";
import { DisposableStore } from "../disposable/DisposableStore";
import { Event } from "./Event";

interface Subscription<T> {
    handler: (value: T) => unknown;
    active: boolean;
}

interface Delivery<T> {
    targets: Subscription<T>[];
    value: T;
    next: number;
}

export class Emitter<T> {

    private _subscriptions: Subscription<T>[] = [];
    private _delivery: Delivery<T> | undefined;
    private _subscribe: Event<T> | undefined;
    private _disposed = false;

    get event(): Event<T> {
        if (!this._subscribe) {
            this._subscribe = (listener, thisArgs, disposables) => {
                if (this._disposed) {
                    return { dispose() { } };
                }
                const subscription: Subscription<T> = {
                    handler: thisArgs ? listener.bind(thisArgs) : listener,
                    active: true
                };
                this._writable().push(subscription);
                const handle: IDisposable = { dispose: () => this._unsubscribe(subscription) };
                if (disposables instanceof DisposableStore) {
                    disposables.add(handle);
                } else if (Array.isArray(disposables)) {
                    disposables.push(handle);
                }
                return handle;
            };
        }
        return this._subscribe;
    }

    fire(value: T): void {
        this._resume();
        if (this._subscriptions.length === 0) {
            return;
        }
        this._delivery = { targets: this._subscriptions, value, next: 0 };
        this._resume();
    }

    dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        for (const subscription of this._subscriptions) {
            subscription.active = false;
        }
        this._subscriptions = [];
        this._delivery = undefined;
    }

    private _writable(): Subscription<T>[] {
        if (this._delivery && this._delivery.targets === this._subscriptions) {
            this._subscriptions = this._subscriptions.slice();
        }
        return this._subscriptions;
    }

    private _unsubscribe(subscription: Subscription<T>): void {
        if (!subscription.active) {
            return;
        }
        subscription.active = false;
        const list = this._writable();
        const index = list.indexOf(subscription);
        if (index !== -1) {
            list.splice(index, 1);
        }
    }

    private _resume(): void {
        const delivery = this._delivery;
        if (!delivery) {
            return;
        }
        while (delivery.next < delivery.targets.length) {
            const target = delivery.targets[delivery.next++];
            if (!target.active) {
                continue;
            }
            try {
                target.handler(delivery.value);
            } catch (error) {
                errorHandler.onUnexpectedError(error);
            }
        }
        if (this._delivery === delivery) {
            this._delivery = undefined;
        }
    }
}
