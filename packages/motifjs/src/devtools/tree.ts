import { devtools } from './devbus';

const dirty = new Set<any>();
let scheduled = false;

export function treeChanged(owner: any): void {
    if (devtools() === undefined) return;
    dirty.add(owner);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flushTree);
}

function flushTree(): void {
    scheduled = false;
    const owners = Array.from(dirty);
    dirty.clear();
    const emit = devtools();
    if (emit === undefined) return;
    const parents: number[][] = [];
    for (const o of owners) {
        if (o.isDisposed) continue;
        const p = pathOf(o);
        if (p !== null) parents.push(p);
    }
    if (parents.length > 0) emit('tree:changed', { parents });
}

export function pathOf(c: any): number[] | null {
    const path: number[] = [];
    let cur = c;
    while (cur.parent) {
        const i = cur.parent._controls?.items.indexOf(cur) ?? -1;
        if (i < 0) return null;
        path.push(i);
        cur = cur.parent;
    }
    return path.reverse();
}
