import { devtools } from './devbus';
import { currentOperation } from './operations';

export type DevtoolsWrite = { target: object; operationId?: number } & (
    | { kind: 'add'; key: unknown; value: unknown }
    | { kind: 'update'; key: unknown; previous: unknown; value: unknown }
    | { kind: 'delete'; key: unknown; previous: unknown }
    | { kind: 'clear'; removed: unknown[] }
    | { kind: 'splice'; method: string; index: number; removed: unknown[]; added: unknown[] }
    | { kind: 'mutate' }
);

const listeners = new Set<(write: DevtoolsWrite) => void>();
let reporting = false;

export function onWrite(listener: (write: DevtoolsWrite) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function watching(): boolean { return !reporting && listeners.size > 0 && devtools() !== undefined; }

export function wrote(write: DevtoolsWrite): void {
    const operation = currentOperation();
    if (operation !== null) write.operationId = operation.id;
    // dinleyicinin kendi yazmaları bildirilmez, yoksa kendini besleyen bir döngü olur
    reporting = true;
    try {
        for (const listener of listeners) {
            try { listener(write); } catch { }
        }
    } finally {
        reporting = false;
    }
}

// setter'ın tek bildirim noktası: kısalan length bir splice, yeni anahtar add, değişen değer update
export function reportSet(target: object, key: unknown, hadKey: boolean, previous: unknown, value: unknown, cut: unknown[] | null): void {
    if (cut !== null) wrote({ target, kind: 'splice', method: 'length', index: (target as unknown[]).length, removed: cut, added: [] });
    else if (!hadKey) wrote({ target, kind: 'add', key, value });
    else if (!Object.is(previous, value)) wrote({ target, kind: 'update', key, previous, value });
}
