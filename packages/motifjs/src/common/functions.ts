

import { NodeTypes } from ".";
import { reportError } from "./diagnostics";
import { Component, ComponentBase } from "../component";
import { IDisposable } from "../disposable";

export const toKebab = (str: string) => str.replace(/[A-Z]+(?![a-z])|[A-Z]/g, ($, ofs) => (ofs ? "-" : "") + $.toLowerCase());


export function toDisposable(fn: () => void): IDisposable {
    let pending = true;
    return {
        dispose() {
            if (!pending) {
                return;
            }
            pending = false;
            fn();
        }
    };
}



export function advanceif(source: ComponentBase, ...targets: NodeTypes[]) {
    if (targets.indexOf(source.element.nodeType) > -1) {
        return true;
    }
    return false;
}

export function advelif(source: any, ...targets: NodeTypes[]) {
    if (source && targets.indexOf(source.nodeType) > -1) {
        return true;
    }
    return false;
}
export function isAnchorElement(source: ComponentBase) {
    return source.element.nodeName == 'A';
}

export function isElement(source: ComponentBase) {
    return source.element.nodeType == NodeTypes.ELEMENT_NODE;
}
export function isview(source: ComponentBase) {
    return source.element.nodeName == 'view';
}



export function isComponent(source: any) {
    return source instanceof ComponentBase
}
export function createComponent(tag: any, options: any) {
    return new Component(tag, options)
}


export function normalizePath(p: string): string {
    return '/' + p.replace(/^\/+|\/+$/g, '');
}
export function startsWithPath(requestPath: string, prefix: string): boolean {
    const rp = normalizePath(requestPath);
    const pp = normalizePath(prefix);
    return rp === pp || rp.startsWith(pp + '/');
}

export function isExactMatch(requestPath: string, target: string): boolean {
    try {
        const strip = (p: string) => {
            return p.trim()
                .split(/[?#]/)[0]
                .replace(/\\/g, "/")
                .replace(/\/{2,}/g, "/");
        }
        return strip(requestPath) === strip(target);
    } catch (error) {
        reportError('MJX610', error);
        return false;
    }

}

export function findAppendableComponent(component: ComponentBase): ComponentBase | null {
    try {
        if (component.isDisposed) return null;
        if (component.element.nodeType !== Node.COMMENT_NODE && component.element.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && component.element.nodeType !== Node.TEXT_NODE) {
            return component;
        } else if (component.parent) {
            return findAppendableComponent(component.parent);
        }
    } catch (error) {
        throw error;
    }
    return null;
}