import { ComponentBase } from "../component";
import { Scanner } from "./scanner";

export interface RouterValidateEventArgs {
    uri: string,
    key: any,
    routes: Map<any, RouteItem>,
    params: Record<string, any>
}

export type RouteControl = ComponentBase | (() => ComponentBase) | (() => Promise<ComponentBase>) | Promise<ComponentBase> | Promise<any> | any;

export type RedirectTarget = {
    path: string;
    params: Record<string, any>;
    meta: Record<string, any>;
};

export type RouteRedirect = string | ((to: RedirectTarget) => string);

export type RouteItem = RouteItemBase & ({ control: RouteControl; redirect?: RouteRedirect } | { control?: RouteControl; redirect: RouteRedirect });

export interface RouteItemBase {
    path: string;
    childs?: RouteItem[];
    extend?: Record<string, any>;
    meta?: Record<string, any>;
    keepAlive?: boolean;
    name?: string | null;
    validate?: (e: RouterValidateEventArgs) => boolean;
    onShow?: (e: ComponentBase) => void;

    onEntering?: (context: { path?: string; params?: Record<string, any>; meta?: Record<string, any>; to?: { path: string; params: Record<string, any>; meta: Record<string, any> } }) => void | Promise<void>;

    onEnter?: (context: { path?: string; params?: Record<string, any>; meta?: Record<string, any>; to?: { path: string; params: Record<string, any>; meta: Record<string, any> } }) => void | Promise<void>;

    onLeave?: (context: { from: { path: string; params: Record<string, any>; meta: Record<string, any> }; to: { path: string; params: Record<string, any>; meta: Record<string, any> } }) => boolean | void | { cancel: true; reason?: string } | Promise<boolean | void | { cancel: true; reason?: string }>;

    onUpdate?: (context: { from: { path: string; params: Record<string, any> }; to: { path: string; params: Record<string, any> }; meta: Record<string, any> }) => void | Promise<void>;

    alias?: string | string[];

    fullPath?: string | null;
}


export interface RouteRecord {
    fullPath: string;
    chain: RouteItem[];
    leaf: RouteItem;
    scanner: Scanner;
    aliasOf?: string | null;
}