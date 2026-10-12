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

export type ComponentInfo = { path: number[] | null; type: string; tag: string };

const disposeStarts = new WeakMap<object, { info: ComponentInfo; at: number }>();

export function describe(c: any): ComponentInfo {
    const n = c.element as Node | null;
    const tag = !n ? '' : n.nodeType === 8 ? '#fragment' : n.nodeType === 3 ? '#text' : String(n.nodeName).toLowerCase();
    return { path: pathOf(c), type: c.constructor?.name ?? '', tag };
}

export function componentEvent(type: string, c: any, extra?: object): void {
    const emit = devtools();
    if (emit === undefined) return;
    emit(type, extra === undefined ? describe(c) : { ...describe(c), ...extra });
}

export function buildStarted(): number {
    return devtools() === undefined ? -1 : performance.now();
}

export function buildFinished(c: any, at: number): void {
    if (at < 0) return;
    componentEvent('component:built', c, { duration: performance.now() - at });
}

export function disposeStarted(c: any): void {
    const emit = devtools();
    if (emit === undefined) return;
    const info = describe(c);
    disposeStarts.set(c, { info, at: performance.now() });
    emit('component:disposing', info);
}

export function disposeFinished(c: any): void {
    const emit = devtools();
    if (emit === undefined) return;
    const start = disposeStarts.get(c);
    disposeStarts.delete(c);
    emit('component:disposed', start === undefined
        ? describe(c)
        : { ...start.info, duration: performance.now() - start.at });
}
