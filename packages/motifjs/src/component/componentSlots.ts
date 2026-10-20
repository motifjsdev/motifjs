import type { Component, FragmentNode } from "./Component";
import type { Frame } from "./Frame";
import type { Application } from "../application";

export const componentSlots: { component: typeof Component | null; fragment: typeof FragmentNode | null; frame: typeof Frame | null; application: typeof Application | null } = { component: null, fragment: null, frame: null, application: null };

export function makeComponent(element: any, options?: any): Component {
    var ctor = componentSlots.component!;
    if (arguments.length === 1) {
        return new ctor(element);
    }
    return new ctor(element, options);
}

export function makeFragment(): FragmentNode {
    var ctor = componentSlots.fragment!;
    return new ctor();
}

export function makeFrame(): Frame {
    var ctor = componentSlots.frame!;
    return new ctor();
}

export function mainApplication(): Application {
    return componentSlots.application ? componentSlots.application.main : null as any;
}

export function isApplicationDisposing(): boolean {
    return componentSlots.application ? componentSlots.application._disposingCount > 0 : false;
}
