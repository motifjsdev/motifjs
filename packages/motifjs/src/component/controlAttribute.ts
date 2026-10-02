import { IAttribute } from "../";
import { ComponentBase } from "../";
import { effect } from "../store/reactivity-core";
import { Binding, IBaseBinding } from "../bindings";
import { isComponentLike } from "./componentBase";

export type ElementTypes = Node | Element | HTMLElement | Text | DocumentFragment | Comment | HTMLDivElement;

const METHOD_ATTRS = new Set<string>([
    'focus', 'blur', 'click', 'pause', 'submit', 'reset',
    'scrollTo', 'scrollBy', 'select', 'scrollIntoView',
    'requestFullscreen', 'exitFullscreen',
    'requestPointerLock', 'exitPointerLock',
    'play', 'requestPictureInPicture', 'exitPictureInPicture',
    'show', 'showModal', 'close', 'showPopover', 'hidePopover', 'togglePopover',
    'requestSubmit', 'checkValidity', 'reportValidity', 'showPicker', 'load',
    'setSelectionRange', 'setRangeText', 'setPointerCapture', 'releasePointerCapture', 'fastSeek'
]);

const OPEN_METHODS: Record<string, string> = { show: 'close', showModal: 'close', showPopover: 'hidePopover' };
const WHEN_TRUTHY_METHODS = new Set<string>(['close', 'hidePopover', 'requestSubmit', 'checkValidity', 'reportValidity', 'showPicker', 'load']);
const ARGUMENT_METHODS = new Set<string>(['setSelectionRange', 'setRangeText', 'setPointerCapture', 'releasePointerCapture', 'fastSeek']);

const PROPERTY_FIRST = new Set<string>(['checked', 'selected', 'muted', 'indeterminate', 'srcObject']);

export class controlAttribute<ElementType extends ElementTypes> implements IAttribute<ComponentBase<ElementType, any>> {
    private _parent: ComponentBase<ElementType, any>;
    private _attrMapStore?: Map<string | symbol, any>;
    private _watchersStore?: Map<string | symbol, { stop: () => void, binding?: IBaseBinding }>;
    constructor(parent: ComponentBase<ElementType, any>) {
        this._parent = parent;
    }
    private get _attrMap(): Map<string | symbol, any> { return this._attrMapStore ??= new Map(); }
    private get _watchers(): Map<string | symbol, { stop: () => void, binding?: IBaseBinding }> { return this._watchersStore ??= new Map(); }

    /** @deprecated Tek kaynak `_attrMap`; geriye dönük okuma için türetilmiş görünüm. */
    get attributes(): { name: string, value: any }[] {
        return Array.from(this._attrMap.entries(), ([name, value]) => ({ name: String(name), value }));
    }
    add(attribute: object | string): ComponentBase<ElementType, any> {
        if (attribute !== null && typeof attribute === 'object' && !Array.isArray(attribute)) {
            const bag = attribute as Record<string | symbol, any>;
            Reflect.ownKeys(bag).forEach(key => {
                this.parse(bag[key], key);
            });
        }
        return this._parent;

    };
    remove(key: string): ComponentBase<ElementType, any> {
        const stopper = this._watchers.get(key);
        if (stopper) {
            try { stopper.stop(); } catch { }
            try { stopper.binding && this._parent.bindings.remove(stopper.binding); } catch { }
            this._watchers.delete(key);
        }
        this._attrMap.delete(key);
        const el = this._getElement();
        if (el) {
            try { el.removeAttribute(key); } catch { }
        }
        return this._parent;
    };
    has(key: string): boolean {

        if (this._parent.element instanceof HTMLElement ||
            this._parent.element instanceof Element) {
            return this._parent.element.hasAttribute(key)
        }
        return false;
    };
    get(key: string): string | null {
        const el = this._getElement();
        if (el) {
            const v = el.getAttribute(key);
            if (v != null) return v;
        }
        const val = this._attrMap.get(key);
        return val == null ? null : String(val);
    };

    parse(values: any, key: any) {

        if (typeof values === 'function') {
            const stopper = this._watchers.get(key);
            if (stopper) {
                try { stopper.stop(); } catch { }
                try { stopper.binding && this._parent.bindings.remove(stopper.binding); } catch { }
                this._watchers.delete(key);
            }
            const run = () => effect(() => {
                const v = values();
                this._applyValue(key, v);
            });
            let current = run();
            const stop = () => { try { current(); } catch { } };

            const binding: IBaseBinding = {
                propertyName: `__attr:${String(key)}`,
                dataSource: null,
                activate() { /* no-op */ },
                deactivate() { stop(); },
                reActivate() {
                    stop();
                    current = run();
                }
            } as any;
            try { this._parent.bindings.add(binding); } catch { }
            this._watchers.set(key, { stop, binding });
        } else {
            this._applyValue(key, values);
        }
    }

    private _applyValue(key: string | symbol, raw: any) {
        if (!key) return;
        const el = this._getElement();

        try {
            if (typeof raw === 'function') {
                raw = raw();
                if (typeof raw === 'function') {
                    raw = raw();
                }
            }
        } catch {
        }

        if (el && typeof key === 'string' && METHOD_ATTRS.has(key)) {
            const k = key as string;
            const method = (el as any)[k];
            if (typeof method === 'function') {
                const invoke = (fn: Function, arg?: any) => {
                    try {
                        if (Array.isArray(arg)) {
                            fn.apply(el, arg);
                        } else if (arg === undefined) {
                            fn.call(el);
                        } else {
                            fn.call(el, arg);
                        }
                    } catch { }
                };
                const schedule = (fn: () => void) => { try { queueMicrotask(fn); } catch { try { setTimeout(fn, 0); } catch { } } };
                const cacheValue = () => {
                    this._attrMap.set(key, raw);
                };

                if (k === 'focus') {
                    const action = () => {
                        if (raw === false) {
                            const blur = (el as any).blur; if (typeof blur === 'function') invoke(blur);
                        } else if (raw === true) {
                            invoke(method);
                        } else if (typeof raw === 'object' && raw != null && raw !== true) {
                            invoke(method, raw);
                        } else if (Array.isArray(raw)) {
                            invoke(method, raw);
                        } else {
                            invoke(method, raw);
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'blur' || k === 'click' || k === 'pause' || k === 'submit' || k === 'reset') {
                    const action = () => { if (raw) invoke(method); };
                    schedule(action);
                    cacheValue();
                    return;
                }
                if (k === 'scrollTo' || k === 'scrollBy') {
                    const action = () => {
                        if (Array.isArray(raw) || (raw && typeof raw === 'object')) {
                            invoke(method, raw);
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'select') {
                    const action = () => {
                        if (raw) {
                            invoke(method);
                        } else {
                            const inp: any = el as any;
                            if (typeof inp.setSelectionRange === 'function') {
                                try { inp.setSelectionRange(0, 0); } catch { }
                            }
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'scrollIntoView') {
                    const action = () => {
                        if (raw === true || raw == null) {
                            invoke(method);
                        } else {
                            invoke(method, raw);
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }
                if (k === 'requestFullscreen') {
                    const action = () => {
                        if (raw) {
                            invoke(method);
                        } else {

                            try {
                                const d: any = document;
                                if (d && d.fullscreenElement === el && typeof d.exitFullscreen === 'function') {
                                    d.exitFullscreen();
                                }
                            } catch { }
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'exitFullscreen') {
                    const action = () => {
                        if (raw) {
                            try {
                                const d: any = document;
                                if (d && typeof d.exitFullscreen === 'function') d.exitFullscreen();
                            } catch { }
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'requestPointerLock') {
                    const action = () => {
                        if (raw) {
                            invoke(method);
                        } else {
                            try {
                                const d: any = document;
                                if (d && typeof d.exitPointerLock === 'function') d.exitPointerLock();
                            } catch { }
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'exitPointerLock') {
                    const action = () => {
                        if (raw) {
                            try {
                                const d: any = document;
                                if (d && typeof d.exitPointerLock === 'function') d.exitPointerLock();
                            } catch { }
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'play') {
                    const action = () => {
                        if (raw) {
                            try { const p = method.call(el); if (p && typeof p.then === 'function') p.catch(() => { }); } catch { }
                        } else {
                            const pause = (el as any).pause; if (typeof pause === 'function') invoke(pause);
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'requestPictureInPicture') {
                    const action = () => {
                        if (raw) {
                            try { const p = method.call(el); if (p && typeof p.then === 'function') p.catch(() => { }); } catch { }
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }
                if (k === 'exitPictureInPicture') {
                    const action = () => {
                        if (raw) {
                            try {
                                const d: any = document as any;
                                if (d && typeof d.exitPictureInPicture === 'function') {
                                    const p = d.exitPictureInPicture(); if (p && typeof p.then === 'function') p.catch(() => { });
                                }
                            } catch { }
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k in OPEN_METHODS) {
                    const action = () => {
                        if (raw === false) {
                            const other = (el as any)[OPEN_METHODS[k]]; if (typeof other === 'function') invoke(other);
                        } else if (raw) {
                            invoke(method);
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (k === 'togglePopover') {
                    const action = () => {
                        if (typeof raw === 'boolean') {
                            try { method.call(el, raw); } catch { }
                        } else if (raw) {
                            invoke(method);
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (WHEN_TRUTHY_METHODS.has(k)) {
                    const action = () => {
                        if (raw === true) {
                            invoke(method);
                        } else if (raw) {
                            invoke(method, raw);
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (ARGUMENT_METHODS.has(k)) {
                    const action = () => {
                        if (raw !== undefined && raw !== null && raw !== false) {
                            invoke(method, raw);
                        }
                    };
                    schedule(action);
                    cacheValue();
                    return;
                }

                if (raw === undefined || raw === null || raw === false) {
                    this._attrMap.delete(key);
                    return;
                }
                cacheValue();
                return;
            }
        }

        if (typeof key === 'string' && PROPERTY_FIRST.has(key)) {
            const target = (this._parent.element as any) ?? el;
            if (target) {
                try {
                    if (key === 'srcObject') {
                        target.srcObject = raw ?? null;
                    } else {
                        target[key] = !!raw;
                    }
                } catch { }
            }
            if (raw === undefined || raw === null || raw === false) {
                this._attrMap.delete(key);
            } else {
                this._attrMap.set(key, raw);
            }
            return;
        }

        if (typeof raw === 'boolean' && typeof key === 'string' && (key.startsWith('aria-') || key.startsWith('data-'))) {
            if (el) { try { (el as Element).setAttribute(key, String(raw)); } catch { } }
            this._attrMap.set(key, raw);
            return;
        }

        const isUnset = raw === undefined || raw === null || raw === false;
        const isBool = typeof raw === 'boolean';

        if (isUnset) {
            if (el) { try { (el as Element).removeAttribute(String(key)); } catch { } }
            this._attrMap.delete(key);
            return;
        }

        if (key === 'value') {
            try {
                const input = (this._parent.element as any) as HTMLInputElement;
                const next = String(raw);
                if (input.value !== next) { input.value = next; }
            } catch { }
        } else if (key === 'textContent' || key === 'innerText' || key === 'innerHTML') {
            if (isComponentLike(raw)) { this._parent.setText(raw as any); return; }
            try { (this._parent.element as any)[key as any] = raw; } catch { }
        } else {
            if (el) {
                try {
                    if (isBool && raw === true) {
                        (el as Element).setAttribute(String(key), '');
                    } else {
                        (el as Element).setAttribute(String(key), raw);
                    }
                } catch { }
            }
        }

        this._attrMap.set(key, raw);
    }

    private _getElement(): Element | null {
        const el = this._parent?.element as unknown;
        if (el instanceof HTMLElement || el instanceof Element) return el as Element;
        return null;
    }

    public hasMethodState(key: string): boolean {
        const el = this._getElement();
        if (!el || !key) return false;
        return !!this.getMethodState(key);
    }

    public getMethodState(key: string): any {
        const el = this._getElement();
        if (!el || !key) return false;
        const k = String(key);
        switch (k) {
            case 'focus':
            case 'blur':
                try { return (document && (document as any).activeElement) === el; } catch { return false; }
            case 'select': {
                const inp: any = el as any;
                if (typeof inp.selectionStart === 'number' && typeof inp.selectionEnd === 'number') {
                    try { return (inp.selectionEnd - inp.selectionStart) > 0; } catch { return false; }
                }
                return false;
            }
            case 'scrollIntoView':
                return false;
            case 'click':
                return false;
            default:
                return false;
        }
    }
}