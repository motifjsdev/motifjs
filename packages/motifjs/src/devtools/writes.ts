import { componentAt, treeRoots } from './inspect';

export type WriteResult = { ok: true; value?: unknown } | { ok: false; error: string };

export const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const fail = (error: string): WriteResult => ({ ok: false, error });
const message = (error: unknown) => String((error as any)?.message ?? error);

function at(path: number[]): any {
    const c = componentAt(path);
    return c === null || c.isDisposed ? null : c;
}

export function setClass(path: number[], name: string, on: boolean): WriteResult {
    const c = at(path);
    if (c === null) return fail('no component at path');
    try {
        if (on) c.class.add(name); else c.class.remove(name);
        return { ok: true, value: c.class.has(name) };
    } catch (error) { return fail(message(error)); }
}

export function setAttribute(path: number[], name: string, value: string | null): WriteResult {
    const c = at(path);
    if (c === null) return fail('no component at path');
    if (/^on/i.test(name)) return fail('event attributes are not written');
    try {
        if (value === null) c.attr.remove(name); else c.attr.add({ [name]: String(value) });
        return { ok: true };
    } catch (error) { return fail(message(error)); }
}

export async function setVisible(path: number[], visible: boolean): Promise<WriteResult> {
    const c = at(path);
    if (c === null) return fail('no component at path');
    if (path.length === 1) return fail('a root is placed by the page and cannot be hidden');
    try {
        await (visible ? c.motif.show() : c.motif.hide());
        return { ok: true, value: !!c.isVisible };
    } catch (error) { return fail(message(error)); }
}

export function writeModel(path: number[], value: unknown): WriteResult {
    const c = at(path);
    if (c === null) return fail('no component at path');
    if (c._bindings === undefined) return fail('no model binding');
    try {
        return c.bindings.writeModel(value) ? { ok: true } : fail('no model binding');
    } catch (error) { return fail(message(error)); }
}

export function setProp(path: number[], keys: string[], value: unknown): WriteResult {
    const c = at(path);
    if (c === null) return fail('no component at path');
    if (!Array.isArray(keys) || keys.length === 0 || keys.some(k => BLOCKED_KEYS.has(String(k)))) return fail('invalid key');
    let target = c.props;
    if (target === null || typeof target !== 'object') return fail('no props');
    try {
        for (const k of keys.slice(0, -1)) {
            target = target[k];
            if (target === null || typeof target !== 'object') return fail('path not found');
        }
        target[keys[keys.length - 1]] = value;
        c.setState();
        return { ok: true };
    } catch (error) { return fail(message(error)); }
}

export async function navigate(uri: string): Promise<WriteResult> {
    const router = treeRoots()[0]?.application?.router;
    if (!router) return fail('no router');
    try {
        const r = await router.navigate(uri);
        return { ok: true, value: r?.ok ?? null };
    } catch (error) { return fail(message(error)); }
}
