// import { dom } from "../browser";
import { TRANSITION_SLOT } from "../component/optionsSlots";
// import { effect } from "../store";
import { dom } from "../";
import { Component, ComponentBase, resolveComponent, notifyDeactivated } from "../";
import { reportError } from "../common/diagnostics";
import { checkReservedMembers } from "../component/componentBase";

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
        const args = Array.from(arguments) as any[];
        if (typeof args[0] === 'number' && args.length > 1) {
            const index = args[0] as number;
            const children = ([] as ComponentBase[]).concat(...args.slice(1));
            return this.insert(index, ...children);
        } else {
            const children = ([] as ComponentBase[]).concat(...args);
            return this.insert(undefined, ...children);
        }
    }
    insert(index?: number, ...controls: ComponentBase[]): ComponentBase[] {
        const flat: ComponentBase[] = ([] as any[]).concat(...controls as any);
        return flat.filter(x => x != undefined && !x.isDisposed).map(control => this._insertOne(index, control));
    }
    private _insertOne(index: number | undefined, control: ComponentBase): ComponentBase {
        control = resolveComponent(control);
        if (typeof control == 'string' || typeof control == 'number' || typeof control == 'boolean' || typeof control == 'bigint') {
            control = new Component(dom.createTextNode(control), null as any);
        }
        checkReservedMembers(control);
        if (control.parent) { control.parent.controls.detach(control); }

        if (index != undefined && index >= 0) {
            this.items.splice(index, 0, control);
        } else {
            this.items.push(control);
        }
        control.parent = this.owner;

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
            this.items.splice(index, 1);
            try { control.dispose(); } catch { /* ignore */ }
        }
    }
    detach(control: ComponentBase): Promise<void> {
        const index = this.items.indexOf(control);
        if (index === -1) return Promise.resolve();
        this.items.splice(index, 1);
        if (control.isDisposed) return Promise.resolve();
        (control as any)._base && ((control as any)._base._leaveContainer = this.owner);
        control.parent = null;
        return runLeaveThenDetach(control, () => { if (this.onRemove) this.onRemove(control); });
    }

    silentDetach(control: ComponentBase, unlinkOnly: boolean = false) {
        if (unlinkOnly) { this.silentUnlink(control); return; }
        const index = this.items.indexOf(control);
        if (index === -1) return;
        this.items.splice(index, 1);
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
        this.items.splice(index, 1);
        (control as any)._base && ((control as any)._base._leaveContainer = this.owner);
        control.parent = null;
    }

    async clearAsync(): Promise<void> {
        const items = this.items.splice(0, this.items.length);   
        await Promise.all(items.map(c => c.dispose()));          
    }


    clear() {
        var items = this.items.splice(0, this.items.length);
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

        if ((control as any).isWait) {
            return;
        }
        const container = findAppendableElement(this.owner);
        if (!container) return;

        const referenceNode: Node | null = before ? (before.element as unknown as Node) : computeAppendReference(this.owner);

        moveComponentDomRange(control, container, referenceNode);
    }

    moveToIndex(control: ComponentBase, index: number): void {
        if (!control || control.isDisposed) return;
        if (!Number.isFinite(index as any)) return;
        if (index < 0) index = 0;
        if (index > this.items.length) index = this.items.length;
        if (this.items.indexOf(control) === -1) return;
        const before = index >= this.items.length ? null : this.items[index];
        this.move(control, before);
    }
}

/** Owner için DOM'a eklenebilir gerçek element'i bulur. */
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

/** Bir component'in kök DOM aralığını (tek element veya fragment aralığı) referenceNode öncesine taşır. */
function moveComponentDomRange(control: ComponentBase, container: Node, referenceNode: Node | null) {
    const node = control.element as any as Node | null;
    if (!node) return;

    if (node.nodeType !== Node.COMMENT_NODE) {
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
    if (node.nodeType === Node.COMMENT_NODE) {
        if (!node.parentNode) return;
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
