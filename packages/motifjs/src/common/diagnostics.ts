import { errorHandler } from "./ErrorHandler";
import { warn as devWarn } from "../devtools/devbus";

export const motifMessages = {
    MJX101: (tag: string) => `dom.createElement('${tag}'): no document is available (no DOM environment).`,
    MJX102: (description: string) => `Invalid element selector "${description}".`,
    MJX103: (tag: string) => `dom.createElementNS('${tag}') failed.`,
    MJX104: () => `Skipped inserting a component into the DOM because it contains its own parent.`,
    MJX105: () => `Applying router link classes failed.`,
    MJX106: () => `The placeholder parent changed; rebuilding the component.`,
    MJX107: () => `Disposing a child component failed.`,
    MJX108: () => `Component is disposed; the result of doWork was discarded.`,
    MJX109: () => `A content block child was removed because its content body is being disposed.`,
    MJX110: (ms: number) => `Lazy timeout: the component did not load within ${ms} ms.`,
    MJX111: () => `Lazy aborted: loading the component was cancelled.`,
    MJX112: (depth: number) => `resolveComponent: the factory chain exceeded ${depth} levels; a factory may be returning itself.`,
    MJX113: () => `The transport slot has no parent; mount the slot before transporting into it.`,
    MJX114: () => `Placing the navigation target into its host failed.`,
    MJX115: () => `Disposing the previous navigation target failed.`,
    MJX116: (ms: number) => `Timeout: the listener guard did not settle within ${ms} ms.`,
    MJX117: () => `Detaching a control failed.`,
    MJX118: () => `The onRemove callback failed while detaching a control.`,
    MJX119: () => `Moving a fragment's DOM range stopped: its end marker was not found (possible infinite loop).`,
    MJX120: () => `Scanning a fragment's DOM range stopped: its end marker was not found (possible infinite loop).`,
    MJX121: (compiled: number, runtime: number) => `This code was compiled for compiler contract ${compiled}, but the @motifx/core runtime implements contract ${runtime}. Install matching versions of @motifx/compiler and @motifx/core, and rebuild packages that ship compiled JSX.`,
    MJX122: (hook: string) => `The component ${hook} hook threw.`,
    MJX123: (event: string) => `The '${event}' event handler threw.`,
    MJX124: (key: string) => `A spread object on a DOM tag cannot set ${key}; the key was ignored. Write it on the tag, or use x-html, for HTML you trust.`,
    MJX125: (key: string) => `A spread object on a DOM tag cannot set a javascript: URL on '${key}'; the value was ignored. Write the attribute on the tag if it is intended.`,
    MJX126: () => `Lazy: loading the component failed and no Fallbackview is set; the host was cleared.`,
    MJX127: (got: string) => got === 'module'
        ? `The loaded module has no default export. Export the component as default, or map it: () => import('./X').then(m => m.X).`
        : `The loaded value is not a component (got ${got}). Return a component class, a function component, an Options API factory or a component instance.`,
    MJX128: (cls: string, member: string, how: 'method' | 'field' | 'replaced') => how === 'method'
        ? `${cls} overrides ${member} without calling super.${member}; MotifJS relies on this ComponentBase member. Rename your member, or call super.${member} in the override.`
        : how === 'field'
            ? `${cls} defines '${member}' as an instance field, which hides the ComponentBase member MotifJS relies on. Rename your field.`
            : `${cls} replaces '${member}', which MotifJS created for the component (a class field or an assignment with that name). Rename your member.`,

    MJX201: () => `ListBinding: renderFn must return a component instance, a component class, or a factory function.`,
    MJX202: (key: unknown, index: number) => `ListBinding: duplicate key "${String(key)}" at index ${index}. Rows are matched by the item object, not by key, so rendering is not affected; keep keys unique so they identify items.`,
    MJX203: (max: number) => `An effect ran ${max} times in one flush and keeps triggering itself; it is skipped for the rest of this flush. It probably writes a value it reads (for example state.n++). Wrap the write in untracked(...).`,
    MJX204: () => `A component reached a text binding and was not written to the DOM. For a template prop that can change later, write a getter: {() => props.tpl}. Templates that are ready at setup also work as {props.tpl}.`,
    MJX205: () => `Virtualization: the watch callback threw.`,
    MJX206: () => `Virtualization: autoRefresh stopped; dataRequest may be changing the reactive data it reads on every refresh.`,
    MJX207: () => `Virtualization: loading data failed.`,
    MJX208: () => `An effect threw.`,

    MJX301: (outlet: string, ms: number) => `RouterView outlet '${outlet}' was not built within ${ms} ms, so the route chain cannot be mounted. Does the layout component render a <RouterView>?`,
    MJX302: (name: string) => `Named route '${name}' was not found.`,
    MJX303: (chain: string) => `Redirect loop or too many redirects: ${chain}`,
    MJX304: () => `Route execution failed.`,
    MJX305: () => `The error fallback route failed.`,
    MJX306: (hook: string) => `The ${hook} hook threw.`,
    MJX307: () => `Disposing a route component failed.`,
    MJX308: () => `The stack navigation transition failed.`,
    MJX309: () => `Router is not initialized. Call useRouter() before navigating.`,
    MJX310: (parentPath: string) => `Route path cannot be empty; use '/' for the default child. Under parent "${parentPath}".`,
    MJX311: (path: string, parentPath: string) => `Child route path should start with '/': "${path}" under parent "${parentPath}".`,
    MJX312: (full: string) => `Child route path resolves to the same full path as its parent: "${full}".`,
    MJX313: (full: string) => `Multiple routes resolve to the same full path: "${full}".`,
    MJX314: (alias: string, parentPath: string) => `Child route alias should start with '/': "${alias}" under parent "${parentPath}".`,
    MJX315: (alias: string) => `Route alias resolves to the route's own path: "${alias}".`,
    MJX316: (alias: string) => `Multiple routes use the same alias: "${alias}".`,

    MJX401: (token: string) => `Service not registered for token: ${token}`,
    MJX402: (token: string) => `Async factory used with get() for token ${token}; use getAsync().`,
    MJX403: () => `Invalid service descriptor.`,
    MJX404: (chain: string) => `Cyclic dependency detected: ${chain}`,
    MJX405: () => `Only one ApplicationBuilder instance is allowed.`,
    MJX406: (selector: string) => `Application.run: host not found for selector: ${selector}`,
    MJX407: (token: string) => `getService: no ServiceProvider found for token '${token}'.`,
    MJX408: (token: string, reason: string) => `getService failed for token '${token}': ${reason}`,
    MJX409: (token: string) => `inject(${token}) was called outside a service construction; call it in a field initializer or constructor of a class the ServiceProvider creates.`,
    MJX410: (token: string, sources: string) => `Multiple sources provided for token '${token}': ${sources}. Resolution order is useValue > useFactory > useClass.`,
    MJX411: (token: string) => `'deps' must be an array for token '${token}'; the invalid deps are ignored.`,
    MJX413: (token: string) => `Service '${token}' is registered with a function that cannot be constructed. Use { useValue: fn } to provide the function itself or { useFactory: fn } to create the service.`,
    MJX414: (token: string, reason: string) => `FromService failed for token '${token}': ${reason}`,

    MJX501: () => `Disposable already disposed.`,
    MJX502: () => `Cannot register a disposable on itself.`,
    MJX503: () => `Errors were thrown while disposing a store.`,
    MJX504: () => `A disposable was added to a DisposableStore that is already disposed; the added object will leak.`,
    MJX505: () => `Cannot dispose a disposable on itself.`,
    MJX507: (name: string, limit: number, count: number) => `[${name}] potential listener LEAK: ${limit} listeners already; most frequent stack (${count}):`,

    MJX601: () => `Sequence contains no elements.`,
    MJX602: () => `Circuit is open.`,
    MJX603: () => `Bulkhead queue is full.`,
    MJX604: () => `Rate limit exceeded.`,
    MJX605: () => `Operation timed out.`,
    MJX607: () => `A history must be created with at least one entry.`,
    MJX608: () => `Method not implemented.`,
    MJX609: () => `OperationRunner: the operation threw.`,
    MJX610: () => `Matching the request path failed.`,
    MJX611: () => `The devtools panel failed to load.`,
} satisfies Record<string, (...args: any[]) => string>;

export type MotifErrorCode = keyof typeof motifMessages;
type MessageArgs<C extends MotifErrorCode> = Parameters<(typeof motifMessages)[C]>;

export class MotifError extends Error {
    readonly code: MotifErrorCode;

    constructor(code: MotifErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'MotifError';
        this.code = code;
    }
}

export function formatMotifMessage<C extends MotifErrorCode>(code: C, ...args: MessageArgs<C>): string {
    return `[motifjs] ${code}: ${(motifMessages[code] as (...a: any[]) => string)(...args)}`;
}

export function motifError<C extends MotifErrorCode>(code: C, ...args: MessageArgs<C>): MotifError {
    return new MotifError(code, formatMotifMessage(code, ...args));
}

export function reportError<C extends MotifErrorCode>(code: C, cause: unknown, ...args: MessageArgs<C>): void {
    errorHandler.report(new MotifError(code, formatMotifMessage(code, ...args), { cause }));
}

export function callReported<C extends MotifErrorCode>(fn: () => unknown, code: C, ...args: MessageArgs<C>): void {
    try {
        const result: any = fn();
        if (result && typeof result.then === 'function') {
            result.then(undefined, (error: unknown) => reportError(code, error, ...args));
        }
    } catch (error) {
        reportError(code, error, ...args);
    }
}

export function reportWarning<C extends MotifErrorCode>(code: C, args: MessageArgs<C>, details?: unknown): void {
    devWarn(code, (motifMessages[code] as (...a: any[]) => string)(...args), details);
}
