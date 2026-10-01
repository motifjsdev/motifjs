import { Component } from "../component";

export * from "./common";
export * from "./RouterView";
export * from "./RouteCollection";
export * from "./RouteItem";
export * from "./UrlRoutingModule";
export * from "./RoutingEngine";
export * from "./scanner";
export * from "./RouterLink";
export * from "./scrollMemory";


export function cloneComponent(source: any, props: any) {

    const mergedProps = {
        ...source.props,
        ...props
    };

    if (source.constructor) {
        const ctor = source.constructor;
        const cloned = new ctor(source.element.cloneNode(false), mergedProps);
        return cloned;
    } else if (typeof source === "function") {
        const cloned = new source(mergedProps);
        return cloned;
    }
    return new Component(source, mergedProps);
}