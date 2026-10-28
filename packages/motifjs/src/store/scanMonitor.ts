import { reportWarning } from "../common/diagnostics";
import { isDevLike } from "../devtools/devbus";
import { effectOwnerKind } from "../devtools/reactivity";
import { trackingEffect } from "./reactivity-core";

type ListRecord = { groups: Map<string, Set<object>>; warned: boolean };

const MAX_SCAN_WARNINGS = 10;
const OWNED_LIMIT = 2;
const UNOWNED_LIMIT = 8;
const lists = new WeakMap<object, ListRecord>();
const records = new WeakMap<object, Set<ListRecord>>();
let enabled = true;
let scanWarnings = 0;

export function configureScanMonitor(on: boolean): void {
    enabled = on;
    scanWarnings = 0;
}

export function scanObserved(list: unknown[], method: string): void {
    if (!enabled || scanWarnings >= MAX_SCAN_WARNINGS || !isDevLike()) return;
    const effect = trackingEffect();
    if (effect === null) return;
    let record = lists.get(list);
    if (record === undefined) lists.set(list, record = { groups: new Map(), warned: false });
    if (record.warned) return;
    const owner = effectOwnerKind(effect);
    let group = record.groups.get(owner.key);
    if (group === undefined) record.groups.set(owner.key, group = new Set());
    if (group.has(effect)) return;
    group.add(effect);
    let owned = records.get(effect);
    if (owned === undefined) records.set(effect, owned = new Set());
    owned.add(record);
    if (group.size < (owner.owned ? OWNED_LIMIT : UNOWNED_LIMIT)) return;
    record.warned = true;
    scanWarnings++;
    reportWarning('MJX210', [method, list.length, group.size, owner.key], { fn: String((effect as { fn: unknown }).fn).slice(0, 200) });
}

export function scanEffectStopped(effect: object): void {
    const owned = records.get(effect);
    if (owned === undefined) return;
    records.delete(effect);
    for (const record of owned) for (const group of record.groups.values()) group.delete(effect);
}
