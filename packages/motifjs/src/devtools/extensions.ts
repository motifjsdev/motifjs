import { pathOf } from './inspect';
import type { DevtoolsResult } from './types';

export type DevtoolsCapabilities = { read?: boolean; subscribe?: boolean; write?: boolean };
export type DevtoolsPanel = { id: string; title: string; icon?: string; order?: number; capabilities?: DevtoolsCapabilities; [key: string]: unknown };
export type DevtoolsSource = {
    read: (params: any) => unknown;
    key?: string;
    events?: Record<string, 'upsert' | 'append' | 'remove' | 'refresh'>;
    max?: number;
};
export type DevtoolsReveal = { panel: string; route?: string; params?: Record<string, unknown>; state?: Record<string, unknown> };

export type DevtoolsExtension = {
    describe?: () => unknown;
    inspect?: (component: object) => unknown;
    sources?: Record<string, DevtoolsSource>;
    commands?: Record<string, (args: any) => unknown>;
    panels?: DevtoolsPanel[] | (() => DevtoolsPanel[]);
};
export type DevtoolsExtensionHandle = {
    emit(type: string, payload?: unknown): void;
    pathOf(component: object): number[] | null;
    changed(source?: string): void;
    reveal(target: DevtoolsReveal): void;
    dispose(): void;
};

const extensions = new Map<string, DevtoolsExtension>();
let emitter: () => ((type: string, payload?: any) => void) | undefined = () => undefined;

export function bindExtensionEmitter(fn: typeof emitter): void { emitter = fn; }

export function registerDevtools(name: string, extension: DevtoolsExtension): DevtoolsExtensionHandle {
    extensions.set(name, extension);
    emitter()?.('extension:registered', { name });
    const current = () => extensions.get(name) === extension;
    return {
        emit(type, payload) {
            const send = emitter();
            if (send !== undefined && subscribed(extension)) send('ext:' + name + ':' + type, payload);
        },
        pathOf(component) { return pathOf(component); },
        changed(source) { if (current()) emitter()?.('extension:changed', source === undefined ? { name } : { name, source }); },
        reveal(target) { if (current()) emitter()?.('extension:reveal', { name, target }); },
        dispose() {
            if (!current()) return;
            extensions.delete(name);
            emitter()?.('extension:disposed', { name });
        },
    };
}

const safely = (fn: () => unknown): unknown => {
    try { return fn(); } catch (error) { return { error: String((error as any)?.message ?? error) }; }
};

const fail = (error: string): DevtoolsResult => ({ ok: false, error });
const message = (error: unknown) => String((error as any)?.message ?? error);
const own = <T>(record: Record<string, T> | undefined, key: string): T | undefined => record !== undefined && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

function panelsOf(ext: DevtoolsExtension): DevtoolsPanel[] {
    const list = typeof ext.panels === 'function' ? (ext as { panels(): DevtoolsPanel[] }).panels() : ext.panels;
    return Array.isArray(list) ? list : [];
}

function allows(ext: DevtoolsExtension, capability: keyof DevtoolsCapabilities, panel?: string): boolean {
    try { return panelsOf(ext).some(p => (panel === undefined || p.id === panel) && p.capabilities?.[capability] === true); } catch { return false; }
}

// panels vermeyen kayıtlar olaylarını eskisi gibi hep gönderir
const subscribed = (ext: DevtoolsExtension) => ext.panels === undefined || allows(ext, 'subscribe');

export function getExtensions(): string[] { return [...extensions.keys()]; }

export function readExtension(name: string): unknown {
    const ext = extensions.get(name);
    return ext?.describe ? safely(() => ext.describe!()) : undefined;
}

export function readExtensionPanels(name: string): DevtoolsResult {
    const ext = extensions.get(name);
    if (ext === undefined) return fail('no extension');
    try {
        const sources: Record<string, Omit<DevtoolsSource, 'read'>> = {};
        for (const [key, s] of Object.entries(ext.sources ?? {})) sources[key] = { key: s.key, events: s.events, max: s.max };
        return { ok: true, value: { panels: panelsOf(ext), sources, commands: Object.keys(ext.commands ?? {}) } };
    } catch (error) { return fail(message(error)); }
}

export async function readExtensionSource(name: string, panel: string, source: string, params: unknown): Promise<DevtoolsResult> {
    const ext = extensions.get(name);
    if (ext === undefined) return fail('no extension');
    if (!allows(ext, 'read', panel)) return fail('not allowed');
    const s = own(ext.sources, source);
    if (typeof s?.read !== 'function') return fail('no source');
    try { return { ok: true, value: await s.read(params) }; } catch (error) { return fail(message(error)); }
}

export async function callExtension(name: string, panel: string, command: string, args: unknown): Promise<DevtoolsResult> {
    const ext = extensions.get(name);
    if (ext === undefined) return fail('no extension');
    if (!allows(ext, 'write', panel)) return fail('not allowed');
    const run = own(ext.commands, command);
    if (typeof run !== 'function') return fail('no command');
    try { return { ok: true, value: await run.call(ext.commands, args) }; } catch (error) { return fail(message(error)); }
}

export function inspectExtensions(c: object): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, ext] of extensions) {
        if (!ext.inspect) continue;
        const v = safely(() => ext.inspect!(c));
        if (v !== undefined) out[name] = v;
    }
    return out;
}
