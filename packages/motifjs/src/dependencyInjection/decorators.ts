import { Application, ServiceLifetime } from "..";
import { autoRegistry } from "./autoRegistry";
import { reportWarning } from "../common/diagnostics";



export function Injectable(options?: {
    lifetime?: ServiceLifetime,
    deps?: any[]
}): (target: any, context?: ClassDecoratorContext) => void {

    return (target: any) => {
        autoRegistry.set(target, {
            lifetime: options?.lifetime ?? "transient",
            deps: options?.deps
        });
    };
}



export function FromService<T>(token: abstract new (...args: any[]) => T): T;
export function FromService<T = any>(token: string | symbol | object): T;
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
