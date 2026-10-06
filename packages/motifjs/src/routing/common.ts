import { Application } from "..";
import { RouteItem } from "./";

export type RouteResolveContext = {
    uri: string;
    context: Application;
    rewritePath: (uri: string) => void
}

export type NavigationDirection = 'initial' | 'push' | 'replace' | 'back' | 'forward' | 'traverse';

export type NavigationOptions = {
    replace?: boolean;
    state?: any;
    force?: boolean;
    scroll?: 'top' | 'smooth' | 'instant' | { top?: number; left?: number; behavior?: ScrollBehavior };
};

export type ScrollMemoryOptions = {
    top?: boolean;
    anchor?: boolean;
    settleMs?: number;
    persist?: boolean;
    limit?: number;
    key?: (path: string) => string;
    container?: string | HTMLElement | (() => HTMLElement | null | undefined);
}

export type StackTransitionContext = {
    direction: NavigationDirection;
    entering: HTMLElement | null;
    leaving: HTMLElement | null;
};

export type StackSwipeBackOptions = {
    edge?: number;
    threshold?: number;
};

export type StackOptions = {
    retain?: boolean;
    depth?: number;
    persist?: boolean;
    animation?: 'none' | 'slide' | ((context: StackTransitionContext) => Promise<void> | void);
    duration?: number;
    swipeBack?: boolean | StackSwipeBackOptions;
};

export type StackEntryInfo = {
    index: number;
    uri: string;
    current: boolean;
    retained: boolean;
};

export type RouterOptions = {
    mode?: 'history' | 'hash' | 'file' | 'shell',
    fallbacks?: {
        notFound?: any,
        error?: any
    },
    middlewareCollections?: () => Array<(ctx: RouteResolveContext, next: () => Promise<void>) => any>,
    RouteItems: RouteItem[],
    hooks?: RouterEvents;
    scrollMemory?: boolean | ScrollMemoryOptions;
    stack?: boolean | StackOptions;

}

export interface ResolveResult {
    ok: boolean;
    uri: string;
    fullPath: string | null;
    route: RouteItem | null;
    chain: RouteItem[];
    params: Record<string, any>;
    extend: Record<string, any>;
    meta?: Record<string, any>;
    aliasOf?: string | null;
}

export type RouteResolution = {
    chain: string[];
    result: ResolveResult;
}

export type Router = {
    readonly params: Record<string, any>;
    readonly route: RouteItem | null;
    readonly ok: boolean;
    readonly uri: string;
    readonly fullPath: string | null;
    readonly aliasOf: string | null;
    navigate: (uri: string, options?: NavigationOptions) => Promise<any>;
    navigateByName: (name: string, params?: Record<string, any>, options?: NavigationOptions) => Promise<any>;
    evict: (route?: RouteItem | string | null) => Promise<void>;
    readonly chain: string[];
    readonly extend: Record<string, any>;
    readonly meta: Record<string, any>;
    readonly direction?: NavigationDirection;
    readonly state?: any;
    readonly stack?: StackEntryInfo[];
    resolve: (uri: string) => RouteResolution;
    href: (name: string, params?: Record<string, any>) => string;
    readonly routes: RouteInfo[];
}

export type RouteInfo = {
    fullPath: string;
    name: string | null;
    meta: Record<string, any>;
    route: RouteItem;
    chain: RouteItem[];
}

/** `motifjs-router-navigated` olayının (`app.onRouterChanged`) yükü. */
export type RouterNavigatedEventArgs = {
    uri: string;
    params: Record<string, any>;
    meta: Record<string, any>;
    route: RouteItem | null;
    ok: boolean;
    /** Açılış (ilk) navigasyonu mu? */
    initial: boolean;
    redirectedFrom?: string;
    direction?: NavigationDirection;
    state?: any;
}

export type RouterEvents = {
    onEntering?: RouteItem['onEntering'];
    onEnter?: RouteItem['onEnter'];
    onLeave?: RouteItem['onLeave'];
    onUpdate?: RouteItem['onUpdate']
}