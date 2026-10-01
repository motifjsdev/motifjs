import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';


export interface MotifDiagnostic {
    code: string;
    message: string;
    file: string;
    line: number | null;
    frame?: string;
}

let active: MotifDiagnostic[] | null = null;
let seen: Set<string> | null = null;

export function beginCollect(): void {
    active = [];
    seen = new Set();
}

export function endCollect(): MotifDiagnostic[] {
    const out = active ?? [];
    active = null;
    seen = null;
    return out;
}

/** Uyarıları terminale yazar. Vite/Rollup eklentileri derleme sonunda çağırır. */
export function printDiagnostics(list: MotifDiagnostic[]): void {
    for (const d of list) {
        const where = d.line === null ? d.file : `${d.file}:${d.line}`;
        console.warn(`[motifjs] ${d.code}: ${d.message}\n    ${where}${d.frame ? '\n' + d.frame : ''}`);
    }
}

export function fail(code: string, message: string, path: NodePath<t.Node>): never {
    const error = path.buildCodeFrameError(`[motifjs] ${code}: ${message}`) as Error & { code?: string };
    error.code = code;
    throw error;
}

export function warn(code: string, message: string, path: NodePath<t.Node> | null, filename: string): void {
    if (!active || !seen) return;
    const line = path?.node?.loc?.start?.line ?? null;
    const key = `${filename}:${line}:${code}`;
    if (seen.has(key)) return;
    seen.add(key);

    let frame: string | undefined;
    try {
        frame = path ? (path.buildCodeFrameError('') as Error).message.replace(/^[^\n]*\n/, '') : undefined;
        if (frame !== undefined && frame.trim() === '') frame = undefined;
    } catch { frame = undefined; }

    active.push({ code, message, file: filename, line, frame });
}