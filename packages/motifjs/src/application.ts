import { ServiceCollection } from "./dependencyInjection/ServiceCollection";
import { ServiceProvider } from "./dependencyInjection/ServiceProvider";
import { Component } from "./component/Component";
import { RouteItem } from "./routing/RouteItem";
import { ensureDevtoolsFlagInitialized, setRoutes, setDevtoolsEnabled, isEnabled as isDevtoolsEnabled } from "./devtools/devbus";
import { lintRoutes } from "./devtools/routeLinter";
import { initOverlayIfEnabled, initDevtoolsButton } from "./devtools/overlay";
import { RouterView } from "./routing/RouterView";
import { UrlRoutingModule } from "./routing/UrlRoutingModule";
import { RouterState, createRouter } from "./routing/routerState";
import { NavigationDirection, NavigationOptions, Router, RouteResolveContext, RouterNavigatedEventArgs, RouterEvents, RouterOptions, ScrollMemoryOptions, StackOptions } from "./routing";
import { errorHandler, safeCall, safeCallSilent, setErrorConsoleLogging } from "./common/ErrorHandler";
import { engine, configureReactivityLeakMonitor } from "./store";
import { MotifError, callReported, formatMotifMessage, motifError, reportError } from "./common/diagnostics";
import { flushCompilerContractWarnings } from "./common/compilerContract";
import { isTransitionMode, transitionSettings, TransitionMode } from "./common/transitionRegistry";
import { ComponentBase } from "./component";
export interface IStartup {
    configuration?: (services: any) => void;

}

let _globalApplication: Application | null = null;

export type ApplicationState = 'initializing' | 'running' | 'disposing' | 'disposed';
let _globalBuilder: ApplicationBuilder | null = null;
let startedApplicationBuilder = false;
const _applicationStack = new Map<string | symbol, { builder: ApplicationBuilder, app: Application }>();

export class ApplicationBuilder {

    public services: ServiceCollection = new ServiceCollection();

    constructor() {
        if ((_globalApplication && _globalApplication.state !== 'disposing') || startedApplicationBuilder) {
            throw new MotifError('MJX405', formatMotifMessage('MJX405'), { cause: _globalApplication });
        }
        startedApplicationBuilder = true;
    }

    build() {
        // if (_globalApplication) {
        //     throw new Error("ApplicationBuilder: Only one instance of ApplicationBuilder is allowed.");
        this.services.autoRegisterInjectables();
        const provider = this.services.buildServiceProvider();
        this.services.addSingleton(ServiceProvider, provider);
        var app = new Application(provider);
        this.services.addSingleton(Application, app);
        _globalApplication = app;
        return app;
    }

    rebuild() {
        if (_globalApplication) {
            _globalApplication.provider.dispose();
            _globalApplication.provider = this.services.buildServiceProvider();
            return _globalApplication;
        }
        return this.build();
    }
}

interface ApplicationEvents {
    'router-changed': 'motifjs-router-navigated';
}
export type AppLifecycleState = 'visible' | 'hidden' | 'frozen' | 'resumed' | 'restored' | 'online' | 'offline';

export type AppLifecycleEventArgs = {
    state: AppLifecycleState;
    visible: boolean;
    online: boolean;
};

export type NavigationGuardContext = {
    to: { path: string; params: Record<string, any>; meta: Record<string, any>, options?: NavigationOptions, redirectedFrom?: string, direction?: NavigationDirection, state?: any };
    from: { path: string; params: Record<string, any>; meta: Record<string, any>, options?: NavigationOptions } | null;
};

export type NavigationGuard = (
    context: NavigationGuardContext,
    next: (redirect?: string | false) => void
) => void | Promise<void>;

export type ContainerGroups = {
    [key: string]: {
        registry: () => any;
        initialize: () => any
    };
}

export class Application {
    public static get main(): Application {
        return _globalApplication!;
    }

    constructor(public provider: ServiceProvider) { }
    public static _disposingCount = 0;
    private _state: ApplicationState = 'initializing';
    private _disposing?: Promise<void>;
    public get state(): ApplicationState {
        return this._state;
    }
    private _middlewares: Array<(ctx: RouteResolveContext, next: () => Promise<void>) => any> = [];
    private _beforeEachGuards: NavigationGuard[] = [];
    public readonly _routerState = new RouterState();
    public readonly router: Router = createRouter(this._routerState, () => this.urlRoutingModule);
    private events: Map<any, Set<any>> = new Map();

    public static CreateBuilder(): ApplicationBuilder {
        return new ApplicationBuilder();
    }
    private appShell!: Component;
    public getAppShell(): Component {
        return this.appShell;
    }
    public run(host: HTMLElement | string | Node, appRoot?: any): void {
        safeCallSilent(() => {
            engine.startGc();
        }, 'Application.run.engine.startGc');
        let target: HTMLElement | null;
        if (typeof host === 'string') {
            target = document.querySelector(host) as HTMLElement | null;
            if (!target) throw motifError('MJX406', host);
        } else {
            target = host as HTMLElement;
        }
        let rootInstance: any = appRoot;


        this._state = 'running';
        const AppShell = new Component(target);
        this.appShell = AppShell;
        safeCallSilent(() => {
            (AppShell as any)._keepElementOnDispose = true;
            (AppShell as any).application = this;
            (AppShell as any).provider = this.provider;

        }, 'Application.run.setupAppShell');

        if (!rootInstance) {
            rootInstance = AppShell;
            rootInstance.controls.add(new RouterView({ name: 'default' }));
        } else {
            rootInstance.parent = AppShell;
            AppShell.controls.add(rootInstance);
        }
        AppShell.build();
        this._routerRoot = rootInstance;
        if (this.urlRoutingModule) {
            this.urlRoutingModule.start(rootInstance);
            this._startedRouter = this.urlRoutingModule;
        } else {
        } 
        try {
        } catch { }
    }

    public insert(component: Component): void {
        this.appShell.controls.add(component);
    }
    public remove(component: Component): void {
        this.appShell.controls.remove(component);
    }

    public attach(component: Component): void {
        this.appShell.controls.add(component);
    }

    public detach(component: Component): void {
        this.appShell.controls.detach(component);
    }

    public appendToMainHost(component: Node): void {
        this.appShell.element?.appendChild(component);
    }

    public dispose(): Promise<void> {
        if (this._disposing) return this._disposing;
        this._state = 'disposing';
        Application._disposingCount++;
        startedApplicationBuilder = false;
        let routerDone: Promise<void> | undefined;
        safeCallSilent(() => { this._removeLifecycleListeners(); }, 'Application.dispose.lifecycle');
        safeCallSilent(() => { routerDone = (this as any).urlRoutingModule?.dispose?.(); }, 'Application.dispose.router');
        safeCallSilent(() => { engine.stopGc(); }, 'Application.dispose.gcStop');
        safeCallSilent(() => {
            try {
                const w = window as any;
                if (w && w.history && typeof w.history.replaceState === 'function') {
                    // Normalize to root path; for hash mode also clear the hash
                    w.history.replaceState({}, '', '/');
                }
            } catch { /* ignore */ }
        }, 'Application.dispose.resetUrl');
        transitionSettings.mode = 'concurrent';
        const shell = this.appShell;
        return this._disposing = (async () => {
            try { await routerDone; } catch (error) { reportError('MJX307', error); }
            if (shell && !shell.isDisposed) {
                try { await shell.dispose(); } catch (error) { reportError('MJX307', error); }
            }
            try { await this.provider.dispose(); } catch { }
            if (_globalApplication === this) _globalApplication = null;
            this._state = 'disposed';
            Application._disposingCount--;
        })();
    }

    public useTransitions(options: { mode?: TransitionMode }): Application {
        if (isTransitionMode(options?.mode)) transitionSettings.mode = options.mode;
        return this;
    }

    public use(callback: (ctx: RouteResolveContext, next: () => Promise<void>) => any): Application {
        this._middlewares.push(callback);
        return this;
    }

    public useGuard(guard: NavigationGuard): Application {
        this._beforeEachGuards.push(guard);
        return this;
    }

    public async _runBeforeEachGuards(to: any, from: any): Promise<string | false | true> {
        const context: NavigationGuardContext = { to, from };

        for (const guard of this._beforeEachGuards) {
            let redirectPath: string | false | undefined;
            let guardResolved = false;

            const next = (redirect?: string | false) => {
                guardResolved = true;
                redirectPath = redirect;
            };

            try {
                await guard(context, next);
            } catch (error) {
                reportError('MJX306', error, 'guard');
                return false;
            }

            if (!guardResolved) {
                return false;
            }

            if (redirectPath === false) {
                return false;
            }

            if (typeof redirectPath === 'string') {
                return redirectPath;
            }
        }

        return true; 
    }

    private urlRoutingModule!: UrlRoutingModule;
    private _routerConfig: RouterOptions | null = null;
    private _routerRoot: Component | null = null;
    private _startedRouter: UrlRoutingModule | null = null;
    public useRouter(options: RouteItem[] | {
        routes: RouteItem[],
        mode?: 'history' | 'hash' | 'file' | 'shell',
        fallbacks?: { notFound?: any, error?: any },
        hooks?: RouterEvents,
        scrollMemory?: boolean | ScrollMemoryOptions,
        stack?: boolean | StackOptions
    }): Application {
        let routes: RouteItem[];
        let mode: 'history' | 'hash' | 'file' | 'shell' | undefined;
        let fallbacks: { notFound?: any, error?: any } | undefined;
        let hooks: RouterEvents | undefined;
        let scrollMemory: boolean | ScrollMemoryOptions | undefined;
        let stack: boolean | StackOptions | undefined;
        if (Array.isArray(options)) {
            routes = options;
        } else {
            routes = options.routes;
            mode = options.mode;
            fallbacks = options.fallbacks;
            hooks = options.hooks;
            scrollMemory = options.scrollMemory;
            stack = options.stack;
        }

        if (this.urlRoutingModule) {
            this.urlRoutingModule.dispose();
        }

        this._routerConfig = {
            mode,
            fallbacks,
            middlewareCollections: () => this._middlewares,
            RouteItems: routes,
            hooks,
            scrollMemory,
            stack,
        };
        this.urlRoutingModule = new UrlRoutingModule(this._routerConfig, this);

        this._routerState.reset();



        safeCallSilent(() => {
            ensureDevtoolsFlagInitialized();
            initOverlayIfEnabled();
            setRoutes(routes as any);
            if (this._isDevelopment || (globalThis as any).__MOTIF_DEV__ === true || isDevtoolsEnabled()) {
                lintRoutes(routes as any);
            }
        }, 'Application.useRouter.devtools');

        return this;
    }

    public restartRouter() {
        const root = this._routerRoot;
        if (!root || !this._routerConfig) return this;
        const previous = this._startedRouter;
        const shownUri = previous?.shownUri;
        let fresh = this.urlRoutingModule;
        if (!fresh || fresh === previous) {
            previous?.dispose();
            fresh = new UrlRoutingModule(this._routerConfig, this);
            this.urlRoutingModule = fresh;
        }
        this._routerState.reset();
        this._startedRouter = fresh;
        fresh.start(root, shownUri);
        return this;
    }

    public async navigate(uri: string, options?: NavigationOptions) {
        if (this.urlRoutingModule) {
            return await this.urlRoutingModule.navigate(uri, options);
        } else {
            throw motifError('MJX309');
        }
    }

    public async navigateByName(name: string, params?: Record<string, any>, options?: NavigationOptions) {
        if (this.urlRoutingModule) {
            return await this.urlRoutingModule.navigateByName(name, params, options);
        } else {
            throw motifError('MJX309');
        }
    }

    public on<T>(event: ApplicationEvents[keyof ApplicationEvents & string] | any, handler: (args?: T) => void): any {
        var e = this.events.get(event);
        if (!e) {
            this.events.set(event, new Set());
            e = this.events.get(event);
        }
        if (e) {
            e.add(handler);
        }
        return () => this.off(event, handler);
    }
    public off<T>(event: any, handler: (args?: T) => void): void {
        var e = this.events.get(event);
        if (e) {
            e.delete(handler);
        }
    }

    public fire<T>(event: any, args?: T): void {
        var e = this.events.get(event);
        if (e) {
            e.forEach(handler => {
                callReported(() => handler(args), 'MJX123', String(event));
            });
        }
    }

    public onRouterChanged(handler: (args?: RouterNavigatedEventArgs) => unknown): any {
        return this.on<RouterNavigatedEventArgs>('motifjs-router-navigated', handler);
    }

    public get isVisible(): boolean {
        try { return typeof document === 'undefined' || document.visibilityState !== 'hidden'; } catch { return true; }
    }

    public get isOnline(): boolean {
        try { return typeof navigator === 'undefined' || navigator.onLine !== false; } catch { return true; }
    }

    private _lifecycleOff: Array<() => void> | null = null;

    public onLifecycle(handler: (args?: AppLifecycleEventArgs) => unknown): () => void {
        this._installLifecycleListeners();
        return this.on<AppLifecycleEventArgs>('motifjs-app-lifecycle', handler);
    }

    private _emitLifecycle(state: AppLifecycleState): void {
        this.fire<AppLifecycleEventArgs>('motifjs-app-lifecycle', { state, visible: this.isVisible, online: this.isOnline });
    }

    private _installLifecycleListeners(): void {
        if (this._lifecycleOff) return;
        const offs: Array<() => void> = [];
        const listen = (target: EventTarget | undefined, type: string, fn: (e: any) => void) => {
            if (!target) return;
            try {
                target.addEventListener(type, fn);
                offs.push(() => { try { target.removeEventListener(type, fn); } catch { } });
            } catch { }
        };
        const doc = typeof document !== 'undefined' ? document : undefined;
        const win = typeof window !== 'undefined' ? window : undefined;
        listen(doc, 'visibilitychange', () => this._emitLifecycle(this.isVisible ? 'visible' : 'hidden'));
        listen(doc, 'freeze', () => this._emitLifecycle('frozen'));
        listen(doc, 'resume', () => this._emitLifecycle('resumed'));
        listen(win, 'pageshow', (e: PageTransitionEvent) => { if (e && e.persisted) this._emitLifecycle('restored'); });
        listen(win, 'online', () => this._emitLifecycle('online'));
        listen(win, 'offline', () => this._emitLifecycle('offline'));
        this._lifecycleOff = offs;
    }

    private _removeLifecycleListeners(): void {
        const offs = this._lifecycleOff;
        this._lifecycleOff = null;
        if (offs) for (const off of offs) off();
    }


    private _isDevelopment: boolean = false;
    private _enableErrorLogging: boolean = true;
    public get isDevelopmentModeEnabled(): boolean {
        return this._isDevelopment;
    }

    /** Enable reactive leak monitoring (dev önerilir) */
    public useReactiveMonitor(opts: { enabled?: boolean; threshold?: number; name?: string } = {}): this {
        safeCallSilent(() => { configureReactivityLeakMonitor(opts); }, 'Application.useReactiveMonitor.core');
        return this;
    }

    public useDevelopment(isDev: boolean = true): this {
        this._isDevelopment = isDev;
        errorHandler.setDevelopmentMode(isDev);
        safeCallSilent(() => { (globalThis as any).__MOTIF_DEV__ = isDev; }, 'Application.useDevelopment.flag');
        safeCallSilent(() => { setDevtoolsEnabled(isDev); }, 'Application.useDevelopment.devtools');
        if (isDev) flushCompilerContractWarnings();
        return this;
    }

    public useLogging(enabled: boolean = true): this {
        this._enableErrorLogging = enabled;
        setErrorConsoleLogging(enabled);
        return this;
    }




}


export class ApplicationService {
    public static get current(): Application {
        return Application.main;
    }
    public static initialized: boolean = false;
    public static addToMain(...components: ComponentBase[]) {
        this.current && this.current.getAppShell().controls.add(...components);
    }
}

export function useNavigation(): Router {
    return Application.main.router;
}

export function useApplication() {
    return {
        application: Application.main,
        services: Application.main.provider,
        router: Application.main.router,
        attach(...components: ComponentBase[]) {
            Application.main && Application.main.getAppShell().controls.add(...components);
        }
    }
}