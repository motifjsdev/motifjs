import { Component, ComponentBase, resolveToComponent, notifyActivated, notifyDeactivated } from "../";
import { cancelAnimationsDeep } from "../component/navigation";
import { errorHandler } from "../common/ErrorHandler";
import { callReported, reportError, reportWarning } from "../common/diagnostics";
import { NavigationDirection, NavigationOptions, ResolveResult } from "./";
import { RouterView, RouterViewBuilt } from "./";
import { UrlRoutingModule } from "./";
import { RouterViewRegistry } from "./RouterViewRegistry";
import { RouteItem } from "./";
import { Application } from "../";
import { pinServiceOwner, runInConstructionScope } from "../dependencyInjection/ServiceProvider";
import type { ServiceProvider } from "../dependencyInjection/ServiceProvider";
import { hasOwnTransition, markDirection, playLeave, unmarkDirection } from "./NavigationStack";
import type { NavigationStack, RetainedEntry, StackNavigation } from "./NavigationStack";
import type { RouteSnapshot } from "./routerState";

type StackLeave = { top: ComponentBase | null; retained: RetainedEntry | null; disposeAfter: ComponentBase[] };
type StackMotion = { animate: boolean; pages: boolean; direction: NavigationDirection };
type NavigationRun = { provider?: ServiceProvider; scope?: ServiceProvider; route: RouteSnapshot; committed: boolean; suppressed: ComponentBase[] };

export class RoutingEngine {

    public stack: NavigationStack | null = null;
    private _revealed: Set<ComponentBase> = new Set();

    private root!: ComponentBase;
    private application!: Application;
    private routingModule!: UrlRoutingModule;
    private _previousPath: ResolveResult | null = null;
    private _previousInstances: ComponentBase[] = [];

    public register(mainApp: ComponentBase, application: Application, routingModule: UrlRoutingModule) {
        this.root = mainApp;
        this.application = application;
        this.routingModule = routingModule;
    }

    private controlCache: Map<RouteItem, any> = new Map();

    public async evict(route?: RouteItem | null): Promise<void> {
        const targets: RouteItem[] = route ? [route] : Array.from(this.controlCache.keys());
        for (const r of targets) {
            const inst = this.controlCache.get(r);
            if (!inst || inst.isDisposed) { this.controlCache.delete(r); continue; }
            if (this._previousInstances.includes(inst)) continue;
            this.controlCache.delete(r);
            try { await inst.dispose(); } catch (error) { reportError('MJX307', error); }
        }
    }


    public async dispose(): Promise<void> {
        this._navVersion++;
        this._previousPath = null;
        this._previousInstances = [];
        this._revealed.clear();
        const stack = this.stack;
        this.stack = null;
        if (stack) { try { await stack.dispose(); } catch { } }
        await this.evict();
    }

    generatePathString(routeDefinition: string, params: Record<string, any>): string {
        const parts = routeDefinition.split('/');
        const result = parts.map(part => {
            if (part.startsWith('{') && part.endsWith('}')) {
                const paramDefinition = part.slice(1, -1);

                let [paramName, defaultValue] = paramDefinition.split(':');

                const isOptional = paramName.endsWith('?');
                if (isOptional) {
                    paramName = paramName.slice(0, -1);
                }
                const value = params[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    return String(value);
                }
                return defaultValue ?? '';

            } else {
                return part;
            }
        })
            .filter(part => part !== '')
            .join('/');

        if (routeDefinition.startsWith('/')) {
            return '/' + (result ? result : '');
        }
        return result;
    }

    private _navVersion = 0;

    private _pendingActivate: Set<ComponentBase> = new Set();
    public async execute(path: ResolveResult, nav?: StackNavigation, route?: RouteSnapshot) {
        route ??= {
            target: path,
            chain: path.chain.map(r => this.generatePathString(r.path, path.params) || ''),
            direction: undefined,
            state: undefined,
        };
        const provider = this._rootProvider();
        const run: NavigationRun = { provider, scope: provider?._beginNavigation(), route, committed: false, suppressed: [] };
        try {
            await this._execute(path, nav, run);
        } finally {
            if (!run.committed && run.scope) provider!._abandonNavigation(run.scope);
            for (const inst of run.suppressed) if (!inst.isDisposed) inst.motif.options.transition._suppressEnter = false;
        }
    }

    private _commitNavigation(run: NavigationRun): void {
        if (run.committed) return;
        run.committed = true;
        if (run.scope) run.provider!._commitNavigation(run.scope);
        this.application?._routerState.commit(run.route);
    }

    private async _execute(path: ResolveResult, nav: StackNavigation | undefined, run: NavigationRun) {
        const navVersion = ++this._navVersion;
        const stack = this.stack && nav && nav.to ? this.stack : null;
        if (stack) stack.begin(nav!);
        const restored = stack ? stack.take(nav!.to) : null;
        const controlList: any[] = new Array(path.chain.length);

        const isSameRoute = !!(this._previousPath &&
            this._previousPath.route === path.route &&
            (this._previousPath.route != null || this._previousPath.fullPath === path.fullPath));

        var enableEnter = !!(this._previousPath && this._previousPath.uri === path.uri);
        let paramsChanged = false;


        if (isSameRoute && path.route) {

            const prevParams = this._previousPath!.params || {};
            const newParams = path.params || {};
            let changed = false;
            const allKeys = new Set([...Object.keys(prevParams), ...Object.keys(newParams)]);
            for (const k of allKeys) {
                if (prevParams[k] !== newParams[k]) { changed = true; break; }
            }
            if (changed) {
                paramsChanged = true;

                const leafRoute = path.route;
                if (leafRoute && !leafRoute.keepAlive && this.controlCache.has(leafRoute)) {
                    if (stack) {
                        this.controlCache.delete(leafRoute);
                    } else {
                        const oldInstance = this.controlCache.get(leafRoute);
                        if (oldInstance && typeof oldInstance.dispose === 'function' && !oldInstance.isDisposed) {
                            try { await oldInstance.dispose(); } catch { }
                        }
                        this.controlCache.delete(leafRoute);
                    }
                }

                try {
                    const globalHooks = this.routingModule.getHooks?.() || undefined;
                    const updateHook = path.route.onUpdate || globalHooks?.onUpdate;
                    if (updateHook) {
                        const updateContext = {
                            from: {
                                path: this._previousPath!.uri || this._previousPath!.fullPath || '',
                                params: prevParams
                            },
                            to: {
                                path: path.uri || path.fullPath || '',
                                params: newParams
                            },
                            meta: (path as any).meta ?? path.extend
                        };
                        await updateHook(updateContext);
                    }
                } catch (error) {
                    reportError('MJX306', error, 'onUpdate');
                }
            }
        }

        if ((!isSameRoute || paramsChanged) && path.route) {
            try {
                const metaInfo = (path as any).meta ?? path.extend;
                const enterContext: any = {
                    path: path.uri || path.fullPath || '',
                    params: path.params,
                    meta: metaInfo,
                    to: {
                        path: path.uri || path.fullPath || '',
                        params: path.params,
                        meta: metaInfo
                    }
                };
                const globalHooks = this.routingModule.getHooks?.() || undefined;
                const enterHook = path.route.onEntering || globalHooks?.onEntering;
                if (enterHook) {
                    await enterHook(enterContext);
                }
            } catch (error) {
                reportError('MJX306', error, 'onEntering');
            }
        }

        const prepTasks: Promise<void>[] = [];
        for (let i = 0; i < path.chain.length; i++) {
            const element = path.chain[i];
            const kept = restored && restored.chain[i] === element ? restored.instances[i] : undefined;
            if (kept && !kept.isDisposed && !element.keepAlive) {
                controlList[i] = kept;
                this.controlCache.set(element, kept);
                continue;
            }
            if (this.controlCache.has(element)) {
                let control = this.controlCache.get(element);
                if (!control || control.isDisposed) {
                    this.controlCache.delete(element);
                    const task = this.createInstance(element.control, run.scope, run.route).then(inst => {
                        this.controlCache.set(element, inst);
                        controlList[i] = inst;
                    });
                    prepTasks.push(task);
                } else {
                    controlList[i] = control;
                    if (element.keepAlive && !this._previousInstances.includes(control)) {
                        this._pendingActivate.add(control);
                    }
                }
            } else {
                const task = this.createInstance(element.control, run.scope, run.route).then(inst => {
                    this.controlCache.set(element, inst);
                    controlList[i] = inst;
                });
                prepTasks.push(task);
            }
        }
        if (prepTasks.length) {
            await Promise.all(prepTasks);
        }
        let leave: StackLeave | null = null;
        let motion: StackMotion | null = null;
        const previousInstances = this._previousInstances;
        if (stack) {
            const animate = !!stack.animation && stack.animation !== 'none'
                && (nav!.direction === 'push' || nav!.direction === 'back' || nav!.direction === 'forward');
            motion = { animate, pages: !animate && !stack.gestureCommitPending, direction: nav!.direction };
            leave = await this._stackLeave(path.chain, controlList, nav!, stack, motion);
            if (restored) {
                const top = restored.top;
                if (!top.isDisposed && restored.outlet && top.parent === restored.outlet) {
                    stack.reveal(restored);
                    restored.outlet.current = top;
                    restored.outlet.previouspage = top;
                    this._revealed.add(top);
                }
                if (!top.isDisposed) this._pendingActivate.add(top);
            }
        } else {
            await this.disposeFromDivergencePoint(path.chain, controlList);
        }
        const entering: ComponentBase[] = motion ? controlList.filter(c => c && !previousInstances.includes(c)) : [];
        if (motion) {
            for (const inst of previousInstances) unmarkDirection(inst);
            for (const inst of entering) {
                if (motion.pages) markDirection(inst, motion.direction);
                else {
                    inst.motif.options.transition._suppressEnter = true;
                    run.suppressed.push(inst);
                }
            }
        }
        if (navVersion === this._navVersion) this._commitNavigation(run);
        await this.mountChain(controlList, path.chain, this.root, navVersion);
        if (motion?.pages) {
            if (restored?.attached && !restored.top.isDisposed && hasOwnTransition(restored.top, 'enter')) {
                restored.top.motif.options.transition.enterTransition(() => { });
            }
            for (const inst of entering) if (inst.isBuilt && !hasOwnTransition(inst, 'enter')) unmarkDirection(inst);
        }
        let enteringTop: ComponentBase | null = null;
        if (stack) {
            if (restored) stack.restoreScroll(restored);
            for (let i = 0; i < controlList.length; i++) {
                if (controlList[i] && controlList[i] !== previousInstances[i]) { enteringTop = controlList[i]; break; }
            }
            if (!enteringTop) enteringTop = controlList.length ? controlList[controlList.length - 1] : null;
            stack.record(nav!, enteringTop);
        }



        if (!enableEnter && path.route) {

            try {
                const metaInfo = (path as any).meta ?? path.extend;
                const enterContext: any = {
                    path: path.uri || path.fullPath || '',
                    params: path.params,
                    meta: metaInfo,
                    to: {
                        path: path.uri || path.fullPath || '',
                        params: path.params,
                        meta: metaInfo
                    }
                };
                const globalHooks = this.routingModule.getHooks?.() || undefined;
                const enterHook = path.route?.onEnter || globalHooks?.onEnter;
                if (enterHook) {
                    await enterHook(enterContext);
                }
            } catch (error) {
                reportError('MJX306', error, 'onEnter');
            }
        }
        this._previousPath = path;
        this._previousInstances = controlList.slice();

        if (stack && leave) {
            if (leave.top && navVersion === this._navVersion && (leave.retained || leave.disposeAfter.length)) {
                await stack.transition(nav!.direction, enteringTop, leave.top);
            }
            if (leave.retained) stack.settle(leave.retained);
            for (const inst of leave.disposeAfter) {
                try { if (!inst.isDisposed) await inst.dispose({ deep: true, skipLeaveTransition: true }); } catch (error) { reportError('MJX307', error); }
            }
        }
    }

    private async _stackLeave(newChain: RouteItem[], newInstances: ComponentBase[], nav: StackNavigation, stack: NavigationStack, motion: StackMotion): Promise<StackLeave> {
        const result: StackLeave = { top: null, retained: null, disposeAfter: [] };
        const prevChain = this._previousPath?.chain ?? [];
        const prevInstances = this._previousInstances;
        if (!prevInstances.length) return result;

        let d = -1;
        for (let i = 0; i < prevInstances.length; i++) {
            const inst = prevInstances[i];
            if (inst && !newInstances.includes(inst)) { d = i; break; }
        }
        if (d < 0) return result;

        if (!prevInstances[d].isDisposed) pinServiceOwner(prevInstances[d]);

        const outletFor = (i: number): RouterView | null => {
            const container = i - 1 >= 0 ? prevInstances[i - 1] : this.root;
            const outletName = (prevChain[i]?.extend?.targetOutlet) || 'default';
            try { return container && !container.isDisposed ? this.findRouterView(container, outletName) : null; } catch { return null; }
        };

        const top = prevInstances[d];
        const topItem = prevChain[d];
        if (stack.isRetaining(nav) && top && !top.isDisposed && !topItem?.keepAlive) {
            const outlet = outletFor(d);
            if (outlet && outlet.current === top) {
                outlet.current = null;
                outlet.previouspage = null;
            }
            cancelAnimationsDeep(top);
            if (motion.pages && hasOwnTransition(top, 'leave')) {
                markDirection(top, motion.direction);
                await playLeave(top);
                unmarkDirection(top);
            }
            for (let i = d; i < prevInstances.length; i++) {
                const item = prevChain[i];
                if (item && !item.keepAlive && this.controlCache.get(item) === prevInstances[i]) this.controlCache.delete(item);
            }
            result.top = top;
            result.retained = stack.retain(nav.from!, this._previousPath?.uri ?? '', prevChain, prevInstances, d, outlet, motion.animate);
            return result;
        }

        const deferTop = motion.animate && !!top && !top.isDisposed && !topItem?.keepAlive;
        for (let i = prevInstances.length - 1; i >= d; i--) {
            const inst = prevInstances[i];
            const item = prevChain[i];
            if (!inst || newInstances.includes(inst)) continue;
            if (inst.isDisposed) {
                if (item && this.controlCache.get(item) === inst) this.controlCache.delete(item);
                continue;
            }
            if (deferTop && i > d && !item?.keepAlive) {
                if (item && this.controlCache.get(item) === inst) this.controlCache.delete(item);
                continue;
            }
            try {
                const outlet = outletFor(i);
                if (outlet && outlet.current === inst) {
                    outlet.current = null;
                    outlet.previouspage = null;
                }
                if (item?.keepAlive) {
                    cancelAnimationsDeep(inst);
                    try { inst.parent?.controls.silentDetach(inst); } catch { /* ignore */ }
                    if (!this.controlCache.has(item)) this.controlCache.set(item, inst);
                    notifyDeactivated(inst);
                } else {
                    if (item && this.controlCache.get(item) === inst) this.controlCache.delete(item);
                    if (deferTop && i === d) {
                        result.top = inst;
                        result.disposeAfter.push(inst);
                    } else if (motion.pages) {
                        markDirection(inst, motion.direction);
                        await inst.dispose();
                    } else {
                        await inst.dispose({ deep: true, skipLeaveTransition: true });
                    }
                }
            } catch (error) {
                reportError('MJX307', error);
            }
        }
        return result;
    }

    private async disposeFromDivergencePoint(newChain: RouteItem[], newInstances: ComponentBase[]): Promise<void> {
        if (!this._previousPath || !this._previousInstances.length) {
            return;
        }

        const prevChain = this._previousPath.chain;
        const prevInstances = this._previousInstances;

        let divergeIndex = 0;
        const minLength = Math.min(prevChain.length, newChain.length);

        for (let i = 0; i < minLength; i++) {
            if (prevChain[i] === newChain[i]) {
                divergeIndex = i + 1;
            } else {
                break;
            }
        }

        for (let i = prevInstances.length - 1; i >= divergeIndex; i--) {
            const inst = prevInstances[i];
            const item = prevChain[i];
            if (!inst || inst.isDisposed) {
                if (item && this.controlCache.get(item) === inst) this.controlCache.delete(item);
                continue;
            }
            try {
                const containerIndex = i - 1;
                const container = containerIndex >= 0 ? prevInstances[containerIndex] : this.root;
                const outletName = (item?.extend?.targetOutlet) || 'default';
                const outlet = this.findRouterView(container, outletName);

                if (outlet && outlet.current === inst) {
                    outlet.current = null;
                    outlet.previouspage = null;
                }

                if (item?.keepAlive) {
                    cancelAnimationsDeep(inst);
                    try { inst.parent?.controls.silentDetach(inst); } catch { /* ignore */ }
                    if (!this.controlCache.has(item)) this.controlCache.set(item, inst);
                    notifyDeactivated(inst);
                } else {
                    if (this.controlCache.get(item) === inst) this.controlCache.delete(item);
                    await inst.dispose();
                }
            } catch (error) {
                reportError('MJX307', error);
            }
        }
    }

    private _construct<T>(scope: ServiceProvider | undefined, route: RouteSnapshot | undefined, create: () => T): T {
        const state = this.application?._routerState;
        return runInConstructionScope(scope, () => state ? state.constructWith(route, create) : create());
    }

    private async parseControl(control: RouteItem['control'], scope?: ServiceProvider, route?: RouteSnapshot): Promise<any> {
        var instance = this._construct(scope, route, () => this._resolveFrom(scope, control));
        if (instance) {
            return instance;
        }
        let val = control as any;
        if (val instanceof Promise) {
            val = await val.then((result: any) => {
                return result.default ? result.default : result;
            });
        }

        instance = this._construct(scope, route, () => this._resolveFrom(scope, val));
        if (instance) {
            return instance;
        }

        if (typeof val === 'function') {
            return this.parseControl(this._construct(scope, route, () => resolveToComponent(val, this.application)), scope, route);
        }
        return resolveToComponent(val);
    }

    private _resolveFrom(scope: ServiceProvider | undefined, token: any): any {
        const provider = scope ?? this._rootProvider();
        if (!provider || !provider.getAllServices().getDescriptor(token)) return null;
        return provider.get(token);
    }

    private _rootProvider(): ServiceProvider | undefined {
        try { return this.application?.provider ?? Application.main?.provider; } catch { return undefined; }
    }

    private async createInstance(control: RouteItem['control'], scope?: ServiceProvider, route?: RouteSnapshot): Promise<any> {
        return await this._instanceCreator(control, scope, route);
    }

    private async _instanceCreator(control: RouteItem['control'], scope?: ServiceProvider, route?: RouteSnapshot): Promise<any> {
        let val = await this.parseControl(control, scope, route) as any;
        // if (val instanceof Promise) {
        //         return result.default ? result.default : result;

        // if (typeof val === 'function') {
        //     try {
        //         return val(this.application);
        //     } catch {
        //         // fallback: try as constructor
        //         return new (val as any)(this.application);


        // if (val && typeof val.then === 'function') {
        //     return await val;
        return val;
    }

    private async activator(container: ComponentBase) {
        try {
            //const reflect: any = (Reflect as any)?.getMetadata ? Reflect : null;
            //const paramTypes: any[] | undefined = reflect ? (Reflect as any).getMetadata('design:paramtypes', container) as any[] : undefined;
            // if (Array.isArray(paramTypes) && paramTypes.length) {
            //     const args: any[] = [];
            //     let anyResolved = false;
            //     for (const t of paramTypes) {
            //         try {
            //             // try resolve token; if not registered, provider.getAsync will throw
            //             const inst = await sp.getAsync(t);
            //         } catch {
            //     if (anyResolved) {
            //         // If it looks like a constructor, try `new`, otherwise call as function
            //         try { return new (container as any)(...args); } catch { return (container as any)(...args); }
        } catch { /* ignore */ }
    }
    pendingMount: WeakMap<any, Promise<void>> = new WeakMap();
    private pendingListeners = new WeakMap<ComponentBase, Function>(); 
    private static readonly OUTLET_WARN_MS = 3000;
 
    private async mountChain(instances: any[], chain: any[], container: ComponentBase, navVersion: number): Promise<void> { 
        for (let index = 0; index < instances.length;) { 
            if (navVersion !== this._navVersion) return;

            let inst = instances[index] as ComponentBase; 
            if (inst?.isDisposed) {
                inst = await this.createInstance(chain[index].control, this._rootProvider()?._currentScope());
                instances[index] = inst;
            }
            const outletName = (chain[index] && chain[index].extend && chain[index].extend.targetOutlet) || 'default';
 
            const outlet = this.findRouterView(container, outletName);
 
            if (!outlet || !container.isBuilt) {
                this._waitForOutlet(container, instances.slice(index), chain.slice(index), navVersion, outletName);
                return;
            }

            const revealed = this._revealed.delete(inst);
            const alreadyShown = outlet.current === inst && !revealed;
            await outlet.navigate(inst);
            if (this._pendingActivate.delete(inst)) {
                notifyActivated(inst);
            }
            const showHook = (chain[index] as RouteItem | undefined)?.onShow;
            if (showHook && !alreadyShown && outlet.current === inst && navVersion === this._navVersion) {
                callReported(() => showHook(inst), 'MJX306', 'onShow');
            }
            container = inst;
            index++;
        }
    }
 
    private _waitForOutlet(container: ComponentBase, instances: any[], chain: any[], navVersion: number, outletName: string): void {
  
        const oldCleanup = this.pendingListeners.get(container);
        if (oldCleanup) {
            try { oldCleanup(); } catch { }
            this.pendingListeners.delete(container);
        }

        let done = false;
        let warnTimer: any = undefined;

        const handler = async (_s: any, _e: any) => {
            if (done) return;
            cleanup(); 
            if (navVersion !== this._navVersion) return;
            await this.mountChain(instances, chain, container, navVersion);
        };

        const cleanup = () => {
            if (done) return;
            done = true;
            this.pendingListeners.delete(container);
            try { (container as any).motif?.off?.(RouterViewBuilt as any, handler); } catch { }
            if (warnTimer !== undefined) {
                try { clearTimeout(warnTimer); } catch { }
                warnTimer = undefined;
            }
        };

        container.motif.on(RouterViewBuilt as any, handler);
        this.pendingListeners.set(container, cleanup);

        if (errorHandler.isDevelopment()) {
            warnTimer = setTimeout(() => {
                if (!done && navVersion === this._navVersion) {
                    reportWarning('MJX301', [outletName, RoutingEngine.OUTLET_WARN_MS]);
                }
            }, RoutingEngine.OUTLET_WARN_MS);
        }
    }




    private findRouterView(root: ComponentBase, name: string = 'default'): RouterView | null {
        // 1) Önce mevcut container'ın ALT AĞACINDA ara (yakınlık öncelikli)
        const stack: ComponentBase[] = (root.controls?.items || []).slice();
        while (stack.length) {
            const c = stack.shift()!;
            if (!c || c.isDisposed) continue;
            if ((c as any).__isRouterView) {
                const rv = c as any as RouterView;
                if ((rv.props.name || 'default') === name) return rv;
            }
            if (c.controls && c.controls.items && c.controls.items.length) {
                for (const ch of c.controls.items) stack.push(ch);
            }
        }

        // 2) Alt ağaçta bulunamadıysa ve isim 'default' ise: üst/yan dallara BAKMA.
        if (!name || name === 'default') {
            return null;
        }

        const scopeId = typeof (root as any).scopeId === 'function' ? (root as any).scopeId() : (root as any).scopeId ?? '';
        var x = RouterViewRegistry.find(name, scopeId);
        if (x) return x;

        // 3) İsimli outlet için ÜST AĞAÇLARDA arama: her bir üst ata için, o atanının
        let current: any = root;
        let parent: any = current?.parent;
        while (parent) {
            const siblings: ComponentBase[] = (parent.controls?.items || []).filter((it: any) => it !== current);
            const q: ComponentBase[] = siblings.slice();
            while (q.length) {
                const node = q.shift()!;
                if (!node || (node as any).isDisposed) continue;
                if ((node as any).__isRouterView) {
                    const rv = node as any as RouterView;
                    if ((rv.props.name || 'default') === name) return rv;
                }
                if ((node as any).controls && (node as any).controls.items && (node as any).controls.items.length) {
                    for (const ch of (node as any).controls.items) q.push(ch);
                }
            }
            current = parent;
            parent = parent.parent;
        }

        // 4) Hiçbir yerde bulunmadı
        return null;
    }

}