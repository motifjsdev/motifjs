import { ComponentBase } from "./componentBase";
import { motifError } from "../common/diagnostics";

export interface TransportOptions {
    index?: number;
    keepState?: boolean;
    owner?: any;
}

export class Transporter {
    static transport(child: ComponentBase, newParent: ComponentBase, options: TransportOptions = {}) {
        if (!child || !newParent) return;
        if (child.parent === newParent && newParent.controls.items.includes(child)) return;
        if (child.parent && child.parent !== newParent) {
            child.parent.controls.silentDetach(child, true);
        }
        if (options.owner) {
            (child.motif.options as any).ownerTransporter = options.owner;
        }
        if (typeof options.index === "number") {
            if (!newParent.controls.items.includes(child)) {
                newParent.controls.items.splice(options.index, 0, child);
            }
        } else {
            if (!newParent.controls.items.includes(child)) {
                newParent.controls.add(child);
            }
        }
        child.parent = newParent;
        if (!options.keepState) {
            child.reState();
        }
    }

    static transportMany(children: ComponentBase[], newParent: ComponentBase, options: TransportOptions = {}) {
        if (!Array.isArray(children)) return;
        children.forEach(child => this.transport(child, newParent, options));
    }

    static createSlot(name: string, parent?: ComponentBase) {
        const slot = {
            name,
            children: [] as ComponentBase[],
            parent: parent as ComponentBase | undefined,
            mount(child: ComponentBase, options: TransportOptions = {}) {
                if (!this.parent) throw motifError('MJX113');
                if (!this.children.includes(child)) {
                    Transporter.transport(child, this.parent, options);
                    this.children.push(child);
                }
            },
            unmount(child: ComponentBase) {
                if (!this.parent) throw motifError('MJX113');
                this.children = this.children.filter(c => c !== child);
                this.parent.controls.remove(child);
            },
            detachAll() {
                if (!this.parent) return;
                this.children.forEach(child => {
                    this.parent!.controls.remove(child);
                });
                this.children = [];
            }
        };
        return slot;
    }
}
