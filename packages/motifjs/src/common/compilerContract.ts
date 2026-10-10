import { reportWarning } from "./diagnostics";
import { isDevLike } from "../devtools/devbus";

export const COMPILER_CONTRACT = 2;
const SUPPORTED_CONTRACTS: readonly number[] = [1, 2];

const reported = new Set<number>();
const pending = new Set<number>();

export function motifCompiled(contract: number): void {
    if (SUPPORTED_CONTRACTS.includes(contract) || reported.has(contract)) return;
    if (!isDevLike()) {
        pending.add(contract);
        return;
    }
    pending.delete(contract);
    reported.add(contract);
    reportWarning('MJX121', [contract, COMPILER_CONTRACT]);
}

export function flushCompilerContractWarnings(): void {
    for (const contract of Array.from(pending)) motifCompiled(contract);
}
