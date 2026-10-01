import { ServiceCollection, ServiceDescriptor } from "./ServiceCollection";
import { motifError } from "../common/diagnostics";
import { Signal } from "../store/Signal";

type ScopeKind = 'root' | 'navigation' | 'user';
type OwnerSlot = { owner: object | null; ownerless?: boolean };
type OwnerPin = { scope: ServiceProvider; live: boolean };
type NavigationState = { current: ServiceProvider; version: Signal<number>; scopes: Set<ServiceProvider> };

let activeResolver: ((token: any) => any) | null = null;
let activeSlot: OwnerSlot | null = null;
let rawScopedIn: ServiceProvider | null = null;
let constructionScope: ServiceProvider | null = null;
let navigatingRoot: ServiceProvider | null = null;

const slotsByOwner = new WeakMap<object, OwnerSlot>();
const handlesBySlot = new WeakMap<OwnerSlot, Map<any, any>>();
const pins = new WeakMap<object, OwnerPin>();
const builtIn = new WeakMap<object, ServiceProvider>();
const boundMethods = new WeakMap<object, Map<PropertyKey, { fn: Function; bound: Function }>>();

function runWithResolver<T>(resolver: (token: any) => any, create: () => T): T {
    const previous = activeResolver;
    activeResolver = resolver;
    try {
        return create();
    } finally {
        activeResolver = previous;
    }
}

function runWith<T>(slot: OwnerSlot | null, raw: ServiceProvider | null, create: () => T): T {
    const previousSlot = activeSlot;
    const previousRaw = rawScopedIn;
    activeSlot = slot;
    rawScopedIn = raw;
    try {
        return create();
    } finally {
        activeSlot = previousSlot;
        rawScopedIn = previousRaw;
    }
}

function bindTo(target: object, key: PropertyKey, fn: Function): Function {
    let cache = boundMethods.get(target);
    if (!cache) boundMethods.set(target, cache = new Map());
    const hit = cache.get(key);
    if (hit && hit.fn === fn) return hit.bound;
    const bound = fn.bind(target);
    cache.set(key, { fn, bound });
    return bound;
}

function pinnedScopeOf(owner: object | null): ServiceProvider | null {
    let current: any = owner;
    while (current) {
        const pin = pins.get(current);
        if (pin) return pin.scope;
        const built = builtIn.get(current);
        if (built && built._pending) return built;
        current = current.parent;
    }
    return null;
}

export function inject<T>(token: abstract new (...args: any[]) => T): T;
export function inject<T = any>(token: string | symbol | object): T;
export function inject(token: any): any {
    if (!activeResolver) throw motifError('MJX409', describeInjectToken(token));
    return activeResolver(token);
}

function describeInjectToken(token: any): string {
    if (typeof token === 'function') return token.name || '[AnonymousClass]';
    return String(token);
}

export function runInConstructionScope<T>(scope: ServiceProvider | undefined, create: () => T): T {
    const previous = constructionScope;
    constructionScope = scope ?? null;
    try {
        return create();
    } finally {
        constructionScope = previous;
    }
}

export function recordServiceOwner(owner: object): void {
    if (constructionScope && constructionScope._pending) builtIn.set(owner, constructionScope);
}

export function pinServiceOwner(owner: object): void {
    const root = navigatingRoot;
    if (!root) return;
    if (pins.get(owner)?.live) return;
    const target = pinnedScopeOf(owner) ?? root._currentScope();
    pins.set(owner, { scope: target, live: true });
    target._livePins++;
}

export function unpinServiceOwner(owner: object): void {
    const pin = pins.get(owner);
    if (!pin) return;
    pins.delete(owner);
    if (pin.live) pin.scope._releaseLivePin();
    navigatingRoot?._touch();
}

export function retireServiceOwner(owner: object): void {
    const pin = pins.get(owner);
    if (pin) {
        if (pin.live) {
            pin.live = false;
            pin.scope._releaseLivePin();
        }
        return;
    }
    if (!navigatingRoot || !slotsByOwner.has(owner)) return;
    pins.set(owner, { scope: pinnedScopeOf(owner) ?? navigatingRoot._currentScope(), live: false });
}

export class ServiceProvider {
    private parent?: ServiceProvider;
    private root: ServiceProvider;
    private scopeName?: string;
    private kind: ScopeKind;
    private singletonCache: Map<any, any>;
    private scopedCache: Map<any, any> = new Map();
    private transientSet: Set<any> = new Set();
    private _autoDisposeTransients = false;
    private pendingSingleton: Map<any, Promise<any>>;
    private pendingScoped: Map<any, Promise<any>> = new Map();
    private _navigation?: NavigationState;
    private _ownerlessSlot: OwnerSlot = { owner: null, ownerless: true };
    private _navigationDisposed = false;
    public _livePins = 0;
    public _pending = false;

    constructor(private services: ServiceCollection, parent?: ServiceProvider, root?: ServiceProvider) {
        this.parent = parent;
        this.root = root ?? this;
        this.kind = this.root === this ? 'root' : 'user';
        this.singletonCache = this.root === this ? new Map() : (this.root as any).singletonCache;
        this.pendingSingleton = this.root === this ? new Map() : (this.root as any).pendingSingleton;
    }

    public createScope(name?: string): ServiceProvider {
        const scoped = new ServiceProvider(this.services, this, this.root);
        scoped.scopeName = name ?? this.scopeName;
        (scoped as any)._autoDisposeTransients = this._autoDisposeTransients;
        return scoped;
    }

    public enableAutoDisposeTransients(enable = true): this { this._autoDisposeTransients = enable; return this; }


    public get<T = any>(token: any): T {
        const desc = this.services.getDescriptor(token);
        if (!desc) throw motifError('MJX401', this.describeToken(token));
        const value = this.resolveDescriptorSync(desc, [token]);
        return value as T;
    }

    public async getAsync<T = any>(token: any): Promise<T> {
        const desc = this.services.getDescriptor(token);
        if (!desc) throw motifError('MJX401', this.describeToken(token));
        const value = await this.resolveDescriptorAsync(desc, [token]);
        return value as T;
    }

    public _getFor<T = any>(owner: object, token: any): T {
        let slot = slotsByOwner.get(owner);
        if (!slot) {
            slot = { owner };
            slotsByOwner.set(owner, slot);
        }
        return runWith(slot, rawScopedIn, () => this.get<T>(token));
    }

    public getAllServices(): ServiceCollection { return this.services; }

    public _beginNavigation(): ServiceProvider {
        const root = this.root;
        const navigation = root._navigation ??= { current: root, version: new Signal(0), scopes: new Set() };
        navigatingRoot = root;
        const scope = new ServiceProvider(this.services, root, root);
        scope.kind = 'navigation';
        scope.scopeName = 'navigation';
        scope._pending = true;
        scope._autoDisposeTransients = root._autoDisposeTransients;
        navigation.scopes.add(scope);
        return scope;
    }

    public _commitNavigation(scope: ServiceProvider): void {
        const navigation = this.root._navigation;
        if (!navigation || navigation.current === scope) return;
        scope._pending = false;
        const previous = navigation.current;
        navigation.current = scope;
        this._touch();
        if (previous !== this.root) previous._releaseIfUnused();
    }

    public _abandonNavigation(scope: ServiceProvider): void {
        scope._pending = false;
        scope._releaseIfUnused();
    }

    public _currentScope(): ServiceProvider {
        return this.root._navigation?.current ?? this.root;
    }

    public _touch(): void {
        const navigation = this.root._navigation;
        if (navigation) navigation.version.value = navigation.version.peek() + 1;
    }

    public _releaseLivePin(): void {
        this._livePins--;
        this._releaseIfUnused();
    }

    private _releaseIfUnused(): void {
        const navigation = this.root._navigation;
        if (this.kind !== 'navigation' || this._navigationDisposed || this._livePins > 0) return;
        if (navigation && navigation.current === this) return;
        this._navigationDisposed = true;
        navigation?.scopes.delete(this);
        this.dispose().catch(() => { });
    }

    private _scopeFor(slot: OwnerSlot): ServiceProvider {
        const navigation = this._navigation;
        if (navigation) navigation.version.value;
        if (!slot.ownerless) {
            const pinned = pinnedScopeOf(slot.owner);
            if (pinned) return pinned;
            if (constructionScope && constructionScope.root === this) return constructionScope;
        }
        return navigation ? navigation.current : this;
    }

    private _handle(desc: ServiceDescriptor, path: any[]): any {
        const slot = activeSlot ?? this._ownerlessSlot;
        let handles = handlesBySlot.get(slot);
        if (!handles) handlesBySlot.set(slot, handles = new Map());
        let handle = handles.get(desc.token);
        if (!handle) {
            handle = this._createHandle(desc, slot);
            handles.set(desc.token, handle);
        }
        this._scopeFor(slot)._scopedInstanceSync(desc, path);
        return handle;
    }

    private async _handleAsync(desc: ServiceDescriptor, path: any[]): Promise<any> {
        const slot = activeSlot ?? this._ownerlessSlot;
        await this._scopeFor(slot)._scopedInstanceAsync(desc, path);
        return runWith(slot, null, () => this._handle(desc, path));
    }

    private _createHandle(desc: ServiceDescriptor, slot: OwnerSlot): any {
        const root = this;
        const target = () => root._scopeFor(slot)._scopedInstanceSync(desc, [desc.token]);
        return new Proxy(Object.create(null), {
            get(_, key) {
                const instance = target();
                const value = Reflect.get(instance, key, instance);
                return typeof value === 'function' ? bindTo(instance, key, value) : value;
            },
            set(_, key, value) {
                const instance = target();
                return Reflect.set(instance, key, value, instance);
            },
            has(_, key) {
                return key in target();
            },
            getPrototypeOf() {
                return Object.getPrototypeOf(target());
            },
        });
    }

    private _isSystemScope(): boolean {
        return this.kind !== 'user';
    }

    private _scopedInstanceSync(desc: ServiceDescriptor, path: any[]): any {
        if (this.scopedCache.has(desc.token)) return this.scopedCache.get(desc.token);
        const inst = runWith(null, this, () => this.instantiateSync(desc, path));
        this.scopedCache.set(desc.token, inst);
        return inst;
    }

    private async _scopedInstanceAsync(desc: ServiceDescriptor, path: any[]): Promise<any> {
        if (this.scopedCache.has(desc.token)) return this.scopedCache.get(desc.token);
        if (this.pendingScoped.has(desc.token)) return await this.pendingScoped.get(desc.token)!;
        const promise = (async () => {
            const inst = await this.instantiateAsyncIn(null, this, desc, path);
            this.scopedCache.set(desc.token, inst);
            this.pendingScoped.delete(desc.token);
            return inst;
        })();
        this.pendingScoped.set(desc.token, promise);
        return await promise;
    }

    private resolveDescriptorSync(desc: ServiceDescriptor, path: any[]): any {
        this.checkCycle(desc.token, path);
        switch (desc.lifetime) {
            case 'singleton': {
                if (this.singletonCache.has(desc.token)) return this.singletonCache.get(desc.token);
                const inst = runWith(null, null, () => this.instantiateSync(desc, path));
                this.singletonCache.set(desc.token, inst);
                return inst;
            }
            case 'scoped': {
                if (this._isSystemScope() && rawScopedIn !== this) return this.root._handle(desc, path);
                return this._scopedInstanceSync(desc, path);
            }
            case 'transient':
            default: {
                const inst = this.instantiateSync(desc, path);
                if (this._autoDisposeTransients && this.parent) {
                    this.transientSet.add(inst);
                }
                return inst;
            }
        }
    }

    private async resolveDescriptorAsync(desc: ServiceDescriptor, path: any[]): Promise<any> {
        this.checkCycle(desc.token, path);
        switch (desc.lifetime) {
            case 'singleton': {
                if (this.singletonCache.has(desc.token)) return this.singletonCache.get(desc.token);
                if (this.pendingSingleton.has(desc.token)) return await this.pendingSingleton.get(desc.token)!;
                const promise = (async () => {
                    const inst = await this.instantiateAsyncIn(null, null, desc, path);
                    this.singletonCache.set(desc.token, inst);
                    this.pendingSingleton.delete(desc.token);
                    return inst;
                })();
                this.pendingSingleton.set(desc.token, promise);
                return await promise;
            }
            case 'scoped': {
                if (this._isSystemScope() && rawScopedIn !== this) return await this.root._handleAsync(desc, path);
                return await this._scopedInstanceAsync(desc, path);
            }
            case 'transient':
            default: {
                const inst = await this.instantiateAsync(desc, path);
                if (this._autoDisposeTransients && this.parent) {
                    this.transientSet.add(inst);
                }
                return inst;
            }
        }
    }

    private construct<T>(create: () => T): T {
        if (activeSlot) return create();
        const slot: OwnerSlot = { owner: null };
        const inst = runWith(slot, rawScopedIn, create);
        if (inst && (typeof inst === 'object' || typeof inst === 'function') && typeof (inst as any).then !== 'function') {
            recordServiceOwner(inst as any);
            slot.owner = inst as any;
            if (!slotsByOwner.has(inst as any)) slotsByOwner.set(inst as any, slot);
        }
        return inst;
    }

    private instantiateSync(desc: ServiceDescriptor, path: any[]): any {
        if (desc.useValue !== undefined) {
            return desc.useValue;
        }
        if (desc.useFactory) {
            return this.construct(() => {
                const args = this.resolveDepsSync(desc, path);
                const result = runWithResolver(this.injectionResolver(path), () => (desc.useFactory as any)(...args, this));
                if (result && typeof (result as any).then === 'function') {
                    const name = this.describeTokenWithSource(desc.token);
                    throw motifError('MJX402', name);
                }
                return result;
            });
        }
        if (desc.useClass) {
            return this.construct(() => {
                const args = this.resolveDepsSync(desc, path);
                return runWithResolver(this.injectionResolver(path), () => new (desc.useClass as any)(...args));
            });
        }
        throw motifError('MJX403');
    }

    private async instantiateAsyncIn(slot: OwnerSlot | null, raw: ServiceProvider | null, desc: ServiceDescriptor, path: any[]): Promise<any> {
        return await runWith(slot, raw, () => this.instantiateAsync(desc, path));
    }

    private async instantiateAsync(desc: ServiceDescriptor, path: any[]): Promise<any> {
        if (desc.useValue !== undefined) {
            return desc.useValue;
        }
        const slot = activeSlot;
        const raw = rawScopedIn;
        if (desc.useFactory) {
            const args = await this.resolveDepsAsyncIn(slot, raw, desc, path);
            return await runWith(slot, raw, () => this.construct(() => runWithResolver(this.injectionResolver(path), () => (desc.useFactory as any)(...args, this))));
        }
        if (desc.useClass) {
            const args = await this.resolveDepsAsyncIn(slot, raw, desc, path);
            return runWith(slot, raw, () => this.construct(() => runWithResolver(this.injectionResolver(path), () => new (desc.useClass as any)(...args))));
        }
        throw motifError('MJX403');
    }

    public async dispose(): Promise<void> {
        const seen = new Set<any>();
        const callDispose = async (obj: any) => {
            if (!obj || seen.has(obj)) return;
            seen.add(obj);
            try { if (typeof obj.dispose === 'function') await obj.dispose(); }
            catch { /* ignore */ }
            try { if (typeof obj.close === 'function') await obj.close(); }
            catch { /* ignore */ }
            try {
                const d = (obj as any)[Symbol.dispose];
                if (typeof d === 'function') await d.call(obj);
            } catch { }
            try {
                const ad = (obj as any)[Symbol.asyncDispose];
                if (typeof ad === 'function') await ad.call(obj);
            } catch { }
        };
        if (this.root === this) {
            const navigation = this._navigation;
            if (navigation) {
                const scopes = [...navigation.scopes];
                navigation.scopes.clear();
                navigation.current = this;
                if (navigatingRoot === this) navigatingRoot = null;
                this._navigation = undefined;
                for (const scope of scopes) {
                    scope._navigationDisposed = true;
                    await scope.dispose();
                }
            }
            for (const v of this.singletonCache.values()) await callDispose(v);
            this.singletonCache.clear();
            this.pendingSingleton.clear();
        }
        for (const v of this.scopedCache.values()) await callDispose(v);
        if (this.kind !== 'navigation') this.scopedCache.clear();
        this.pendingScoped.clear();
        for (const v of this.transientSet.values()) await callDispose(v);
        this.transientSet.clear();
    }

    private resolveDepsSync(desc: ServiceDescriptor, path: any[]): any[] {
        const deps = this.getDeps(desc);
        if (!deps || deps.length === 0) return [];
        return deps.map(dep => this.resolveTokenSync(dep, path));
    }
    private async resolveDepsAsyncIn(slot: OwnerSlot | null, raw: ServiceProvider | null, desc: ServiceDescriptor, path: any[]): Promise<any[]> {
        const deps = this.getDeps(desc);
        if (!deps || deps.length === 0) return [];
        const results: any[] = [];
        for (const dep of deps) {
            results.push(await runWith(slot, raw, () => this.resolveTokenAsync(dep, path)));
        }
        return results;
    }
    private injectionResolver(path: any[]): (token: any) => any {
        return (token: any) => this.resolveTokenSync(token, path);
    }
    private getDeps(desc: ServiceDescriptor): any[] | undefined {
        if (Array.isArray(desc.deps)) return desc.deps;
        const source: any = desc.useClass ?? desc.useFactory;
        if (source) {
            if (Array.isArray(source.inject)) return source.inject;
            if (Array.isArray(source.dependencies)) return source.dependencies;
        }
        return undefined;
    }
    private resolveTokenSync(token: any, path: any[]): any {
        const d = this.services.getDescriptor(token);
        if (!d) throw motifError('MJX401', this.describeToken(token));
        const nextPath = path.concat(token);
        return this.resolveDescriptorSync(d, nextPath);
    }
    private async resolveTokenAsync(token: any, path: any[]): Promise<any> {
        const d = this.services.getDescriptor(token);
        if (!d) throw motifError('MJX401', this.describeToken(token));
        const nextPath = path.concat(token);
        return await this.resolveDescriptorAsync(d, nextPath);
    }
    private checkCycle(token: any, path: any[]) {
        const firstIndex = path.indexOf(token);
        if (firstIndex !== -1 && firstIndex !== path.length - 1) {
            const chainTokens = path.slice(firstIndex).concat([token]);
            const chain = chainTokens.map((t) => this.describeTokenWithSource(t)).join(' -> ');
            throw motifError('MJX404', chain);
        }
    }
    private describeToken = (t: any) => {
        if (typeof t === 'string') return t;
        if (typeof t === 'symbol') return t.toString();
        if (typeof t === 'function') return t.name || '[AnonymousClass]';
        return String(t);
    };
    private describeTokenWithSource(t: any) {
        const name = this.describeToken(t);
        const d = this.services.getDescriptor(t);
        if (!d) return name;
        const src = d.useClass ? 'useClass' : d.useFactory ? 'useFactory' : (d.useValue !== undefined) ? 'useValue' : 'unknown';
        return `${name}[${src}]`;
    }
}
