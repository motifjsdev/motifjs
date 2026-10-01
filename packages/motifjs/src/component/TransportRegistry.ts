import { ComponentBase } from "./componentBase";
import { Application } from "../";

export const SLOT_REGISTERED_EVENT = Symbol('slotRegistered');
export const SLOT_UNREGISTERED_EVENT = Symbol('slotUnregistered');

export class TransportRegistry {
    private static slots: Map<string, ComponentBase> = new Map();

    static registerSlot(name: string, slot: ComponentBase) {
        this.slots.set(name, slot);
        Application.main.fire(SLOT_REGISTERED_EVENT, { name, slot });
    }
    static unregisterSlot(name: string, slot: ComponentBase) {
        if (this.slots.get(name) === slot) {
            this.slots.delete(name);
            Application.main.fire(SLOT_UNREGISTERED_EVENT, { name, slot });
        }
    }
    static getSlot(name: string): ComponentBase | undefined {
        return this.slots.get(name);
    }
}