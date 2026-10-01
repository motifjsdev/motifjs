import { Component } from "./Component";
import { ComponentBase } from "./componentBase";
import { TransportRegistry } from "./TransportRegistry";

export class Transport extends Component<any, { name: string, mode?: 'replace' | 'merge' }> {
    public mode: 'replace' | 'merge';
    constructor(props: { name: string, mode?: 'replace' | 'merge' }) {
        super(props);
        this.mode = props.mode || 'replace';
    }
    initializeComponent(sender: ComponentBase) {
        TransportRegistry.registerSlot(this.props.name, this);
        this.onDisposing = () => {
            (this.controls.items || []).forEach(child => {
                this.controls.remove(child);
                child.dispose?.();
            });
            TransportRegistry.unregisterSlot(this.props.name, this);
        };
    }

    clearSlot() {
        (this.controls.items || []).forEach(child => {
            this.controls.remove(child);
            child.dispose?.();
        });
    }
}