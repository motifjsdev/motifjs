import { ServiceProvider } from "./ServiceProvider";
import { autoRegistry } from "./autoRegistry";
import { motifError, reportWarning } from "../common/diagnostics";

export type ServiceLifetime = 'transient' | 'singleton' | 'scoped';

export type ServiceImplementation<V> = V extends abstract new (...args: any[]) => any
    ? V
    : V extends (...args: any[]) => any
        ? 'Use { useValue: fn } or { useFactory: fn } to register a function'
        : V;

function isConstructor(fn: Function): boolean {
    try {
        Reflect.construct(String, [], fn);
        return true;
    } catch {
        return false;
    }
}

export interface ServiceDescriptor<T = any> {
    token: any;
    lifetime: ServiceLifetime;
    useClass?: new (...args: any[]) => T;
    useFactory?: (...args: any[]) => T | Promise<T>;
    useValue?: T;
    deps?: any[];
}

export class ServiceCollection {
    private descriptors: Map<any, ServiceDescriptor> = new Map();

    public reset(): void {
        this.descriptors.clear();
    }
    public addTransient<V>(token: any, impl: ServiceImplementation<V>): void {
        this._add(token, impl, 'transient');
    }
    public addSingleton<V>(token: any, impl: ServiceImplementation<V>): void {
        this._add(token, impl, 'singleton');
    }
    public addScoped<V>(token: any, impl: ServiceImplementation<V>): void {
        this._add(token, impl, 'scoped');
    }

    private _add(token: any, impl: any, lifetime: ServiceLifetime) {
        const desc: ServiceDescriptor = { token, lifetime };
        if (impl && typeof impl === 'object' && (impl.useClass || impl.useFactory || Object.prototype.hasOwnProperty.call(impl, 'useValue') || Array.isArray(impl.deps))) {
            desc.useClass = impl.useClass;
            desc.useFactory = impl.useFactory;
            desc.useValue = impl.useValue;
            desc.deps = Array.isArray(impl.deps) ? impl.deps : undefined;
            try {
                const sources = [
                    desc.useClass ? 'useClass' : null,
                    desc.useFactory ? 'useFactory' : null,
                    (desc.useValue !== undefined) ? 'useValue' : null
                ].filter(Boolean);
                if ((sources as any).length > 1) {
                    reportWarning('MJX410', [this._tokenName(token), sources.join(', ')], { token });
                }
                if (impl.deps && !Array.isArray(impl.deps)) {
                    reportWarning('MJX411', [this._tokenName(token)], { token });
                }
            } catch { /* no-op */ }
            if (desc.useValue && typeof (desc.useValue as any).then === 'function') {
                const p = desc.useValue as any;
                desc.useFactory = async () => await p;
                desc.useValue = undefined;
            }
        } else if (typeof impl === 'function') {
            if (!isConstructor(impl)) throw motifError('MJX413', this._tokenName(token));
            desc.useClass = impl as any;
        } else {
            if (impl && typeof (impl as any).then === 'function') {
                const p = impl as any;
                desc.useFactory = async () => await p;
            } else {
                desc.useValue = impl;
            }
        }
        this.descriptors.set(token, desc);
    }

    private _tokenName(token: any): string {
        if (typeof token === 'string') return token;
        if (typeof token === 'symbol') return token.toString();
        if (typeof token === 'function') return token.name || '[AnonymousClass]';
        return String(token);
    }

    public getDescriptor(token: any): ServiceDescriptor | null {
        const existing = this.descriptors.get(token);
        if (existing) return existing;
        const meta = autoRegistry.get(token);
        if (meta) {
            this._add(token, {
                useClass: token,
                deps: meta.deps,
                useValue: undefined,
                useFactory: undefined
            }, meta.lifetime || 'transient');
            return this.descriptors.get(token) || null;
        }
        return null;
    }

    /** `@Injectable` ile işaretlenmiş ama henüz kaydedilmemiş bir token var mı? */
    public canAutoRegister(token: any): boolean {
        return !this.descriptors.has(token) && autoRegistry.has(token);
    }

    public getService(token: any): ServiceDescriptor | null {
        return this.getDescriptor(token);
    }

    public buildServiceProvider(): ServiceProvider {
        return new ServiceProvider(this);
    }


    public has(token: any): boolean {
        return this.descriptors.has(token);
    }


    public remove(token: any): boolean {
        return this.descriptors.delete(token);
    }


    public replace<V>(token: any, impl: ServiceImplementation<V>, lifetime?: ServiceLifetime): void {
        const existing = this.descriptors.get(token);
        const lt: ServiceLifetime = lifetime ?? (existing?.lifetime ?? 'transient');
        this._add(token, impl, lt);
    }


    public tryAddTransient<V>(token: any, impl: ServiceImplementation<V>): boolean {
        if (this.descriptors.has(token)) return false;
        this._add(token, impl, 'transient');
        return true;
    }
    public tryAddSingleton<V>(token: any, impl: ServiceImplementation<V>): boolean {
        if (this.descriptors.has(token)) return false;
        this._add(token, impl, 'singleton');
        return true;
    }
    public tryAddScoped<V>(token: any, impl: ServiceImplementation<V>): boolean {
        if (this.descriptors.has(token)) return false;
        this._add(token, impl, 'scoped');
        return true;
    }

    public autoRegisterInjectables() {
        for (const [target, meta] of autoRegistry.entries()) {
            if (this.descriptors.has(target)) continue;
            this._add(target, {
                useClass: target,
                deps: meta.deps,
                useValue: undefined,
                useFactory: undefined
            }, meta.lifetime || "transient");
        }
    }
}