import { devtools, storesLeaving } from './devbus';
import { pathOf, tagOf, typeOf, isComponent, nameComponent, recordService } from './inspect';
import { countCreated, countDisposed, countRenamed } from './counters';

export function componentCreated(c: any): void {
    if (devtools() === undefined) return;
    countCreated(c);
}

export function componentNamed(fn: unknown, c: any, props?: unknown): void {
    if (devtools() === undefined || typeof fn !== 'function' || !fn.name || typeof c !== 'object' || c === null || !isComponent(c)) return;
    const before = typeOf(c);
    nameComponent(c, fn.name, props);
    countRenamed(c, before, fn.name);
}

export function serviceRequested(owner: object, token: any): void {
    if (devtools() === undefined) return;
    recordService(owner, token);
}

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

export type ComponentInfo = { path: number[] | null; type: string; tag: string };

const disposeStarts = new WeakMap<object, { info: ComponentInfo; at: number }>();

export function describe(c: any): ComponentInfo {
    return { path: pathOf(c), type: typeOf(c), tag: tagOf(c) };
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
    storesLeaving(c);
    disposeStarts.set(c, { info, at: performance.now() });
    emit('component:disposing', info);
}

export function disposeFinished(c: any): void {
    const emit = devtools();
    if (emit === undefined) return;
    countDisposed(c);
    const start = disposeStarts.get(c);
    disposeStarts.delete(c);
    emit('component:disposed', start === undefined
        ? describe(c)
        : { ...start.info, duration: performance.now() - start.at });
}
