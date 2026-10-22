import { Application } from "../application";
import { ServiceLifetime } from "./ServiceCollection";
import { autoRegistry } from "./autoRegistry";
import { reportWarning } from "../common/diagnostics";



export function Injectable(options?: {
    lifetime?: ServiceLifetime,
    deps?: any[],
    startup?: boolean
}): (target: any, context?: ClassDecoratorContext) => void {

    return (target: any) => {
        autoRegistry.set(target, {
            lifetime: options?.lifetime ?? "transient",
            deps: options?.deps,
            startup: options?.startup
        });
    };
}



export function FromService<T>(token: (abstract new (...args: any) => T) | { prototype: T }): T | null;
export function FromService<T = any>(token: string | symbol | object): T | null;
export function FromService(token: any): any {
    try {
        return Application.main.provider.get(token);
    } catch (error) {
        reportWarning('MJX414', [describeServiceToken(token), String((error as any)?.message ?? error)], { token, error });
        return null as any;
    }
}

function describeServiceToken(token: any): string {
    if (typeof token === 'function') return token.name || '[AnonymousClass]';
    return String(token);
}
