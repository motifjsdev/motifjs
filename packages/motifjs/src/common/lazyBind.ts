import { Flags } from "../store/common";

const RAW_KEY = Flags.RAW;

function isPrototypeObject(o: any): boolean {
    return Object.prototype.hasOwnProperty.call(o, 'constructor') && typeof o.constructor === 'function' && o.constructor.prototype === o;
}

function overridesBelow(instance: any, proto: any, name: string): boolean {
    let p = Object.getPrototypeOf(instance);
    while (p && p !== proto) {
        if (Object.prototype.hasOwnProperty.call(p, name)) return true;
        p = Object.getPrototypeOf(p);
    }
    return false;
}

export function lazyBindMethods(proto: any, names: readonly string[]): void {
    for (const name of names) {
        let fn = proto[name];
        if (typeof fn !== 'function') continue;
        Object.defineProperty(proto, name, {
            configurable: true,
            enumerable: false,
            get() {
                if (this === proto || isPrototypeObject(this)) return fn;
                const target = this[RAW_KEY] ?? this;
                const bound = fn.bind(target);
                if (!overridesBelow(target, proto, name)) {
                    try {
                        Object.defineProperty(target, name, { value: bound, writable: true, configurable: true, enumerable: true });
                    } catch { }
                }
                return bound;
            },
            set(value: unknown) {
                if (this === proto && typeof value === 'function') { fn = value; return; }
                Object.defineProperty(this, name, { value, writable: true, configurable: true, enumerable: true });
            },
        });
    }
}
