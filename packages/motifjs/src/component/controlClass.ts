import { IClass } from "../";
import { ComponentBase } from "./";
import { effect } from "../store/reactivity-core";
import { IBaseBinding } from "../bindings";



export class controlClass<ElementType extends Element | HTMLElement | Text | DocumentFragment | Comment> implements IClass<ComponentBase<ElementType, any>> {
    private _parent: ComponentBase;
    constructor(parent: ComponentBase) {
        this._parent = parent;
    }
    private _countsStore?: Map<string, number>;
    private _staticSetStore?: Set<string>;
    private _watchersStore?: Map<string, { stop: () => void, binding?: IBaseBinding, set: Set<string> }>;
    private _watcherSeq = 0;
    private get _counts(): Map<string, number> { return this._countsStore ??= new Map(); }
    private get _staticSet(): Set<string> { return this._staticSetStore ??= new Set(); }
    private get _watchers(): Map<string, { stop: () => void, binding?: IBaseBinding, set: Set<string> }> { return this._watchersStore ??= new Map(); }

    add(...values: (string | any[] | {} | Function)[]): ComponentBase {
        for (const value of values) {
            if (typeof value === 'function') {
                this._addReactive(value);
            } else if (Array.isArray(value)) {
                this._addStaticFromArray(value);
            } else if (value && typeof value === 'object') {
                this._addStaticFromObject(value as Record<string, any>);
            } else {
                this._addStaticNames(this._splitClasses(String(value ?? '')));
            }
        }
        return this._parent;
    }

    remove(classNames: string | string[]): ComponentBase {
        const el = this._getElement();
        if (Array.isArray(classNames)) {
            const prev = new Set(this._staticSet);
            for (const cn of classNames) {
                for (const cls of this._splitClasses(String(cn))) {
                    this._staticSet.delete(cls);
                }
            }
            this._applySourceDiff('static', prev, new Set(this._staticSet), el);
        } else {
            if (classNames === '**') {
                for (const [id, w] of Array.from(this._watchers.entries())) {
                    const prev = new Set(w.set);
                    this._applySourceDiff(id, prev, new Set(), el);
                    try { w.binding && this._parent.bindings.remove(w.binding); } catch { }
                    try { w.stop(); } catch { }
                    this._watchers.delete(id);
                }
                const prev = new Set(this._staticSet);
                this._staticSet.clear();
                this._applySourceDiff('static', prev, new Set(), el);
                if (el) {
                    try { el.removeAttribute('class'); } catch { /* ignore */ }
                }
                this._counts.clear();
            } else {
                const prev = new Set(this._staticSet);
                for (const cls of this._splitClasses(String(classNames))) {
                    this._staticSet.delete(cls);
                }
                this._applySourceDiff('static', prev, new Set(this._staticSet), el);
            }
        }
        return this._parent;
    }

    has(className: string): boolean {
        const el = this._getElement();
        const name = String(className ?? '').trim();
        if (!name) return false;
        return !!(el && el.classList.contains(name));
    }

    private _getElement(): (Element & { classList: DOMTokenList, className: string }) | null {
        const el: unknown = this._parent?.element;
        if (el instanceof Element) return el as any;
        return null;
    }

    private _splitClasses(input: string): string[] {
        if (!input) return [];
        if (!/\s/.test(input)) return [input];
        return input.split(/\s+/).filter(s => s.length > 0);
    }

    private _normalizeToSet(values: any, key?: any): Set<string> {
        const result = new Set<string>();
        if (values == null) return result;
        if (typeof values === 'string') {
            for (const cls of this._splitClasses(values)) result.add(cls);
        } else if (Array.isArray(values)) {
            for (const item of values) {
                if (item == null) continue;
                if (typeof item === 'string') {
                    for (const cls of this._splitClasses(item)) result.add(cls);
                } else if (Array.isArray(item)) {
                    for (const cls of this._normalizeToSet(item)) result.add(cls);
                } else if (typeof item === 'object') {
                    const obj = item as Record<string, any>;
                    for (const k of Object.keys(obj)) {
                        const v = obj[k];
                        if (!!v) {
                            for (const cls of this._splitClasses(String(k))) result.add(cls);
                        }
                    }
                } else if (typeof item === 'boolean') {
                    if (key && item) {
                        for (const cls of this._splitClasses(String(key))) result.add(cls);
                    }
                } else {
                    for (const cls of this._splitClasses(String(item))) result.add(cls);
                }
            }
        } else if (typeof values === 'object') {
            const obj = values as Record<string, any>;
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (!!v) {
                    for (const cls of this._splitClasses(String(k))) result.add(cls);
                }
            }
        } else if (typeof values === 'boolean') {
            if (key && values) {
                for (const cls of this._splitClasses(String(key))) result.add(cls);
            }
        } else {
            for (const cls of this._splitClasses(String(values))) result.add(cls);
        }
        return result;
    }

    private _applySourceDiff(sourceId: string, prev: Set<string>, next: Set<string>, el: Element | null) {

        for (const cls of prev) {
            if (!next.has(cls)) {
                const prevCount = this._counts.get(cls) || 0;
                const now = prevCount - 1;
                if (now <= 0) {
                    this._counts.delete(cls);
                    if (el) { try { (el as any).classList.remove(cls); } catch { } }
                } else {
                    this._counts.set(cls, now);
                }
            }
        }
        for (const cls of next) {
            if (!prev.has(cls)) {
                const prevCount = this._counts.get(cls) || 0;
                const now = prevCount + 1;
                this._counts.set(cls, now);
                if (prevCount === 0 && el) {
                    try { (el as any).classList.add(cls); } catch { }
                }
            }
        }
    }

    private _addStaticNames(names: string[]) {
        if (names.length === 0) return;
        const el = this._getElement();
        const staticSet = this._staticSet;
        const fresh: string[] | null = el && !el.hasAttribute('class') ? [] : null;
        for (const cls of names) {
            if (staticSet.has(cls)) continue;
            staticSet.add(cls);
            const prevCount = this._counts.get(cls) || 0;
            this._counts.set(cls, prevCount + 1);
            if (prevCount === 0 && el) {
                if (fresh) fresh.push(cls);
                else { try { (el as any).classList.add(cls); } catch { } }
            }
        }
        if (fresh && fresh.length > 0) el!.setAttribute('class', fresh.join(' '));
    }

    private _addStaticFromArray(arr: any[]) {
        const el = this._getElement();
        const prev = new Set(this._staticSet);
        for (const item of arr) {
            if (item == null) continue;
            if (typeof item === 'string') {
                for (const cls of this._splitClasses(item)) this._staticSet.add(cls);
            } else if (Array.isArray(item)) {
                const set = this._normalizeToSet(item);
                for (const cls of set) this._staticSet.add(cls);
            } else if (typeof item === 'object') {
                const obj = item as Record<string, any>;
                for (const k of Object.keys(obj)) {
                    const v = obj[k];
                    if (typeof v === 'function') {
                        const keys = this._splitClasses(String(k));
                        for (const cls of keys) this._addReactive(obj[k], cls);
                    } else {
                        const keys = this._splitClasses(String(k));
                        if (!!v) {
                            for (const cls of keys) this._staticSet.add(cls);
                        } else {
                            for (const cls of keys) this._staticSet.delete(cls);
                        }
                    }

                }
            } else if (typeof item === 'boolean') {
                continue;
            } else if (typeof item === "function") {
                this._addReactive(item);
            } else {
                for (const cls of this._splitClasses(String(item))) this._staticSet.add(cls);
            }
        }

        this._applySourceDiff('static', prev, new Set(this._staticSet), el);
    }

    private _addStaticFromObject(obj: Record<string, any>) {
        const el = this._getElement();
        const prev = new Set(this._staticSet);
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            const keys = this._splitClasses(String(k));
            if (!!v) {
                for (const cls of keys) this._staticSet.add(cls);
            } else {
                for (const cls of keys) this._staticSet.delete(cls);
            }
        }
        this._applySourceDiff('static', prev, new Set(this._staticSet), el);
    }

    private _addReactive(fn: Function, key?: any) {
        const id = `fx#${++this._watcherSeq}`;
        const rec = { stop: () => { }, binding: undefined as undefined | IBaseBinding, set: new Set<string>() };
        const el = this._getElement();
        const run = () => effect(() => {
            let next: Set<string>;
            try {
                const v = fn();
                next = this._normalizeToSet(v, key);
            } catch {
                next = new Set();
            }
            const prev = new Set(rec.set);
            this._applySourceDiff(id, prev, next, el);
            rec.set = next;
        });
        let current = run();
        const stop = () => { try { current(); } catch { } };

        const binding: IBaseBinding = {
            propertyName: `__class:${id}`,
            dataSource: null,
            activate() { /* no-op */ },
            deactivate: () => {
                stop();
                const el2 = this._getElement();
                const prev = new Set(rec.set);
                this._applySourceDiff(id, prev, new Set(), el2);
                rec.set.clear();
            },
            reActivate: () => {
                stop();
                current = run();
            }
        } as any;
        try { this._parent.bindings.add(binding); } catch { }
        rec.stop = stop;
        rec.binding = binding;
        this._watchers.set(id, rec);
    }
}