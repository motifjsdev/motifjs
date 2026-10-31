import { devtools } from './devbus';
import { message } from './writes';
import { reportWarning } from '../common/diagnostics';

export type DevtoolsOperationInfo = { kind: string; name?: string; data?: unknown };
export type DevtoolsOperation = DevtoolsOperationInfo & { readonly id: number; readonly parent?: number };

let current: DevtoolsOperation | null = null;
let lastId = 0;
const startedAt = new WeakMap<DevtoolsOperation, number>();
const ended = new WeakSet<DevtoolsOperation>();
const warned = new WeakSet<DevtoolsOperation>();

export function currentOperation(): DevtoolsOperation | null { return current; }

export function startOperation(info: DevtoolsOperationInfo): DevtoolsOperation {
    const id = ++lastId;
    const operation: DevtoolsOperation = current === null
        ? { kind: info.kind, name: info.name, data: info.data, id }
        : { kind: info.kind, name: info.name, data: info.data, id, parent: current.id };
    const emit = devtools();
    if (emit !== undefined) {
        startedAt.set(operation, performance.now());
        emit('operation:started', operation);
    }
    return operation;
}

export function resumeOperation<T>(operation: DevtoolsOperation | null, fn: () => T): T {
    /* @DEV-ONLY */ if (operation !== null && ended.has(operation) && !warned.has(operation)) warnEnded(operation);
    const previous = current;
    current = operation;
    try { return fn(); } finally { current = previous; }
}

export function endOperation(operation: DevtoolsOperation, error?: unknown): void {
    const at = startedAt.get(operation);
    if (at === undefined) return;
    startedAt.delete(operation);
    ended.add(operation);
    const duration = performance.now() - at;
    devtools()?.('operation:finished', error === undefined ? { id: operation.id, duration } : { id: operation.id, duration, error: message(error) });
}

export function runOperation<T>(info: DevtoolsOperationInfo, fn: () => T): T {
    const operation = startOperation(info);
    let result: T;
    try {
        result = resumeOperation(operation, fn);
    } catch (error) {
        endOperation(operation, error);
        throw error;
    }
    // devtools kapalıyken bitişi izleyen kimse yok; işlevin kendi sonucu döner
    if (startedAt.has(operation) && typeof (result as any)?.then === 'function') {
        return (result as unknown as PromiseLike<T>).then(value => { endOperation(operation); return value; }, error => { endOperation(operation, error); throw error; }) as unknown as T;
    }
    endOperation(operation);
    return result;
}

function warnEnded(operation: DevtoolsOperation): void {
    warned.add(operation);
    reportWarning('MJX211', [operation.id, operation.kind, operation.name ?? '']);
}
