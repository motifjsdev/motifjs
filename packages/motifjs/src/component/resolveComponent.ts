import { ComponentBase } from "./componentBase";
import { reportError } from "../common/diagnostics";

const MAX_FACTORY_DEPTH = 100;

export function resolveComponent(input: unknown, props?: any): any {
    let current: any = input;
    let depth = 0;
    while (typeof current === "function") {
        if (current.prototype instanceof ComponentBase) {
            return new current(props);
        }
        if (++depth > MAX_FACTORY_DEPTH) {
            reportError('MJX112', undefined, MAX_FACTORY_DEPTH);
            return current;
        }
        current = current(props);
    }
    return current;
}