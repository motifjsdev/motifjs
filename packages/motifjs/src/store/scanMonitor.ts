import { reportWarning } from "../common/diagnostics";
import { isDevLike } from "../devtools/devbus";
import { effectOwnerKind } from "../devtools/reactivity";
import { trackingEffect } from "./reactivity-core";

type Group = { members: Set<object>; method: string; owned: boolean };
type ListRecord = { list: unknown[]; groups: Map<string, Group>; warned: boolean; pending: boolean };
type Membership = { record: ListRecord; key: string; member: object };

const MAX_SCAN_WARNINGS = 10;
const OWNED_LIMIT = 2;
const UNOWNED_LIMIT = 8;
const lists = new WeakMap<object, ListRecord>();
const memberships = new WeakMap<object, Membership[]>();
const dirty: ListRecord[] = [];
let flushQueued = false;
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
    const owner = effectOwnerKind(effect);
    if (owner.key === '') return;
    let record = lists.get(list);
    if (record === undefined) lists.set(list, record = { list, groups: new Map(), warned: false, pending: false });
    if (record.warned) return;
    let group = record.groups.get(owner.key);
    if (group === undefined) record.groups.set(owner.key, group = { members: new Set(), method, owned: owner.owner !== null });
    const member = owner.owner ?? effect;
    if (group.members.has(member)) return;
    group.members.add(member);
    group.method = method;
    let owned = memberships.get(effect);
    if (owned === undefined) memberships.set(effect, owned = []);
    owned.push({ record, key: owner.key, member });
    if (record.pending) return;
    record.pending = true;
    dirty.push(record);
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(judge);
}

function judge(): void {
    flushQueued = false;
    const records = dirty.splice(0);
    for (const record of records) {
        record.pending = false;
        if (record.warned || scanWarnings >= MAX_SCAN_WARNINGS) continue;
        for (const [key, group] of record.groups) {
            const instances = group.members.size;
            if (instances < (group.owned ? OWNED_LIMIT : UNOWNED_LIMIT) || record.list.length < instances) continue;
            record.warned = true;
            scanWarnings++;
            const who = group.owned ? `${instances} instances of ${key}` : `${instances} effects (${key})`;
            reportWarning('MJX210', [group.method, record.list.length, who]);
            break;
        }
    }
}

export function scanEffectStopped(effect: object): void {
    const owned = memberships.get(effect);
    if (owned === undefined) return;
    memberships.delete(effect);
    for (const { record, key, member } of owned) record.groups.get(key)?.members.delete(member);
}
