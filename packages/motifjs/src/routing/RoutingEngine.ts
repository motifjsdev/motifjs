import { Component, assertLoadedComponent, resolveToComponent, unwrapModule } from "../component/Component";
import { ComponentBase, detachBeforeDispose, notifyActivated, notifyDeactivated, pauseBeforeDispose } from "../component/componentBase";
import { afterNextPaint, cancelAnimationsDeep } from "../component/navigation";
import { errorHandler } from "../common/ErrorHandler";
import { callReported, motifError, reportError, reportWarning } from "../common/diagnostics";
import { NavigationDirection, NavigationOptions, ResolveResult } from "./common";
import { RouterView, RouterViewBuilt } from "./RouterView";
import { UrlRoutingModule } from "./UrlRoutingModule";
import { RouterViewRegistry } from "./RouterViewRegistry";
import { RouteItem } from "./RouteItem";
import { encodeRest, stripPattern } from "./scanner";
import { Application } from "../application";
import { getInScope, keepOnDispose, pinServiceOwner, runInConstructionScope, unpinServiceOwner } from "../dependencyInjection/ServiceProvider";
import type { ServiceProvider } from "../dependencyInjection/ServiceProvider";
import { hasOwnTransition, markDirection, playLeave, unmarkDirection } from "./NavigationStack";
import type { NavigationStack, RetainedEntry, StackNavigation } from "./NavigationStack";
import type { RouteSnapshot } from "./routerState";

type StackLeave = { top: ComponentBase | null; retained: RetainedEntry | null; disposeAfter: ComponentBase[] };
type StackMotion = { animate: boolean; pages: boolean; direction: NavigationDirection };
type NavigationRun = { provider?: ServiceProvider; scope?: ServiceProvider; route: RouteSnapshot; committed: boolean; suppressed: ComponentBase[]; created: Array<[RouteItem, ComponentBase]> };
export type RouterHandover = { chain: RouteItem[]; instances: ComponentBase[]; given: (item: RouteItem | undefined) => boolean; engines: RoutingEngine[]; scroll?: Record<string, number> };
type LeavingLink = { index: number; inst: ComponentBase; outlet: RouterView | null; keep: boolean };

const leavingUnits: WeakMap<ComponentBase, Promise<void>> = new WeakMap();

function hideLeft(inst: ComponentBase): void {
    const style = (inst.element as any)?.style;
    if (style && !inst.isDisposed) style.visibility = 'hidden';
}

export class RoutingEngine {

    public stack: NavigationStack | null = null;
    private _revealed: Set<ComponentBase> = new Set();
    private _closed = false;
    private _handover: RouterHandover | null = null;
    private _retiredEngines: RoutingEngine[] = [];
    private _retiredStack: NavigationStack | null = null;
    private _busy = 0;
    private _dirty = false;
    private _reconcileQueued = false;
    private _shownRoute: RouteSnapshot | undefined;
    private _scopedPages: WeakSet<ComponentBase> = new WeakSet();
    private _outletBuilt = () => this._requestReconcile();

    private root!: ComponentBase;
    private application!: Application;
    private routingModule!: UrlRoutingModule;
    private _previousPath: ResolveResult | null = null;
    private _previousInstances: ComponentBase[] = [];

    public register(mainApp: ComponentBase, application: Application, routingModule: UrlRoutingModule) {
        this._unlisten();
        this.root = mainApp;
        this.application = application;
        this.routingModule = routingModule;
        mainApp.motif.on(RouterViewBuilt as any, this._outletBuilt);
    }

    private _unlisten(): void {
        try { (this.root as any)?.motif?.off?.(RouterViewBuilt as any, this._outletBuilt); } catch { }
    }

    private controlCache: Map<RouteItem, any> = new Map();
    private _given: WeakSet<RouteItem> = new WeakSet();

    private _instanceGiven(item: RouteItem | null | undefined): boolean {
        return !!item && (item.control instanceof ComponentBase || this._given.has(item));
    }

    private _keepsInstance(item: RouteItem | null | undefined): boolean {
        return !!item && (item.keepAlive === true || this._instanceGiven(item));
    }

    public async evict(route?: RouteItem | null): Promise<void> {
        await this._release(route ? [route] : Array.from(this.controlCache.keys()), false);
    }

    private async _release(targets: RouteItem[], includeGiven: boolean): Promise<void> {
        for (const r of targets) {
            const inst = this.controlCache.get(r);
            if (!inst || inst.isDisposed) { this.controlCache.delete(r); continue; }
            if (this._previousInstances.includes(inst)) continue;
            if (!includeGiven && this._instanceGiven(r)) continue;
            this.controlCache.delete(r);
            try { await inst.dispose(); } catch (error) { reportError('MJX307', error); }
        }
    }


    public async dispose(): Promise<void> {
        this._navVersion++;
        this._closed = true;
        this._unlisten();
        this._shownRoute = undefined;
        this._previousPath = null;
        this._previousInstances = [];
        this._revealed.clear();
        const stack = this.stack ?? this._retiredStack;
        this.stack = null;
        this._retiredStack = null;
        if (stack) { try { await stack.dispose(); } catch { } }
        await this._release(Array.from(this.controlCache.keys()), true);
        const departing = [...this._departures.keys(), ...this._leaving];
        this._departures.clear();
        this._leaving.clear();
        for (const inst of departing) {
            try { if (!inst.isDisposed) await inst.dispose({ deep: true, skipLeaveTransition: true }); } catch (error) { reportError('MJX307', error); }
        }
        const handover = this._handover;
        this._handover = null;
        if (handover) {
            for (let i = handover.instances.length - 1; i >= 0; i--) {
                const inst = handover.instances[i];
                try { if (inst && !inst.isDisposed) await inst.dispose({ deep: true, skipLeaveTransition: true }); } catch (error) { reportError('MJX307', error); }
            }
        }
        const retired = this._retiredEngines;
        this._retiredEngines = [];
        for (const engine of retired) {
            try { await engine.dispose(); } catch { }
        }
    }

    public retire(): RouterHandover {
        this._navVersion++;
        this._closed = true;
        this._unlisten();
        this._shownRoute = undefined;
        const inherited = this._handover;
        this._handover = null;
        const handover: RouterHandover = inherited && !this._previousInstances.length
            ? { ...inherited, engines: [...this._retiredEngines, this] }
            : {
                chain: this._previousPath?.chain.slice() ?? [],
                instances: this._previousInstances.slice(),
                given: item => this._instanceGiven(item),
                engines: [...this._retiredEngines, this],
            };
        this._retiredEngines = [];
        this._previousPath = null;
        this._previousInstances = [];
        this._revealed.clear();
        this._retiredStack = this.stack;
        this.stack = null;
        return handover;
    }

    public adopt(handover: RouterHandover | null | undefined): void {
        if (!handover) return;
        this._handover = handover;
        this._retiredEngines = handover.engines;
    }

    private _abandoning: Promise<void> | null = null;

    public abandonHandover(): Promise<void> {
        const handover = this._handover;
        if (!handover) return this._abandoning ?? Promise.resolve();
        this._handover = null;
        const clear = () => { if (this._abandoning === abandoning) this._abandoning = null; };
        const abandoning: Promise<void> = this._abandon(handover).then(clear, clear);
        this._abandoning = abandoning;
        return abandoning;
    }

    private async _abandon(handover: RouterHandover): Promise<void> {
        await this._departInherited(handover, []);
        this.application?._routerState.reset();
        this._releaseRetired(handover);
    }

    private async _departInherited(handover: RouterHandover, keep: ComponentBase[]): Promise<void> {
        const { chain, instances } = handover;
        const unit: LeavingLink[] = [];
        for (let i = 0; i < instances.length; i++) {
            const inst = instances[i];
            if (!inst || inst.isDisposed || keep.includes(inst)) continue;
            unit.push({ index: i, inst, outlet: this._outletIn(i > 0 ? instances[i - 1] : this.root, chain[i]), keep: handover.given(chain[i]) });
        }
        await this._departUnit(unit, true);
    }

    private _releaseRetired(handover: RouterHandover): void {
        const shown = new Set(handover.instances);
        for (const engine of handover.engines) engine._releaseCache(shown);
    }

    private _releaseCache(keep: Set<ComponentBase>): void {
        const stack = this._retiredStack;
        this._retiredStack = null;
        if (stack) void stack.dispose();
        for (const [item, inst] of Array.from(this.controlCache)) {
            if (keep.has(inst) || this._instanceGiven(item)) continue;
            this.controlCache.delete(item);
            if (inst instanceof ComponentBase && !inst.isDisposed) void this._depart(inst, null, true);
        }
    }

    private _departures: Map<ComponentBase, Promise<void>> = new Map();
    private _leaving: Set<ComponentBase> = new Set();

    private async _departUnit(unit: LeavingLink[], animate: boolean, direction?: NavigationDirection): Promise<void> {
        const waits: Promise<void>[] = [];
        const own = unit.filter(link => {
            const running = leavingUnits.get(link.inst);
            if (running) waits.push(running);
            return !running && !link.inst.isDisposed;
        });
        if (!own.length) {
            await Promise.all(waits);
            return;
        }
        let finish!: () => void;
        const done = new Promise<void>(resolve => { finish = resolve; });
        for (const link of own) leavingUnits.set(link.inst, done);
        const leadsAlone = (link: LeavingLink) => !link.keep && !own.some(other => other.index === link.index - 1 && !other.keep);
        const kept = new Set(own.filter(link => link.keep).map(link => link.inst));
        const parents = new Map(own.map(link => [link.inst, link.inst.parent] as const));
        try {
            for (const link of own) {
                if (link.outlet && link.outlet.current === link.inst) {
                    link.outlet.current = null;
                    link.outlet.previouspage = null;
                }
                if (link.keep) {
                    cancelAnimationsDeep(link.inst);
                    notifyDeactivated(link.inst);
                } else {
                    pinServiceOwner(link.inst);
                    if (direction) markDirection(link.inst, direction);
                    if (leadsAlone(link)) {
                        this._leaving.add(link.inst);
                        pauseBeforeDispose(link.inst, kept);
                    }
                }
            }
            const ends: Promise<void>[] = [...waits];
            if (animate) {
                let cut: Promise<void> | null = null;
                for (const link of own) {
                    if (link.keep || !hasOwnTransition(link.inst, 'leave')) continue;
                    const inst = link.inst;
                    const left = playLeave(inst).then(() => hideLeft(inst));
                    const end: Promise<void> = cut ? Promise.race([left, cut]) : left;
                    cut = end;
                    ends.push(end);
                }
            }
            if (ends.length) await Promise.all(ends);
            for (let i = own.length - 1; i >= 0; i--) {
                const link = own[i];
                if (link.inst.isDisposed) continue;
                try {
                    if (link.keep) {
                        const parent = parents.get(link.inst);
                        if (parent && link.inst.parent === parent) parent.controls.silentDetach(link.inst);
                    } else if (leadsAlone(link)) {
                        this._leaving.delete(link.inst);
                        await this._depart(link.inst, null, true);
                    }
                } catch (error) {
                    reportError('MJX307', error);
                }
            }
        } finally {
            for (const link of own) leavingUnits.delete(link.inst);
            finish();
        }
    }

    private _depart(inst: ComponentBase, outlet: RouterView | null, instant: boolean = false): Promise<void> {
        const running = this._departures.get(inst);
        if (running) return running;
        if (outlet && outlet.current === inst) {
            outlet.current = null;
            outlet.previouspage = null;
        }
        pinServiceOwner(inst);
        const scheduled = () => afterNextPaint(() => this._finishDeparture(inst));
        const departed = detachBeforeDispose(inst, instant).then(scheduled, scheduled);
        this._departures.set(inst, departed);
        return departed;
    }

    private _finishDeparture(inst: ComponentBase): void {
        if (!this._departures.delete(inst) || inst.isDisposed) return;
        inst.dispose({ deep: true, skipLeaveTransition: true }).catch(error => reportError('MJX307', error));
    }

    private _previousOutlet(index: number): RouterView | null {
        const container = index - 1 >= 0 ? this._previousInstances[index - 1] : this.root;
        const outletName = (this._previousPath?.chain[index]?.extend?.targetOutlet) || 'default';
        try { return container && !container.isDisposed ? this.findRouterView(container, outletName) : null; } catch { return null; }
    }

    generatePathString(routeDefinition: string, params: Record<string, any>): string {
        const parts = routeDefinition.split('/');
        const result = parts.map(part => {
            if (part.startsWith('{') && part.endsWith('}')) {
                const paramDefinition = stripPattern(part.slice(1, -1));

                let [paramName, defaultValue] = paramDefinition.split(':');

                const isOptional = paramName.endsWith('?');
                if (isOptional) {
                    paramName = paramName.slice(0, -1);
                }
                const isRest = paramName.endsWith('*') || paramName.endsWith('+');
                if (isRest) {
                    paramName = paramName.slice(0, -1);
                }
                const value = params[paramName];
                if (value !== undefined && value !== null && value !== '') {
                    return isRest ? encodeRest(value) : encodeURIComponent(String(value));
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
        if (this._closed) return;
        route ??= {
            target: path,
            chain: path.chain.map(r => this.generatePathString(r.path, path.params) || ''),
            direction: undefined,
            state: undefined,
        };
        const provider = this._rootProvider();
        const run: NavigationRun = { provider, scope: provider?._beginNavigation(), route, committed: false, suppressed: [], created: [] };
        this._busy++;
        try {
            await this._execute(path, nav, run);
        } finally {
            if (!run.committed && run.scope) provider!._abandonNavigation(run.scope);
            for (const inst of run.suppressed) if (!inst.isDisposed) inst.motif.options.transition._suppressEnter = false;
            this._idle();
        }
    }

    private _idle(): void {
        if (--this._busy > 0 || !this._dirty) return;
        this._dirty = false;
        this._requestReconcile();
    }

    private _requestReconcile(): void {
        if (this._closed) return;
        if (this._busy) {
            this._dirty = true;
            return;
        }
        if (this._reconcileQueued) return;
        this._reconcileQueued = true;
        queueMicrotask(() => {
            this._reconcileQueued = false;
            void this._reconcile();
        });
    }

    private async _reconcile(): Promise<void> {
        if (this._closed || !this._previousPath) return;
        if (this._busy) {
            this._dirty = true;
            return;
        }
        const chain = this._previousPath.chain;
        const instances = this._previousInstances;
        let container: ComponentBase = this.root;
        for (let index = 0; index < chain.length; index++) {
            const inst = instances[index];
            if (this._settled(inst)) {
                container = inst;
                continue;
            }
            if (!container || container.isDisposed || !container.isBuilt || !this._outletIn(container, chain[index])) return;
            try {
                await this.mountChain(instances, chain, container, this._navVersion, index);
            } catch (error) {
                await this.routingModule._pageFailed(error);
            }
            return;
        }
    }

    private _settled(inst: ComponentBase | undefined): inst is ComponentBase {
        if (!inst || inst.isDisposed) return false;
        const outlet = inst.parent as any;
        return !!outlet && !!outlet.__isRouterView && !this._dying(outlet);
    }

    private _dying(node: ComponentBase | null | undefined): boolean {
        for (let n: any = node; n; n = n.parent) {
            if (n.isDisposed || n._disposing) return true;
        }
        return false;
    }

    private _keepsPage(item: RouteItem | undefined, inst: ComponentBase): boolean {
        return this._keepsInstance(item) || this._scopedPages.has(inst);
    }

    private _takeFromOutlet(inst: ComponentBase): void {
        const outlet = inst.parent as any;
        cancelAnimationsDeep(inst);
        if (outlet && outlet.current === inst) {
            outlet.current = null;
            outlet.previouspage = null;
        }
        try { outlet?.controls.silentDetach(inst); } catch (error) { reportError('MJX307', error); }
        this._pendingActivate.add(inst);
    }

    public _outletDisposing(outlet: RouterView): void {
        if (this._closed) return;
        this.stack?.releaseOutlet(outlet);
        const page = outlet.current;
        if (!(page instanceof ComponentBase) || page.isDisposed) return;
        const index = this._previousInstances.indexOf(page);
        if (index < 0) return;
        if (this._keepsPage(this._previousPath?.chain[index], page)) this._takeFromOutlet(page);
        this._requestReconcile();
    }

    private _uncommitted: WeakSet<ComponentBase> = new WeakSet();

    private _noteCreated(run: NavigationRun, item: RouteItem, inst: any): void {
        if (!(inst instanceof ComponentBase) || this._keepsInstance(item)) return;
        this._uncommitted.add(inst);
        run.created.push([item, inst]);
    }

    private _noteGivenInactive(item: RouteItem, inst: any): void {
        if (inst instanceof ComponentBase && this._instanceGiven(item) && (inst as any)._baseCtx?._inactive) this._pendingActivate.add(inst);
    }

    private _dropUncommitted(run: NavigationRun): void {
        for (const [item, inst] of run.created) {
            if (!this._uncommitted.delete(inst)) continue;
            if (this.controlCache.get(item) === inst) this.controlCache.delete(item);
            if (!inst.isDisposed) void this._depart(inst, null, true);
        }
    }

    private _commitNavigation(run: NavigationRun): void {
        if (run.committed) return;
        run.committed = true;
        for (const [, inst] of run.created) this._uncommitted.delete(inst);
        if (run.scope) run.provider!._commitNavigation(run.scope);
        this._shownRoute = run.route;
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
                if (leafRoute && !this._keepsInstance(leafRoute) && this.controlCache.has(leafRoute)) {
                    if (stack) {
                        this.controlCache.delete(leafRoute);
                    } else {
                        const oldInstance = this.controlCache.get(leafRoute);
                        this.controlCache.delete(leafRoute);
                        if (oldInstance instanceof ComponentBase && !oldInstance.isDisposed) {
                            const index = this._previousInstances.indexOf(oldInstance);
                            await this._depart(oldInstance, index >= 0 ? this._previousOutlet(index) : null);
                        }
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
            if (kept && !kept.isDisposed && !this._keepsInstance(element)) {
                controlList[i] = kept;
                this.controlCache.set(element, kept);
                continue;
            }
            if (this.controlCache.has(element)) {
                let control = this.controlCache.get(element);
                if (!control || control.isDisposed || this._uncommitted.has(control)) {
                    this.controlCache.delete(element);
                    const task = this.createInstance(element, run.scope, run.route).then(inst => {
                        if (navVersion === this._navVersion || this._keepsInstance(element)) this.controlCache.set(element, inst);
                        controlList[i] = inst;
                        this._noteCreated(run, element, inst);
                        this._noteGivenInactive(element, inst);
                    });
                    prepTasks.push(task);
                } else {
                    controlList[i] = control;
                    if (this._keepsInstance(element) && !this._previousInstances.includes(control)) {
                        this._pendingActivate.add(control);
                    }
                }
            } else {
                const task = this.createInstance(element, run.scope, run.route).then(inst => {
                    if (navVersion === this._navVersion || this._keepsInstance(element)) this.controlCache.set(element, inst);
                    controlList[i] = inst;
                    this._noteCreated(run, element, inst);
                    this._noteGivenInactive(element, inst);
                });
                prepTasks.push(task);
            }
        }
        if (prepTasks.length) {
            await Promise.all(prepTasks);
        }
        if (this._abandoning) await this._abandoning;
        const handover = this._handover;
        if (handover) {
            this._handover = null;
            await this._departInherited(handover, controlList);
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
                if (!top.isDisposed && top.parent && this._dying(top.parent)) {
                    stack.release(restored);
                }
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
        if (handover) this._releaseRetired(handover);
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
        if (navVersion === this._navVersion) {
            this._previousPath = path;
            this._previousInstances = controlList.slice();
        } else if (!run.committed) {
            this._dropUncommitted(run);
        }

        if (stack && leave) {
            if (leave.top && navVersion === this._navVersion && (leave.retained || leave.disposeAfter.length)) {
                await stack.transition(nav!.direction, enteringTop, leave.top);
            }
            if (leave.retained) stack.settle(leave.retained);
            for (const inst of leave.disposeAfter) {
                if (!inst.isDisposed) void this._depart(inst, null, true);
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
        if (stack.isRetaining(nav) && top && !top.isDisposed && !this._keepsInstance(topItem)) {
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
                if (item && !this._keepsInstance(item) && this.controlCache.get(item) === prevInstances[i]) this.controlCache.delete(item);
            }
            result.top = top;
            result.retained = stack.retain(nav.from!, this._previousPath?.uri ?? '', prevChain, prevInstances, d, outlet, motion.animate);
            return result;
        }

        const deferTop = motion.animate && !!top && !top.isDisposed && !this._keepsInstance(topItem);
        if (!deferTop) {
            const unit: LeavingLink[] = [];
            for (let i = d; i < prevInstances.length; i++) {
                const inst = prevInstances[i];
                const item = prevChain[i];
                if (!inst || newInstances.includes(inst)) continue;
                if (inst.isDisposed) {
                    if (item && this.controlCache.get(item) === inst) this.controlCache.delete(item);
                    continue;
                }
                const keep = this._keepsInstance(item);
                if (keep) {
                    if (!this.controlCache.has(item)) this.controlCache.set(item, inst);
                } else if (item && this.controlCache.get(item) === inst) {
                    this.controlCache.delete(item);
                }
                unit.push({ index: i, inst, outlet: outletFor(i), keep });
            }
            await this._departUnit(unit, motion.pages, motion.pages ? motion.direction : undefined);
            return result;
        }
        for (let i = prevInstances.length - 1; i >= d; i--) {
            const inst = prevInstances[i];
            const item = prevChain[i];
            if (!inst || newInstances.includes(inst)) continue;
            if (inst.isDisposed) {
                if (item && this.controlCache.get(item) === inst) this.controlCache.delete(item);
                continue;
            }
            if (deferTop && i > d && !this._keepsInstance(item)) {
                if (item && this.controlCache.get(item) === inst) this.controlCache.delete(item);
                continue;
            }
            try {
                const outlet = outletFor(i);
                if (outlet && outlet.current === inst) {
                    outlet.current = null;
                    outlet.previouspage = null;
                }
                if (this._keepsInstance(item)) {
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
                        await this._depart(inst, null);
                    } else {
                        await this._depart(inst, null, true);
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

        const unit: LeavingLink[] = [];
        for (let i = divergeIndex; i < prevInstances.length; i++) {
            const inst = prevInstances[i];
            const item = prevChain[i];
            if (!inst || inst.isDisposed) {
                if (item && this.controlCache.get(item) === inst) this.controlCache.delete(item);
                continue;
            }
            const keep = this._keepsInstance(item);
            if (keep) {
                if (!this.controlCache.has(item)) this.controlCache.set(item, inst);
            } else if (this.controlCache.get(item) === inst) {
                this.controlCache.delete(item);
            }
            unit.push({ index: i, inst, outlet: this._outletIn(i > 0 ? prevInstances[i - 1] : this.root, item), keep });
        }
        await this._departUnit(unit, true);
    }

    private _outletIn(container: ComponentBase | undefined, item: RouteItem | undefined): RouterView | null {
        const outletName = (item?.extend?.targetOutlet) || 'default';
        try { return container && !container.isDisposed ? this.findRouterView(container, outletName) : null; } catch { return null; }
    }

    private _construct<T>(scope: ServiceProvider | undefined, route: RouteSnapshot | undefined, create: () => T): T {
        const state = this.application?._routerState;
        return runInConstructionScope(scope, () => state ? state.constructWith(route, create) : create());
    }

    private async parseControl(control: RouteItem['control'], scope?: ServiceProvider, route?: RouteSnapshot, item?: RouteItem): Promise<any> {
        var instance = this._construct(scope, route, () => this._resolveFrom(scope, control, item));
        if (instance) {
            return instance;
        }
        let val = control as any;
        if (val instanceof Promise) {
            val = unwrapModule(await val);
            if (item && val instanceof ComponentBase) this._given.add(item);
        }

        instance = this._construct(scope, route, () => this._resolveFrom(scope, val, item));
        if (instance) {
            return instance;
        }

        if (typeof val === 'function') {
            return this.parseControl(this._construct(scope, route, () => resolveToComponent(val, this.application)), scope, route);
        }
        return resolveToComponent(val);
    }

    private _resolveFrom(scope: ServiceProvider | undefined, token: any, item?: RouteItem): any {
        const provider = scope ?? this._rootProvider();
        const desc = provider?.getAllServices().getDescriptor(token);
        if (!provider || !desc) return null;
        if (desc.lifetime === 'singleton') {
            if (item) this._given.add(item);
            return provider.get(token);
        }
        if (desc.lifetime === 'scoped') {
            const page = getInScope(provider, token);
            if (page && typeof page === 'object') keepOnDispose(page);
            if (page instanceof ComponentBase) this._scopedPages.add(page);
            return page;
        }
        return provider.get(token);
    }

    private _rootProvider(): ServiceProvider | undefined {
        try { return this.application?.provider ?? Application.main?.provider; } catch { return undefined; }
    }

    private async createInstance(item: RouteItem, scope?: ServiceProvider, route?: RouteSnapshot): Promise<any> {
        return await this._instanceCreator(item, scope, route);
    }

    private async _instanceCreator(item: RouteItem, scope?: ServiceProvider, route?: RouteSnapshot): Promise<any> {
        let val = await this.parseControl(item.control, scope, route, item) as any;
        assertLoadedComponent(val);
        if (val instanceof ComponentBase && val.isDisposed) {
            throw motifError('MJX318', item.fullPath || item.path || item.name || '');
        }
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
 
    private async mountChain(instances: any[], chain: any[], container: ComponentBase, navVersion: number, start: number = 0): Promise<void> {
        this._busy++;
        try {
            for (let index = start; index < instances.length;) {
                if (navVersion !== this._navVersion) return;

                let inst = this._pageAt(instances, chain, index);
                if (!inst) {
                    inst = await this._rebuildPage(instances, chain, index, navVersion);
                    if (!inst) return;
                }
                const outletName = (chain[index] && chain[index].extend && chain[index].extend.targetOutlet) || 'default';

                const outlet = this.findRouterView(container, outletName);

                if (!outlet || !container.isBuilt) {
                    this._waitForOutlet(container, instances, chain, index, navVersion, outletName);
                    return;
                }
                outlet._router = this;

                const revealed = this._revealed.delete(inst);
                const alreadyShown = outlet.current === inst && !revealed;
                const activating = this._pendingActivate.delete(inst);
                if (activating) unpinServiceOwner(inst);
                await outlet.navigate(inst);
                if (activating) {
                    notifyActivated(inst);
                }
                const showHook = (chain[index] as RouteItem | undefined)?.onShow;
                if (showHook && !alreadyShown && outlet.current === inst && navVersion === this._navVersion) {
                    callReported(() => showHook(inst), 'MJX306', 'onShow');
                }
                container = inst;
                index++;
            }
        } finally {
            this._idle();
        }
    }

    private _pageAt(instances: any[], chain: any[], index: number): ComponentBase | null {
        const inst = instances[index] as ComponentBase | undefined;
        if (!inst || inst.isDisposed) return null;
        const outlet = inst.parent as any;
        if (!outlet || !outlet.__isRouterView || !this._dying(outlet)) return inst;
        if (this._keepsPage(chain[index], inst)) {
            this._takeFromOutlet(inst);
            return inst;
        }
        pinServiceOwner(inst);
        pauseBeforeDispose(inst);
        return null;
    }

    private async _rebuildPage(instances: any[], chain: any[], index: number, navVersion: number): Promise<ComponentBase | null> {
        const item = chain[index] as RouteItem;
        const created = await this.createInstance(item, this._rootProvider()?._currentScope(), this._shownRoute) as ComponentBase;
        if (navVersion !== this._navVersion) {
            if (created instanceof ComponentBase && !created.isDisposed && !this._keepsInstance(item) && !created.parent) void this._depart(created, null, true);
            return null;
        }
        instances[index] = created;
        if (this._previousPath?.chain === chain) this._previousInstances[index] = created;
        this.controlCache.set(item, created);
        this._noteGivenInactive(item, created);
        return created;
    }

    private _waitForOutlet(container: ComponentBase, instances: any[], chain: any[], start: number, navVersion: number, outletName: string): void {
  
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
            try {
                await this.mountChain(instances, chain, container, navVersion, start);
            } catch (error) {
                await this.routingModule._pageFailed(error);
            }
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