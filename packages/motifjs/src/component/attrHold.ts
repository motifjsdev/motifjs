import { IDisposable } from "../disposable/IDisposable";

export const attrHolds: { live: number, writer: object | undefined } = { live: 0, writer: undefined };

export const NO_OWN = Symbol('no own value');
export const OWN_BELOW = Symbol('own value below');

class NoRecord extends Map<string | symbol, any> {
    set(): this {
        return this;
    }
}

export const NO_RECORD = new NoRecord();

class OwnWrite {
    value: any;
    constructor(value: any) {
        this.value = value;
    }
}

class OwnProperty {
    name: string;
    value: any;
    constructor(name: string, value: any) {
        this.name = name;
        this.value = value;
    }
}

export class HoldRecord implements IDisposable {
    attr: any;
    slots: any[];
    constructor(attr: any, slots: any[]) {
        this.attr = attr;
        this.slots = slots;
    }
    dispose(): void {
        releaseHold(this);
    }
}

const holds = new WeakMap<object, HoldRecord | HoldRecord[]>();
const NO_HOLDS: HoldRecord[] = [];
const ATTR_KEYS = new Map<string, string>([
    ['className', 'class'],
    ['htmlFor', 'for'],
    ['httpEquiv', 'http-equiv'],
    ['acceptCharset', 'accept-charset']
]);

function findSlot(hold: HoldRecord, key: string | symbol): number {
    const slots = hold.slots;
    for (let i = 0; i < slots.length; i += 3) {
        if (slots[i] === key) {
            return i;
        }
    }
    return -1;
}

function firstHold(held: HoldRecord | HoldRecord[], key: string | symbol): HoldRecord | undefined {
    if (!Array.isArray(held)) {
        return findSlot(held, key) > -1 ? held : undefined;
    }
    for (let i = 0; i < held.length; i++) {
        if (findSlot(held[i], key) > -1) {
            return held[i];
        }
    }
    return undefined;
}

function attrKeyOf(name: string): string {
    const key = ATTR_KEYS.get(name);
    if (key !== undefined) {
        return key;
    }
    if (name.length > 4 && name.startsWith('aria') && name.charCodeAt(4) >= 65 && name.charCodeAt(4) <= 90) {
        return 'aria-' + name.slice(4).toLowerCase();
    }
    return name.toLowerCase();
}

function writeHeld(attr: any, key: string | symbol, value: any): void {
    const writer = attrHolds.writer;
    attrHolds.writer = attr;
    try {
        attr._applyValue(key, value);
    } finally {
        attrHolds.writer = writer;
    }
}

function giveBack(attr: any, key: string | symbol, own: any, rest: HoldRecord[], at: number): void {
    if (own !== OWN_BELOW) {
        const next = firstHold(rest, key);
        if (next !== undefined) {
            next.slots[findSlot(next, key) + 2] = own;
        } else if (own instanceof OwnWrite) {
            attr._applyValue(key, own.value);
        } else if (own instanceof OwnProperty) {
            const el = attr._getElement();
            if (el) {
                el[own.name] = own.value;
            }
        } else if (own !== NO_OWN) {
            writeHeld(attr, key, own);
        }
        return;
    }
    for (let i = at; i < rest.length; i++) {
        if (findSlot(rest[i], key) > -1) {
            return;
        }
    }
    for (let i = at - 1; i >= 0; i--) {
        const slot = findSlot(rest[i], key);
        if (slot > -1) {
            writeHeld(attr, key, rest[i].slots[slot + 1]);
            return;
        }
    }
}

function releaseHold(hold: HoldRecord): void {
    const attr = hold.attr;
    if (attr === undefined) {
        return;
    }
    hold.attr = undefined;
    const held = holds.get(attr);
    if (held === undefined) {
        return;
    }
    const owner = attr._parent;
    if (!owner || owner.isDisposed) {
        forgetHolds(attr);
        return;
    }
    let rest = NO_HOLDS;
    let at = 0;
    if (held === hold) {
        holds.delete(attr);
        attrHolds.live--;
    } else if (Array.isArray(held)) {
        at = held.indexOf(hold);
        if (at < 0) {
            return;
        }
        held.splice(at, 1);
        rest = held;
        if (held.length === 1) {
            holds.set(attr, held[0]);
        }
    } else {
        return;
    }
    const slots = hold.slots;
    for (let i = 0; i < slots.length; i += 3) {
        giveBack(attr, slots[i], slots[i + 2], rest, at);
    }
}

export function addHold(attr: any, slots: any[]): HoldRecord {
    const hold = new HoldRecord(attr, slots);
    const held = holds.get(attr);
    if (held === undefined) {
        holds.set(attr, hold);
        attrHolds.live++;
    } else if (Array.isArray(held)) {
        held.push(hold);
    } else {
        holds.set(attr, [held, hold]);
    }
    for (let i = 0; i < slots.length; i += 3) {
        writeHeld(attr, slots[i], slots[i + 1]);
    }
    return hold;
}

export function holdsKey(attr: object, key: string | symbol): boolean {
    const held = holds.get(attr);
    return held !== undefined && firstHold(held, key) !== undefined;
}

export function keepOwn(attr: object, key: string | symbol, value: any): boolean {
    const held = holds.get(attr);
    const hold = held !== undefined ? firstHold(held, key) : undefined;
    if (hold === undefined) {
        return false;
    }
    const at = findSlot(hold, key) + 2;
    const own = hold.slots[at];
    if (own instanceof OwnWrite) {
        own.value = value;
    } else {
        hold.slots[at] = new OwnWrite(value);
    }
    return true;
}

export function keepOwnProperty(component: any, name: string, value: any): boolean {
    const attr = component._baseCtx?._attr;
    const held = attr !== undefined ? holds.get(attr) : undefined;
    if (held === undefined) {
        return false;
    }
    const key = attrKeyOf(name);
    const hold = firstHold(held, key);
    if (hold === undefined) {
        return false;
    }
    const at = findSlot(hold, key) + 2;
    const own = hold.slots[at];
    if (own instanceof OwnProperty && own.name === name) {
        own.value = value;
    } else {
        hold.slots[at] = new OwnProperty(name, value);
    }
    return true;
}

export function forgetHolds(attr: object | undefined): void {
    const held = attr !== undefined ? holds.get(attr) : undefined;
    if (attr === undefined || held === undefined) {
        return;
    }
    if (Array.isArray(held)) {
        for (const hold of held) {
            hold.attr = undefined;
        }
    } else {
        held.attr = undefined;
    }
    holds.delete(attr);
    attrHolds.live--;
}
