
import { TransportRegistry, SLOT_REGISTERED_EVENT, SLOT_UNREGISTERED_EVENT } from "./TransportRegistry";
import { Transporter } from "./Transporter";
import { ComponentBase } from "./componentBase";
import { Application, EventArgs, Transport, Component } from "../";
import { contentBlocks } from "./contentBlockRegistry";

export class TransportTo extends Component<any, { name: string }> {
    private _onAddRef?: (c: ComponentBase) => void;
    private _onRemoveRef?: (c: ComponentBase) => void;
    private _slotRegisteredListener?: () => void;
    private _slotUnregisteredListener?: () => void;
    private _transported: ComponentBase[] = [];
    private _countedLive = false;
    constructor(props: { name: string }) {
        super('div', props);
        contentBlocks.live++;
        this._countedLive = true;
    }

    private _handleSlotChange = (eventArgs: { name: string, slot: Transport }) => {
        if (eventArgs.name === this.props.name) {
            const slot = eventArgs.slot;
            if (slot.mode !== 'merge') {
                slot.clearSlot?.();
            }
            const all = [...(this.childs || []), ...this.controls.items];
            Transporter.transportMany(all, slot);
            this._rememberTransported(all);
        }
    };

    private _rememberTransported(children: ComponentBase[]) {
        const kept = this._transported.filter(c => !c.isDisposed);
        for (const child of children) {
            if (!kept.includes(child)) kept.push(child);
        }
        this._transported = kept;
    }

    private _clearChildrenFromSlot = (slot: ComponentBase) => {
        (this.childs || []).forEach(child => {
            slot.controls.remove(child);
            child.dispose();
        });
        (this.controls.items || []).forEach(child => {
            slot.controls.remove(child);
            child.dispose();
        });
    };

    initializeComponent(sender: ComponentBase) {
        let slot = TransportRegistry.getSlot(this.props.name) as Transport | undefined;
        if (slot) {
            if (slot.mode !== 'merge') {
                slot.clearSlot?.();
            }
            const all = [...(this.childs || []), ...this.controls.items];
            Transporter.transportMany(all, slot);
            this._rememberTransported(all);
        }

        this._slotRegisteredListener = Application.main.on(SLOT_REGISTERED_EVENT, this._handleSlotChange as any);
        this._slotUnregisteredListener = Application.main.on(SLOT_UNREGISTERED_EVENT, (eventArgs: { name: string, slot: ComponentBase } | any) => {
            if (eventArgs.name === this.props.name) {
                this._clearChildrenFromSlot(eventArgs.slot);
            }
        });;

        this._onAddRef = (child: ComponentBase) => {
            this.motif.trigger('controladded', { control: child });
            const currentSlot = TransportRegistry.getSlot(this.props.name);
            if (currentSlot) {
                Transporter.transport(child, currentSlot);
                this._rememberTransported([child]);
            }
        };
        this._onRemoveRef = (child: ComponentBase) => {
            const currentSlot = TransportRegistry.getSlot(this.props.name);
            if (currentSlot) {
                currentSlot.controls.remove(child);
            }
            this._transported = this._transported.filter(c => c !== child);
        };
        this.controls.onAdd = this._onAddRef;
        this.controls.onRemove = this._onRemoveRef;


    }

    public onDisposing(sender: ComponentBase, e: EventArgs): void {
        if (this._countedLive) {
            this._countedLive = false;
            contentBlocks.live--;
        }
        const currentSlot = TransportRegistry.getSlot(this.props.name);
        for (const child of this._transported || []) {
            currentSlot?.controls.remove(child);
            child.dispose();
        }

        if (this._slotRegisteredListener) {
            Application.main.off(SLOT_REGISTERED_EVENT, this._handleSlotChange as any);
            this._slotRegisteredListener = undefined;
        }
        if (this._slotUnregisteredListener) {
            Application.main.off(SLOT_UNREGISTERED_EVENT, this._slotUnregisteredListener);
            this._slotUnregisteredListener = undefined;
        }
        if (this.controls.onAdd === this._onAddRef) this.controls.onAdd = undefined;
        if (this.controls.onRemove === this._onRemoveRef) this.controls.onRemove = undefined;
        this._onAddRef = undefined;
        this._onRemoveRef = undefined;
        this._transported = [];
    }
}