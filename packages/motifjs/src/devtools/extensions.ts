import { pathOf } from './inspect';

export type DevtoolsExtension = {
    describe?: () => unknown;
    inspect?: (component: object) => unknown;
};
export type DevtoolsExtensionHandle = {
    emit(type: string, payload?: unknown): void;
    pathOf(component: object): number[] | null;
    dispose(): void;
};

const extensions = new Map<string, DevtoolsExtension>();
let emitter: () => ((type: string, payload?: any) => void) | undefined = () => undefined;

export function bindExtensionEmitter(fn: typeof emitter): void { emitter = fn; }

export function registerDevtools(name: string, extension: DevtoolsExtension): DevtoolsExtensionHandle {
    extensions.set(name, extension);
    return {
        emit(type, payload) { emitter()?.('ext:' + name + ':' + type, payload); },
        pathOf(component) { return pathOf(component); },
        dispose() { if (extensions.get(name) === extension) extensions.delete(name); },
    };
}

const safely = (fn: () => unknown): unknown => {
    try { return fn(); } catch (error) { return { error: String((error as any)?.message ?? error) }; }
};

export function getExtensions(): string[] { return [...extensions.keys()]; }

export function readExtension(name: string): unknown {
    const ext = extensions.get(name);
    return ext?.describe ? safely(() => ext.describe!()) : undefined;
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
