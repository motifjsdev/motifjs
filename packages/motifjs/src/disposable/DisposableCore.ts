import { IDisposable } from "./IDisposable";

export interface IDisposableTracker {
    trackDisposable(disposable: IDisposable): void;
    setParent(child: IDisposable, parent: IDisposable | null): void;
    markAsDisposed(disposable: IDisposable): void;
    markAsSingleton(disposable: IDisposable): void;
}

class DisposableCore {

    disposableTracker: IDisposableTracker | null = null;

    notifyCreated<T extends IDisposable>(target: T): T {
        this.disposableTracker?.trackDisposable(target);
        return target;
    }

    notifyDisposed(target: IDisposable): void {
        this.disposableTracker?.markAsDisposed(target);
    }

    notifyOwner(target: IDisposable, owner: IDisposable | null): void {
        this.disposableTracker?.setParent(target, owner);
    }

    toDisposable(fn: () => void): IDisposable {
        let pending = true;
        const handle: IDisposable = {
            dispose: () => {
                if (!pending) {
                    return;
                }
                pending = false;
                this.notifyDisposed(handle);
                fn();
            }
        };
        return this.notifyCreated(handle);
    }
}

export const disposableCore: DisposableCore = new DisposableCore();
