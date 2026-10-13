import { componentAt, preview, functionPropsOf } from './inspect';
import { BLOCKED_KEYS, type WriteResult } from './writes';

const LIMIT = 100;

function child(v: any, key: string): { found: boolean; getter?: boolean; value?: any } {
    if (v instanceof Map) {
        for (const [k, x] of v) if (String(k) === key) return { found: true, value: x };
        return { found: false };
    }
    if (v instanceof Set) {
        const i = Number(key);
        const arr = [...v];
        return Number.isInteger(i) && i >= 0 && i < arr.length ? { found: true, value: arr[i] } : { found: false };
    }
    const d = Object.getOwnPropertyDescriptor(v, key);
    if (!d) return { found: false };
    return 'value' in d ? { found: true, value: d.value } : { found: true, getter: true };
}

function entriesOf(v: any): { key: string; value: unknown; getter?: true }[] {
    if (v instanceof Map) return [...v].map(([k, x]) => ({ key: String(k), value: preview(x) }));
    if (v instanceof Set) return [...v].map((x, i) => ({ key: String(i), value: preview(x) }));
    return Object.keys(v).map(k => {
        const d = Object.getOwnPropertyDescriptor(v, k)!;
        return 'value' in d ? { key: k, value: preview(d.value) } : { key: k, value: null, getter: true as const };
    });
}

export function readValue(path: number[], source: 'props' | 'functionProps', keys: string[]): WriteResult {
    const c = componentAt(path);
    if (c === null) return { ok: false, error: 'no component at path' };
    if (!Array.isArray(keys) || keys.some(k => BLOCKED_KEYS.has(String(k)))) return { ok: false, error: 'invalid key' };
    let v: any = source === 'functionProps' ? functionPropsOf(c) : c.props;
    if (v === undefined || v === null) return { ok: false, error: `no ${source}` };
    for (const k of keys) {
        if (v === null || typeof v !== 'object') return { ok: false, error: 'not an object' };
        const step = child(v, String(k));
        if (!step.found) return { ok: false, error: 'missing key' };
        if (step.getter) return { ok: false, error: 'getter' };
        v = step.value;
    }
    if (v === null || typeof v !== 'object') return { ok: true, value: { value: preview(v), entries: [], total: 0 } };
    const all = entriesOf(v);
    return { ok: true, value: { value: preview(v), entries: all.slice(0, LIMIT), total: all.length } };
}
