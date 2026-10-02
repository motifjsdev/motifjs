import { ComponentBase, motifFragment, resolveComponent } from "../";
import { effect, untracked } from "../";
import { getRaw } from "../store/common";
import { motifError, reportWarning } from "../common/diagnostics";
import { IBaseBinding } from "./";


export interface ListBindingOptions {
    reuse?: boolean;
}

export class ListBinding implements IBaseBinding {
    propertyName: string = "__list__";
    dataSource: any;
    dataMember?: string | undefined;
    formatString?: string | undefined;
    converter?: ((value: any) => any) | undefined;
    converterBack?: ((value: any) => any) | undefined;
    updateMode?: "onPropertyChanged" | "onValidation" | "never" | undefined;
    private _isActive = false;
    private _effectCleanup?: () => void;
    private _rendered: ComponentBase[] = [];
    private _identityMap = new WeakMap<object, ComponentBase[]>();
    private container: ComponentBase = motifFragment('list-container');
    constructor(private component: ComponentBase,
        private itemsFn: () => any[] | Iterable<any>,
        private renderFn: (item: any, index: number) => ComponentBase,
        private options?: ListBindingOptions) {
        this.component.controls.add(this.container);

    }
    activate(): void { if (this._isActive) return; this._isActive = true; this._setupBinding(); }
    deactivate(): void {
        if (!this._isActive) return;
        this._isActive = false;
        if (this._effectCleanup) {
            this._effectCleanup();
            this._effectCleanup = undefined;
        }
        this._disposeAll();
    }
    reActivate(): void {

        this.deactivate();
        this.activate();
    }
    private _disposeAll() {
        this._rendered.forEach(c => { try { c.dispose && c.dispose(); } catch { } });
        this._rendered = [];
        this._identityMap = new WeakMap();
    }
    private _toArray(src: any): any[] {
        if (!src) return [];
        if (Array.isArray(src)) return src;
        if (typeof src === 'function') return this._toArray(src());
        if (src[Symbol.iterator]) return Array.from(src as Iterable<any>);
        return [];
    }
    private _getComponentKey(comp: ComponentBase): any {
        try {
            const p: any = (comp as any).props;
            if (p && typeof p.indexkey === 'function') {
                return p.indexkey();
            }
            if (p && typeof p.indexkey !== 'undefined' && p.indexkey !== null) {
                return p.indexkey;
            }
        } catch { }
        try {
            const k = (comp as any).motif.options?.__key;
            if (typeof k !== 'undefined') return k;
        } catch { }
        return undefined;
    }

    private isPreCreated(comp: ComponentBase): boolean {
        return comp.element !== null || comp.parent !== null;
    }

    private _render(item: any, idx: number): ComponentBase {
        return untracked(() => {
            const rendered = this.renderFn(item, idx);
            return this.processRendered(rendered, item);
        });
    }

    private processRendered(rendered: any, item: any): ComponentBase {
        const component: ComponentBase = resolveComponent(rendered);
        if (!(component instanceof ComponentBase)) {
            throw motifError('MJX201');
        }

        try { (component as any)._base.itemRef = item; } catch { }
        try { (component.motif.options as any).__fromList = true; } catch { }

        if (typeof (component as any).__listAdopted === 'undefined') {
            (component as any).__listAdopted = component.parent !== null && component.parent !== undefined;
        }

        return component;
    }
    private olditems: any[] = [];

    private get _indexSensitive(): boolean {
        try { return this.renderFn.length >= 2; } catch { return true; }
    }

    private static _isPrimitive(v: any): boolean {
        return v === null || typeof v !== 'object';
    }

    private _setupBinding() {
        const update = () => {
            const source = this._toArray(this.itemsFn());
            const rawSource = getRaw(source);
            const count = source.length;
            let items: any[];
            if (rawSource === source) {
                items = source;
            } else {
                items = new Array(count);
                for (let i = 0; i < count; i++) {
                    if (i in rawSource) items[i] = source[i];
                    else void source[i];
                }
            }
            const prevItems = this.olditems;
            const prevComponents = this._rendered;
            if (this.olditems.length > 0) {
                const currentRaws = new Set<any>();
                for (let i = 0; i < count; i++) currentRaws.add(getRaw(items[i]));
                for (const old of this.olditems) {
                    const raw = getRaw(old);
                    if (!currentRaws.has(raw)) {
                        const list = this._identityMap.get(raw);
                        if (list) {
                            this._identityMap.delete(raw);
                            for (const component of list) {
                                try { component.dispose(); } catch { }
                            }
                        }
                    }
                }
            }

            const newComponents: ComponentBase[] = [];
            const usedComponents = new Set<ComponentBase>();
            const seenKeys = new Map<any, number>();

            const claimed = new Set<ComponentBase>();
            const positionalReuse = new Map<number, ComponentBase>();
            const isReusable = (c: ComponentBase | undefined): c is ComponentBase =>
                !!c && !c.isDisposed && !claimed.has(c) && !(c as any).__listAdopted;

            const shared = Math.min(items.length, prevItems.length);
            for (let i = 0; i < shared; i++) {
                const it = items[i];
                if (!ListBinding._isPrimitive(it)) continue;
                if (!Object.is(prevItems[i], it)) continue;
                const comp = prevComponents[i];
                if (!isReusable(comp)) continue;
                positionalReuse.set(i, comp);
                claimed.add(comp);
            }

            let valuePool: Map<any, ComponentBase[]> | null = null;
            if (!this._indexSensitive) {
                valuePool = new Map<any, ComponentBase[]>();
                for (let i = 0; i < prevItems.length; i++) {
                    const prev = prevItems[i];
                    if (!ListBinding._isPrimitive(prev)) continue;
                    const comp = prevComponents[i];
                    if (!isReusable(comp)) continue;
                    const queue = valuePool.get(prev);
                    if (queue) queue.push(comp); else valuePool.set(prev, [comp]);
                }
            }

            const occurrences = new Map<object, number>();
            items.forEach((item, idx) => {
                let component: ComponentBase;
                if (typeof item === 'object' && item !== null) {
                    const raw = getRaw(item);
                    const occurrence = occurrences.get(raw) ?? 0;
                    occurrences.set(raw, occurrence + 1);
                    let list = this._identityMap.get(raw);
                    if (!list) {
                        list = [];
                        this._identityMap.set(raw, list);
                    }
                    const existing = list[occurrence];
                    if (existing && !existing.isDisposed) {
                        component = existing;
                    } else {
                        component = this._render(item, idx);
                        list[occurrence] = component;
                    }
                }
                else {
                    let reused = positionalReuse.get(idx);
                    if (!reused && valuePool) {
                        const queue = valuePool.get(item);
                        if (queue && queue.length) {
                            reused = queue.shift()!;
                            claimed.add(reused);
                        }
                    }
                    if (reused) {
                        component = reused;
                    } else {
                        component = this._render(item, idx);
                    }
                }
                const userKey = this._getComponentKey(component);
                if (userKey !== undefined && userKey !== null) {
                    if (seenKeys.has(userKey)) {
                        reportWarning('MJX202', [userKey, idx]);
                    } else {
                        seenKeys.set(userKey, idx);
                    }
                }

                newComponents.push(component);
                usedComponents.add(component);
            });

            occurrences.forEach((count, raw) => {
                const list = this._identityMap.get(raw);
                if (list && list.length > count) list.length = count;
            });

            this._rendered.forEach(comp => {
                if (!usedComponents.has(comp) && !(comp as any).__listAdopted) {
                    try { comp.dispose(); } catch { }
                }
            });

            this._syncContainer(newComponents);

            this._rendered = newComponents;
            this.olditems = items === source ? source.slice() : items;
            return count;
        };
        this._effectCleanup = effect(() => update());
    }

    private _syncContainer(newComponents: ComponentBase[]) {
        const controls = this.container.controls;
        const items = controls.items;

        if (items.length === 0) {
            for (const comp of newComponents) {
                try { controls.add(comp); } catch { }
            }
            return;
        }

        if (newComponents.length >= items.length) {
            let appendOnly = true;
            for (let i = 0; i < items.length; i++) {
                if (newComponents[i] !== items[i]) {
                    appendOnly = false;
                    break;
                }
            }

            if (appendOnly && newComponents.length > items.length) {
                const existing = new Set(items);
                for (let i = items.length; i < newComponents.length; i++) {
                    if (existing.has(newComponents[i])) {
                        appendOnly = false;
                        break;
                    }
                    existing.add(newComponents[i]);
                }
            }

            if (appendOnly) {
                for (let i = items.length; i < newComponents.length; i++) {
                    try { controls.add(newComponents[i]); } catch { }
                }
                return;
            }
        }

        const oldIndex = new Map<ComponentBase, number>();
        items.forEach((c, i) => oldIndex.set(c, i));
        const sources = newComponents.map(c => {
            const oi = oldIndex.get(c);
            return oi === undefined ? -1 : oi;
        });

        const stable = new Set(longestIncreasingIndices(sources));

        let anchor: ComponentBase | null = null;
        for (let i = newComponents.length - 1; i >= 0; i--) {
            const comp = newComponents[i];
            try {
                if (sources[i] === -1) {
                    if (anchor) {
                        const at = items.indexOf(anchor);
                        controls.add(at >= 0 ? at : items.length, comp);
                    } else {
                        controls.add(comp);
                    }
                } else if (!stable.has(i)) {
                    controls.move(comp, anchor);
                }
            } catch { }
            anchor = comp;
        }
    }
}

function longestIncreasingIndices(sources: number[]): number[] {
    const predecessors = new Array<number>(sources.length).fill(-1);
    const tails: number[] = [];

    for (let i = 0; i < sources.length; i++) {
        const v = sources[i];
        if (v === -1) continue;
        if (tails.length === 0 || sources[tails[tails.length - 1]] < v) {
            predecessors[i] = tails.length > 0 ? tails[tails.length - 1] : -1;
            tails.push(i);
            continue;
        } 
        let lo = 0, hi = tails.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sources[tails[mid]] < v) lo = mid + 1; else hi = mid;
        }
        if (v < sources[tails[lo]]) {
            predecessors[i] = lo > 0 ? tails[lo - 1] : -1;
            tails[lo] = i;
        }
    }

    const result: number[] = [];
    let u = tails.length > 0 ? tails[tails.length - 1] : -1;
    while (u !== -1) {
        result.push(u);
        u = predecessors[u];
    }
    return result.reverse();
}