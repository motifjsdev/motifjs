import { IDisposable } from "../";
import { errorHandler } from "../common/ErrorHandler";
import { motifError, reportError } from "../common/diagnostics";

const glblths = globalThis as any;
function getCurrentDom() {
    if (glblths && glblths.motifDom) {
        return glblths.motifDom.window.document;
    }
    return glblths.document;
}

export function setDom(dom: any) {
    if (glblths) {
        glblths.motifDom = dom;
    }
}

export const dom = {
    get window() {
        if (glblths && glblths.window) {
            return glblths.window;
        } else if (glblths && glblths) {
            return glblths.motifDom.window;
        } else {
            return glblths;
        }
    },
    _created: new Map<any, any>(),
    document: getCurrentDom(),
    createElement(tagName: string, options?: any): any {
        const doc = getCurrentDom();
        if (!doc) {
            throw motifError('MJX101', tagName);
        }
        if (tagName === "text") {
            return doc.createTextNode('');
        }
        if (!this._created.has(tagName)) {
            const view = doc.createElement(tagName, options);
            this._created.set(tagName, view);
        }
        const tpl = this._created.get(tagName);
        return tpl.cloneNode(false);
    },

    createDocumentFragment(): any {
        try {
            var cd = getCurrentDom();
            if (cd) {
                return cd.createDocumentFragment();
            }
        } catch (error) {
            errorHandler.reportSuppressed('dom.createDocumentFragment', error);
        }

    },
    createComment(content: any) {
        try {
            return getCurrentDom()?.createComment(content)
        } catch (error) {
            errorHandler.reportSuppressed('dom.createComment', error);
        }

    },
    createTextNode(content: any) {
        try {
            return getCurrentDom()?.createTextNode(content)
        } catch (error) {
            errorHandler.reportSuppressed('dom.createTextNode', error);
        }

    },
    querySelectorAll(selectors: string) {
        try {
            return getCurrentDom()?.querySelectorAll(selectors)
        } catch (error) {
            errorHandler.reportSuppressed('dom.querySelectorAll', error);
        }

    },
    createElementNS(namepsaceUri: string, tagName: string, options?: any): any {
        try {
            return getCurrentDom()?.createElementNS(namepsaceUri, tagName, options)
        } catch (error) {
            reportError('MJX103', error, tagName);
        }

    },
    convertToSvgElement(element: Element): Element {

        const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
        const tagName = element.tagName.toLowerCase();
        const newSvgElement = document.createElementNS(SVG_NAMESPACE, tagName);

        for (const attr of element.attributes) {
            newSvgElement.setAttribute(attr.name, attr.value);
        }

        while (element.firstChild) {
            newSvgElement.appendChild(element.firstChild);
        }

        const parent = element.parentNode;
        if (parent) {
            parent.replaceChild(newSvgElement, element);
        }

        return newSvgElement;
    },

    get body() {
        return getCurrentDom()?.body;
    }
}




const SELECTOR_REGEX = /([\w\-]+)?(#([\w\-]+))?((\.([\w\-]+))*)/;
export enum Namespace {
    HTML = 'http://www.w3.org/1999/xhtml',
    SVG = 'http://www.w3.org/2000/svg'
}


function _$<T extends Element>(namespace: Namespace, description: string, attrs?: { [key: string]: any }, ...children: Array<Node | string>): T {
    const match = SELECTOR_REGEX.exec(description);

    if (!match) {
        throw motifError('MJX102', description);
    }

    const tagName = match[1] || 'div';
    let result: T;

    if (namespace !== Namespace.HTML) {
        result = dom.createElementNS(namespace as string, tagName) as T;
    } else {
        result = dom.createElement(tagName) as unknown as T;
    }

    if (match[3]) {
        result.id = match[3];
    }
    if (match[4]) {
        result.className = match[4].replace(/\./g, ' ').trim();
    }
    if (attrs) {
        Object.entries(attrs).forEach(([name, value]) => {
            if (typeof value === 'undefined') {
                return;
            }

            if (/^on\w+$/.test(name)) {
                (<any>result)[name] = value;
            } else if (name === 'selected') {
                if (value) {
                    result.setAttribute(name, 'true');
                }

            } else {
                result.setAttribute(name, value);
            }
        });
    }
    result.append(...children);
    return result as T;
}

export function $<T extends HTMLElement>(description: string, attrs?: { [key: string]: any }, ...children: Array<Node | string>): T {
    return _$(Namespace.HTML, description, attrs, ...children);
}



class DomListener implements IDisposable {

    private _handler: (e: any) => void;
    private _node: EventTarget;
    private readonly _type: string;
    private readonly _options: boolean | AddEventListenerOptions;

    constructor(node: EventTarget, type: string, handler: (e: any) => void, options?: boolean | AddEventListenerOptions) {
        this._node = node;
        this._type = type;
        this._handler = handler;
        this._options = (options || false);
        this._node.addEventListener(this._type, this._handler, this._options);
    }

    dispose(): void {
        if (!this._handler) {
            // Already disposed
            return;
        }

        this._node.removeEventListener(this._type, this._handler, this._options);

        // Prevent leakers from holding on to the dom or handler func
        this._node = null!;
        this._handler = null!;
    }
}

export function addDisposableListener<K extends keyof GlobalEventHandlersEventMap>(node: EventTarget, type: K, handler: (event: GlobalEventHandlersEventMap[K]) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, useCapture?: boolean): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, options: AddEventListenerOptions): IDisposable;
export function addDisposableListener(node: EventTarget, type: string, handler: (event: any) => void, useCaptureOrOptions?: boolean | AddEventListenerOptions): IDisposable {
    return new DomListener(node, type, handler, useCaptureOrOptions);
}



