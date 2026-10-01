import { IDisposable } from "../disposable/IDisposable";
import { DisposableStore } from "../disposable/DisposableStore";

export type Event<T> = (listener: (value: T) => unknown, thisArgs?: any, disposables?: IDisposable[] | DisposableStore) => IDisposable;
