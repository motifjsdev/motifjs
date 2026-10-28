// import { dom } from "../browser";
import { TRANSITION_SLOT } from "../component/optionsSlots";
// import { effect } from "../store/reactivity-core";
import { dom } from "./dom";
import { ComponentBase, notifyDeactivated } from "../component/componentBase";
import { resolveComponent } from "../component/resolveComponent";
import { makeComponent } from "../component/componentSlots";
import { reportError } from "../common/diagnostics";
import { pushTight } from "../common/pushTight";
import { checkReservedMembers, domAnchor, setLeaveContainer } from "../component/componentBase";
import { treeChanged } from "../devtools/tree";

export class ControlCollection {
    constructor(private owner: ComponentBase) {

    }
    items: ComponentBase[] = [];

    add(...control: ComponentBase[]): ComponentBase[]
    add(index?: number, ...control: ComponentBase[]): ComponentBase[]
    add(): ComponentBase[] {
        const count = arguments.length;
        if (count === 0) return [] as ComponentBase[];
        const first = arguments[0];
        if (count === 1 && first instanceof ComponentBase) {
            if (first.isDisposed) return [] as ComponentBase[];
            return [this._insertOne(undefined, first)];
        }
        if (typeof first === 'number' && count > 1) {
            const index = first as number;
            const children = spreadOnce(spreadOnce(arguments, 1), 0);
            return this.insert(index, children as any);
        } else {
            const children = spreadOnce(spreadOnce(arguments, 0), 0);
            return this.insert(undefined, children as any);
        }
    }
    insert(index?: number, ...controls: ComponentBase[]): ComponentBase[] {
        const flat: ComponentBase[] = spreadOnce(controls, 0);
        let previous: ComponentBase | undefined;
        return flat.filter(x => x != undefined && !x.isDisposed).map(control => {
            const added = this._insertOne(index, control, previous);
            if (added != undefined) previous = added;
            return added;
        }).filter(x => x != undefined);
    }
    private _insertOne(index: number | undefined, control: ComponentBase, previous?: ComponentBase): ComponentBase {
        control = resolveComponent(control);
        if (control == undefined) return control;

        if (typeof control == 'string' || typeof control == 'number' || typeof control == 'boolean' || typeof control == 'bigint') {
            control = makeComponent(dom.createTextNode(control), null as any);
        }
        checkReservedMembers(control);
        if (control.parent) { control.parent.controls.detach(control); }

        if (index != undefined && index >= 0) {
            const after = previous ? this.items.indexOf(previous) : -1;
            this.items.splice(after >= 0 ? after + 1 : index, 0, control);
        } else {
            pushTight(this.items, control);
        }
        control.parent = this.owner;
        /* @DEV-ONLY */ treeChanged(this.owner);

        const pendingLeave = (control as any).__pendingLeave as PendingLeave | undefined;
        if (pendingLeave) {
            if (this.onAddBeforeBuild && !this.owner.isBuilt) {
                this.onAddBeforeBuild(control);
            }
            pendingLeave.promise.then(() => {
                if (control.isDisposed || this.owner.isDisposed || control.parent !== this.owner) return;
                if (this.onAdd && this.owner.isBuilt) this.onAdd(control);
            });
            return control;
        }

        if (this.onAdd && this.owner.isBuilt) {
            this.onAdd(control);
        }

        if (this.onAddBeforeBuild && !this.owner.isBuilt) {
            this.onAddBeforeBuild(control);
        }
        return control;
    }
    remove(control: ComponentBase) {
        var index = this.items.indexOf(control);
        if (index > -1) {
            takeAt(this.items, index);
            /* @DEV-ONLY */ treeChanged(this.owner);
            try { control.dispose(); } catch { /* ignore */ }
        }
    }
    detach(control: ComponentBase): Promise<void> {
        const index = this.items.indexOf(control);
        if (index === -1) return Promise.resolve();
        takeAt(this.items, index);
        /* @DEV-ONLY */ treeChanged(this.owner);
        if (control.isDisposed) return Promise.resolve();
        setLeaveContainer(control, this.owner);
        control.parent = null;
        return runLeaveThenDetach(control, () => { if (this.onRemove) this.onRemove(control); });
    }

    silentDetach(control: ComponentBase, unlinkOnly: boolean = false) {
        if (unlinkOnly) { this.silentUnlink(control); return; }
        const index = this.items.indexOf(control);
        if (index === -1) return;
        takeAt(this.items, index);
        /* @DEV-ONLY */ treeChanged(this.owner);
        if (control.isDisposed) return;
        control.parent = null;
        try {
            detachComponentDom(control);
        } catch (error) {
            reportError('MJX117', error);
        }
        notifyDeactivated(control);
    }

    silentUnlink(control: ComponentBase) {
        const index = this.items.indexOf(control);
        if (index === -1) return;
        takeAt(this.items, index);
        /* @DEV-ONLY */ treeChanged(this.owner);
        setLeaveContainer(control, this.owner);
        control.parent = null;
    }

    async clearAsync(): Promise<void> {
        const items = this.items.splice(0, this.items.length);
        /* @DEV-ONLY */ treeChanged(this.owner);
        await Promise.all(items.map(c => c.dispose()));          
    }


    clear() {
        var items = this.items.splice(0, this.items.length);
        /* @DEV-ONLY */ treeChanged(this.owner);
        items.forEach(c => {
            try { c.dispose(); } catch { /* ignore */ }
        });
    }
    get length() {
        return this.items.length;
    }
    forEach(callbackfn: (value: ComponentBase, index: number, array: ComponentBase[]) => void) {
        this.items.forEach(callbackfn);
    }
    map(callbackfn: (value: ComponentBase, index: number, array: ComponentBase[]) => void) {
        return this.items.map(callbackfn);
    }
    onAdd?: (control: ComponentBase) => void;
    onRemove?: (control: ComponentBase) => void;
    onAddBeforeBuild?: (control: ComponentBase) => void;
    move(control: ComponentBase, before?: ComponentBase | null): void {
        if (!control || control.isDisposed) return;
        if (before === control) return;
        if (control.parent !== this.owner) return;
        if (before && before.parent !== this.owner) return;

        const oldIndex = this.items.indexOf(control);
        if (oldIndex === -1) return;
        const beforeIndex = before ? this.items.indexOf(before) : -1;
        if (before && beforeIndex === -1) return;

        const alreadyInPlace = before ? beforeIndex === oldIndex + 1 : oldIndex === this.items.length - 1;
        if (alreadyInPlace) return;


        this.items.splice(oldIndex, 1);

        if (!before) {
            this.items.push(control);
        } else {
            const newBeforeIndex = this.items.indexOf(before);
            const insertAt = newBeforeIndex >= 0 ? newBeforeIndex : this.items.length;
            this.items.splice(insertAt, 0, control);
        }
        /* @DEV-ONLY */ treeChanged(this.owner);

        const container = findAppendableElement(this.owner);
        if (!container || !domAnchor(control, container)) return;

        const at = before ? this.items.indexOf(before) : -1;
        moveComponentDomRange(control, container, at >= 0 ? anchorFrom(this.owner, this.items, at, container) : computeAppendReference(this.owner));
    }

    _reorder(order: ComponentBase[], stable: Set<number>): void {
        const container = findAppendableElement(this.owner);
        if (container) {
            let ref = computeAppendReference(this.owner);
            for (let i = order.length - 1; i >= 0; i--) {
                const control = order[i];
                const node = domAnchor(control, container);
                if (!node) continue;
                if (!stable.has(i)) moveComponentDomRange(control, container, ref);
                ref = node;
            }
        }
        const items = this.items;
        for (let i = 0; i < order.length; i++) items[i] = order[i];
        /* @DEV-ONLY */ treeChanged(this.owner);
    }

    _swap(control: ComponentBase, next: ComponentBase, index: number): ComponentBase | undefined {
        const at = this.items[index] === control ? index : this.items.indexOf(control);
        if (at === -1) return undefined;
        next = resolveComponent(next);
        if (next == undefined || next.isDisposed) return undefined;
        checkReservedMembers(next);
        if (next.parent) { next.parent.controls.detach(next); }
        const place = this.items[at] === control ? at : this.items.indexOf(control);
        if (place === -1) return undefined;
        this.items[place] = next;
        control.parent = null;
        next.parent = this.owner;
        /* @DEV-ONLY */ treeChanged(this.owner);
        try { control.dispose(); } catch { /* ignore */ }

        const pendingLeave = (next as any).__pendingLeave as PendingLeave | undefined;
        if (pendingLeave) {
            if (this.onAddBeforeBuild && !this.owner.isBuilt) {
                this.onAddBeforeBuild(next);
            }
            pendingLeave.promise.then(() => {
                if (next.isDisposed || this.owner.isDisposed || next.parent !== this.owner) return;
                if (this.onAdd && this.owner.isBuilt) this.onAdd(next);
            });
            return next;
        }

        if (this.onAdd && this.owner.isBuilt) {
            this.onAdd(next);
        }

        if (this.onAddBeforeBuild && !this.owner.isBuilt) {
            this.onAddBeforeBuild(next);
        }
        return next;
    }

    moveToIndex(control: ComponentBase, index: number): void {
        if (!control || control.isDisposed) return;
        if (!Number.isFinite(index as any)) return;
        if (this.items.indexOf(control) === -1) return;
        const rest = this.items.filter(x => x !== control);
        if (index < 0) index = 0;
        const before = index >= rest.length ? null : rest[index];
        this.move(control, before);
    }
}

function spreadOnce(items: ArrayLike<any>, from: number): any[] {
    const out: any[] = [];
    for (let i = from; i < items.length; i++) {
        const item = items[i];
        if (Array.isArray(item)) {
            for (let k = 0; k < item.length; k++) out.push(item[k]);
        } else {
            out.push(item);
        }
    }
    return out;
}

/** Owner için DOM'a eklenebilir gerçek element'i bulur. */
function takeAt(items: ComponentBase[], index: number): void {
    if (index === 0) items.shift(); else items.splice(index, 1);
}

function findAppendableElement(owner: ComponentBase): HTMLElement | Node | null {
    let c: ComponentBase | null = owner;
    while (c) {
        const node = c.element as any as Node;
        if (node && node.nodeType !== Node.COMMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
            return node as any;
        }
        c = c.parent;
    }
    return null;
}

/** Owner fragment ise sona ekleme referansını, değilse null döndürür. */
function computeAppendReference(owner: ComponentBase): Node | null {
    const node = owner.element as any as Node;
    if (node && node.nodeType === Node.COMMENT_NODE) {
        return (owner as any).motif.options?.closeFragment || null;
    }
    return null;
}

function anchorFrom(owner: ComponentBase, items: ComponentBase[], start: number, container: Node): Node | null {
    for (let i = start; i < items.length; i++) {
        const anchor = domAnchor(items[i], container);
        if (anchor) return anchor;
    }
    return computeAppendReference(owner);
}

/** Bir component'in kök DOM aralığını (tek element veya fragment aralığı) referenceNode öncesine taşır. */
function moveComponentDomRange(control: ComponentBase, container: Node, referenceNode: Node | null) {
    const node = domAnchor(control, container);
    if (!node) return;

    if (node.nodeType !== Node.COMMENT_NODE || node !== (control.element as unknown as Node)) {
        try { container.insertBefore(node, referenceNode); } catch { }
        return;
    }

    const open = node;
    const close = ((control as any).motif.options?.closeFragment as Node | undefined) || null;
    if (!close) { try { container.insertBefore(open, referenceNode); } catch { } return; }

    if (referenceNode && isNodeInRange(open, close, referenceNode)) {
        referenceNode = close.nextSibling;
    }

    const frag = (dom.createDocumentFragment && dom.createDocumentFragment()) || container.ownerDocument?.createDocumentFragment?.() || (function () { try { return document.createDocumentFragment(); } catch { return null as any; } })();
    if (!frag) {
        let current: Node | null = open;
        let maxIterations = 10000;
        while (current && maxIterations-- > 0) {
            const after: Node | null = current.nextSibling;
            try { container.insertBefore(current, referenceNode); } catch { }
            if (current === close) break;
            current = after;
        }
        if (maxIterations <= 0) {
            reportError('MJX119', undefined);
        }
        return;
    }

    let current: Node | null = open;
    let maxIterations = 10000;
    while (current && maxIterations-- > 0) {
        const after: Node | null = current.nextSibling;
        try { (frag as any).appendChild(current); } catch { }
        if (current === close) break;
        current = after;
    }
    if (maxIterations <= 0) {
        reportError('MJX119', undefined);
    }
    try { container.insertBefore(frag as any, referenceNode); } catch { }
}

function isNodeInRange(open: Node, close: Node, test: Node): boolean {
    let current: Node | null = open;
    let maxIterations = 10000;
    while (current && maxIterations-- > 0) {
        if (current === test) return true;
        if (current === close) break;
        current = current.nextSibling;
    }
    if (maxIterations <= 0) {
        reportError('MJX120', undefined);
    }
    return false;
}

function detachComponentDom(control: ComponentBase): void {
    const node = control.element as unknown as Node | null;
    if (!node) return;
    const opts: any = (control as any).motif.options;
    if (node.nodeType === Node.COMMENT_NODE && node.parentNode) {
        const close = (opts?.closeFragment as Node | undefined) || null;
        const cache: DocumentFragment = opts.cache ?? (opts.cache = dom.createDocumentFragment());
        let current: Node | null = node;
        let maxIterations = 10000;
        while (current && maxIterations-- > 0) {
            const after: Node | null = current.nextSibling;
            cache.appendChild(current);
            if (!close || current === close) break;
            current = after;
        }
        return;
    }
    if (node.parentNode) {
        node.parentNode.removeChild(node);
        return;
    }
    const placeholder = opts?.placeholder as Node | undefined;
    if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
}

interface PendingLeave {
    promise: Promise<void>;
    finish: () => void;
}

function runLeaveThenDetach(control: ComponentBase, notify: () => void): Promise<void> {
    let resolveDone: () => void = () => { };
    const promise = new Promise<void>(resolve => { resolveDone = resolve; });
    let pending = 1;
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        if ((control as any).__pendingLeave?.promise === promise) delete (control as any).__pendingLeave;
        if (!control.isDisposed) {
            try {
                detachComponentDom(control);
            } catch (error) {
                reportError('MJX117', error);
            }
            notifyDeactivated(control);
        }
        try {
            notify();
        } catch (error) {
            reportError('MJX118', error);
        }
        resolveDone();
    };
    const arrive = () => {
        pending--;
        if (pending === 0) finish();
    };
    const visit = (c: ComponentBase) => {
        if (!c || c.isDisposed || !c.element || !c.isVisible || c.isWait) return;
        const node = c.element as unknown as Node;
        if (node.nodeType === Node.COMMENT_NODE) {
            c.controls.items.forEach(visit);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        pending++;
        let arrived = false;
        const once = () => {
            if (arrived) return;
            arrived = true;
            arrive();
        };
        try {
            const opts: any = c.motif.options;
            if (!opts[TRANSITION_SLOT] && !opts.transitionOut) {
                once();
                return;
            }
            opts.transition.leaveTransition(once);
        } catch {
            once();
        }
    };
    (control as any).__pendingLeave = { promise, finish } as PendingLeave;
    visit(control);
    arrive();
    return promise;
}
