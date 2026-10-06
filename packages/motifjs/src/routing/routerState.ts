import { Signal } from "../store/Signal";
import { motifError } from "../common/diagnostics";
import type { UrlRoutingModule } from "./UrlRoutingModule";
import type { NavigationDirection, NavigationOptions, ResolveResult, Router } from "./common";
import type { RouteItem } from "./RouteItem";

export type RouteSnapshot = {
    target: ResolveResult;
    chain: string[];
    direction: NavigationDirection | undefined;
    state: any;
};

export class RouterState {
    readonly version = new Signal(0);
    private _current: RouteSnapshot | null = null;
    private _constructing: RouteSnapshot | null = null;

    read(): RouteSnapshot | null {
        this.version.value;
        return this._constructing ?? this._current;
    }

    commit(snapshot: RouteSnapshot): void {
        this._current = snapshot;
        this.touch();
    }

    reset(): void {
        this._current = null;
        this.touch();
    }

    touch(): void {
        this.version.value = this.version.peek() + 1;
    }

    constructWith<T>(snapshot: RouteSnapshot | undefined, create: () => T): T {
        if (!snapshot) return create();
        const previous = this._constructing;
        this._constructing = snapshot;
        try {
            return create();
        } finally {
            this._constructing = previous;
        }
    }
}

export function createRouter(state: RouterState, module: () => UrlRoutingModule | undefined): Router {
    const required = (): UrlRoutingModule => {
        const current = module();
        if (!current) throw motifError('MJX309');
        return current;
    };
    const target = () => state.read()?.target;
    return {
        get params() { return target()?.params ?? {}; },
        get route() { return target()?.route ?? null; },
        get ok() { return target()?.ok ?? false; },
        get uri() { return target()?.uri ?? ''; },
        get fullPath() { return target()?.fullPath ?? null; },
        get aliasOf() { return target()?.aliasOf ?? null; },
        get extend() { return target()?.extend ?? {}; },
        get meta() {
            const current = target();
            return current ? ((current as any).meta ?? current.extend) : {};
        },
        get chain() { return state.read()?.chain ?? []; },
        get direction() { return state.read()?.direction; },
        get state() { return state.read()?.state; },
        get stack() {
            state.version.value;
            return module()?.describeStack();
        },
        get routes() {
            state.version.value;
            return module()?.routeInfos() ?? [];
        },
        navigate: async (uri: string, options?: NavigationOptions) => {
            return await required().navigate(uri, options);
        },
        navigateByName: async (name: string, params?: Record<string, any>, options?: NavigationOptions) => {
            return await required().navigateByName(name, params, options);
        },
        evict: async (route?: RouteItem | string | null) => {
            await required().evict(route);
        },
        resolve: (uri: string) => {
            const current = required();
            const result = current.resolve(uri);
            return { chain: current.chainOf(result), result };
        },
        href: (name: string, params?: Record<string, any>) => required().href(name, params),
    };
}
