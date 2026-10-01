import { track, trigger, effect, createScheduledEffect, untracked, ScheduledEffect } from "../";
import { pauseTracking, resetTracking } from "./common";
const SIGNAL_TARGET = Symbol('SignalTarget');
const SIGNAL_KEY = Symbol('SignalKey');

export class Signal<T> {
    private _value: T;
    private readonly _target: object;
    private readonly _key: symbol;
    private readonly _equals: (a: T, b: T) => boolean;
    private _disposed = false;

    public static create<U>(initialValue: U, equals?: (a: U, b: U) => boolean): Signal<U> {
        return new Signal<U>(initialValue, equals);
    }

    constructor(initialValue: T, equals: (a: T, b: T) => boolean = Object.is) {
        this._value = initialValue;
        this._target = { [SIGNAL_TARGET]: true };
        this._key = SIGNAL_KEY;
        this._equals = equals;
    }

    get value(): T {
        if (!this._disposed) {
            track(this._target, this._key);
        }
        return this._value;
    }

    set value(newValue: T) {
        if (this._disposed) return;
        if (!this._equals(this._value as any, newValue as any)) {
            this._value = newValue;
            trigger(this._target, this._key);
        }
    }

    peek(): T {
        return this._value;
    }

    update(updater: (prev: T) => T): void {
        this.value = (updater(this._value));
    }

    mutate(mutator: (draft: T) => void): void {
        if (this._disposed) return;
        mutator(this._value);
        trigger(this._target, this._key);
    }

    notify(): void {
        if (this._disposed) return;
        trigger(this._target, this._key);
    }

    asReadonly(): ReadonlySignal<T> {
        const self = this;
        return {
            get value() { return self.value; },
            peek() { return self.peek(); },
            valueOf() { return self.valueOf(); },
            toString() { return self.toString(); }
        };
    }
 
    dispose(): void {
        this._disposed = true;
    }

    valueOf(): T {
        return this.value;
    }

    toString(): string {
        return String(this.value);
    }
}

export interface ReadonlySignal<T> {
    readonly value: T;
    peek(): T;
    valueOf(): T;
    toString(): string;
}


export class Computed<T> {
    private _value!: T;
    private _dirty: boolean = true;
    private _computing: boolean = false;
    private readonly _target: object;
    private readonly _key: symbol;
    private readonly _getter: () => T;
    private _cleanup?: () => void;

    constructor(getter: () => T) {
        this._getter = getter;
        this._target = { [SIGNAL_TARGET]: true };
        this._key = SIGNAL_KEY;

        this._cleanup = effect(() => {
            if (this._computing) return; 
            this._computing = true;
            try {
                const newVal = this._getter();
                const changed = this._dirty || !Object.is(this._value, newVal);
                this._value = newVal;
                this._dirty = false;
                if (changed) {
                    trigger(this._target, this._key);
                }
            } finally {
                this._computing = false;
            }
        });
    }

    get value(): T {
        track(this._target, this._key);

        if (this._dirty) { 
            this._computing = true;
            pauseTracking();
            try {
                this._value = this._getter();
                this._dirty = false;
            } finally {
                resetTracking();
                this._computing = false;
            }
        }
        return this._value;
    }

    peek(): T {
        if (this._dirty) {
            pauseTracking();
            try {
                this._value = this._getter();
                this._dirty = false;
            } finally {
                resetTracking();
            }
        }
        return this._value;
    }

    dispose(): void {
        if (this._cleanup) {
            this._cleanup();
            this._cleanup = undefined;
        }
    }

    valueOf(): T {
        return this.value;
    }

    toString(): string {
        return String(this.value);
    }
}


export class LazyComputed<T> {
    private _value!: T;
    private _dirty: boolean = true;
    private _disposed: boolean = false;
    private readonly _target: object;
    private readonly _key: symbol;
    private readonly _getter: () => T;
    private readonly _runner: ScheduledEffect;

    constructor(getter: () => T) {
        this._getter = getter;
        this._target = { [SIGNAL_TARGET]: true };
        this._key = SIGNAL_KEY;
        this._runner = createScheduledEffect(
            () => { this._value = this._getter(); },
            () => {
                if (this._dirty || this._disposed) return;
                this._dirty = true;
                trigger(this._target, this._key);
            }
        );
    }

    get value(): T {
        if (!this._disposed) {
            track(this._target, this._key);
        }
        this._refresh();
        return this._value;
    }

    peek(): T {
        this._refresh();
        return this._value;
    }

    get isDirty(): boolean {
        return this._dirty;
    }

    private _refresh(): void {
        if (!this._dirty) return;
        if (this._disposed) {
            this._value = untracked(this._getter);
        } else {
            this._runner.run();
        }
        this._dirty = false;
    }

    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._runner.stop();
    }

    valueOf(): T {
        return this.value;
    }

    toString(): string {
        return String(this.value);
    }
}
