import { Component } from "../";
import { ComponentBase } from "../";
import { dom } from "../core";
import { effect } from "../";

export class ConditionalWrapper extends ComponentBase<Comment, { render: () => any }> {
    private currentChild: ComponentBase | null = null;
    private renderFn: () => any;
    private stopEffect?: () => void;

    constructor(render: () => any) {
        super(dom.createComment("conditional" as any) as any, {} as any);
        this.renderFn = render;
        this.controls.onRemove = (c) => {
            const node = c.element as unknown as Node | null;
            if (!node) return;
            if (node.nodeType === Node.COMMENT_NODE) {
                const open = node;
                const close = (c.motif.options?.closeFragment as unknown as Node | undefined) || null;
                const parent = open.parentNode;
                if (!parent) return;
                if (close) {
                    let cur: Node | null = open;
                    while (cur) {
                        const after: Node | null = cur.nextSibling;
                        try { parent.removeChild(cur); } catch { }
                        if (cur === close) break;
                        cur = after;
                    }
                } else {
                    try { parent.removeChild(open); } catch { }
                }
            } else {
                const parent = node.parentNode;
                if (parent) {
                    try { parent.removeChild(node); } catch { }
                }
            }
            try { (c as any)._base?._disposeShallow?.(); } catch { }
        };
    }
    private toComponent(result: any): ComponentBase | null {

        if (result instanceof ComponentBase || result.constructor) return new (result.constructor as any)();
        while (typeof result === 'function') {
            result = result();
        }
        if (result == null || result === false) return null;
        if (result instanceof ComponentBase) return result;
        if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean' || typeof result === 'bigint') {
            return new Component(dom.createTextNode(result as any), null as any);
        }

        try {
            return new Component(dom.createTextNode(String(result)), null as any);
        } catch {
            return null;
        }
    }

    private updateChild() {
        const next = this.toComponent(this.renderFn);
        if (next === this.currentChild) return;

        if (this.currentChild) {
            try { this.controls.remove(this.currentChild); } catch { }
            this.currentChild = null;
        }
        if (next) {
            try { this.controls.add(next); } catch { }
            this.currentChild = next;
        }
    }

    public override build(building: boolean = true) {
        if (this.isBuilt) return;
        this.stopEffect = effect(() => this.updateChild());
        super.build(building);
    }

    public override async dispose(options: { deep?: boolean } = { deep: true }) {
        try { this.stopEffect && this.stopEffect(); } catch { }
        this.stopEffect = undefined;
        await super.dispose(options);
    }
}