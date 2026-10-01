import { ControlCollection, dom, Disposable, disposableCore, IClass, IDisposable, Application, isExactMatch, startsWithPath, reactive, safeCallSilent, safeCallSilentAsync, safeCall, safeCallAsync } from "..";
import { ServiceProvider } from "..";
import { BindingCollection, IBaseBinding } from "../bindings";
import { effect } from "../store/reactivity-core";
import { ComponentEmiter } from "./ComponentEmiter";
import { controlAttribute } from "./controlAttribute";
import { controlClass } from "./controlClass";
import { ComponentBaseOptions, ElementType, EventArgs, HtmlElementEvents, OptionalParams, RouterClassingSettings, shimAnimation } from "./types";
import { UnwrapValueRefs } from "../store/common";
import { getTransitionInfo, runCssTransition, TransitionProps } from "../common/transition";
import { callReported, motifError, reportError, reportWarning } from "../common/diagnostics";
import { ComponentMotif } from "./ComponentMotif";
import { pinServiceOwner, recordServiceOwner, retireServiceOwner, unpinServiceOwner } from "../dependencyInjection/ServiceProvider";

/** DI token'ını okunur biçime çevirir (dev uyarıları için). */
function describeServiceToken(t: any): string {
        if (typeof t === 'string') return t;
        if (typeof t === 'symbol') return t.toString();
        if (typeof t === 'function') return t.name || '[AnonymousClass]';
        return String(t);
}

/**WAAPI keyframe (transitionIn) YA DA CSS class transition (name/classes) tanımlı olarak enter animasyonu varmı */
function clearNavDirection(c: any): void {
        const t = c?.motif?.options?.transition;
        if (!t?._markedDirection) return;
        t._markedDirection = false;
        try { (c.element as any)?.removeAttribute?.('data-nav-direction'); } catch { }
}

function wantsEnterTransition(c: any): boolean {
        const t = c?.motif.options?.transition;
        return !!(c?.motif.options?.transitionIn || (t && (t.classes || (t.name && t.name.length > 0))));
}




export type IBaseProp<T extends any> = OptionalParams<T> & {
        childs?: any[];
        options?: any;
        onElementCreating?(): any;
        initializeComponent?(sender: ComponentBase): void;
        onBuilding?(sender: ComponentBase, e: EventArgs): void;
        onBuilt?(sender: ComponentBase, e: EventArgs): void;
        onMounted?(sender: ComponentBase, e: EventArgs): void;
        onInitializing?(sender: ComponentBase, e: EventArgs): void;
        onInitialized?(sender: ComponentBase, e: EventArgs): void;
        onDisposing?(sender: ComponentBase, e: EventArgs): void;
        onDisposed?(sender: ComponentBase, e: EventArgs): void;
        onConfig?(sender: ComponentBase, e: EventArgs): void;
        onConfigured?(sender: ComponentBase, e: EventArgs): void;
        onVisibilityChanged?(sender: ComponentBase, e: EventArgs): void;
        onActivated?(sender: ComponentBase, e: EventArgs): void;
        onDeactivated?(sender: ComponentBase, e: EventArgs): void;
        runover?: {
                initializeComponent?: (sender: ComponentBase) => void;
        }
        [key: string]: any;
};

type LifecycleHandler = (sender: ComponentBase, e: EventArgs) => void;
interface LifecycleStorage {
        _initializeComponentHandlers?: LifecycleHandler[];
        _onInitializeComponentHandlers?: LifecycleHandler[];
        _onBuildingHandlers?: LifecycleHandler[];
        _onBuiltHandlers?: LifecycleHandler[];
        _onMountedHandlers?: LifecycleHandler[];
        _onInitializingHandlers?: LifecycleHandler[];
        _onInitializedHandlers?: LifecycleHandler[];
        _onConfigHandlers?: LifecycleHandler[];
        _onConfiguredHandlers?: LifecycleHandler[];
        _onVisibilityChangedHandlers?: LifecycleHandler[];
        _onActivatedHandlers?: LifecycleHandler[];
        _onDeactivatedHandlers?: LifecycleHandler[];
        _onDisposingHandlers?: LifecycleHandler[];
        _onDisposedHandlers?: LifecycleHandler[];
}
interface BaseCtx extends LifecycleStorage {
        _offAll: () => void;
        _deactivateBindings: () => void;
        _activateBindings: () => void;
        _activatePreBindings: () => void;
        _reactivateBindings: () => void;
        _detachDomWithAnimation: () => void;
        _detachDomWithAnimationAsync: () => Promise<void>;
        _disposeShallow: () => void;
        _deepCleanup: () => void;
        emiters: ComponentEmiter;
        itemRef?: any;
        [key: string]: any;
}

const ComponentHelper = {
        callInitializeComponent(component: ComponentBase | any) {
                const sender = component;
                const ev = { cancel: false } as EventArgs;
                if (!component || component.isDisposed) { return; }
                // 1) class method initializeComponent
                if (typeof component.initializeComponent === 'function') {
                        callReported(() => component.initializeComponent(sender, ev), 'MJX122', 'initializeComponent');
                }
                // 2) aggregated extra initializeComponent handlers (örn, from props)
                if (Array.isArray(component._base._initializeComponentHandlers) && component._base._initializeComponentHandlers.length) {
                        for (const fn of component._base._initializeComponentHandlers) {
                                callReported(() => fn(sender, ev), 'MJX122', 'initializeComponent');
                        }
                }
                // 3) class method  oninitializeComponent  
                if (typeof component.oninitializeComponent === 'function') {
                        callReported(() => component.oninitializeComponent(sender, ev), 'MJX122', 'oninitializeComponent');
                }
                // 4) aggregated extra oninitializeComponent handlers (örn, from props)
                if (Array.isArray(component._base._onInitializeComponentHandlers) && component._base._onInitializeComponentHandlers.length) {
                        for (const fn of component._base._onInitializeComponentHandlers) {
                                callReported(() => fn(sender, ev), 'MJX122', 'oninitializeComponent');
                        }
                }
        },
        async callDisposing(component: ComponentBase | any) {
                ComponentHelper.backgroundCallback(() => {
                        if (!component || component.isDisposed) { return; }
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onDisposing) {
                                callReported(() => component.onDisposing(sender, ev), 'MJX122', 'onDisposing');
                        }
                        if (Array.isArray(component._base._onDisposingHandlers)) {
                                for (const fn of component._base._onDisposingHandlers) {
                                        callReported(() => fn(sender, ev), 'MJX122', 'onDisposing');
                                }
                        }
                        if (component.ondisposing) {
                                callReported(() => component.ondisposing(sender, ev), 'MJX122', 'ondisposing');
                        }
                        component._base.emiters.fire('ondisposing', ev);
                });
        },
        callActivated(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onActivated) { callReported(() => component.onActivated(sender, ev), 'MJX122', 'onActivated'); }
                if (Array.isArray(component._base._onActivatedHandlers)) {
                        for (const fn of component._base._onActivatedHandlers) {
                                callReported(() => fn(sender, ev), 'MJX122', 'onActivated');
                        }
                }
                component._base.emiters.fire('onactivated', ev);
        },
        callDeactivated(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onDeactivated) { callReported(() => component.onDeactivated(sender, ev), 'MJX122', 'onDeactivated'); }
                if (Array.isArray(component._base._onDeactivatedHandlers)) {
                        for (const fn of component._base._onDeactivatedHandlers) {
                                callReported(() => fn(sender, ev), 'MJX122', 'onDeactivated');
                        }
                }
                component._base.emiters.fire('ondeactivated', ev);
        },
        deactivateTree(component: ComponentBase | any, deep: boolean = true) {
                if (!component || component.isDisposed || !component.isBuilt || !component._base || component._base._inactive) { return; }
                component._base._inactive = true;
                ComponentHelper.callDeactivated(component);
                if (!deep) { return; }
                for (const c of component.controls.items.slice()) {
                        if (c && !c.isDisposed && c.isVisible && !c.isWait) {
                                ComponentHelper.deactivateTree(c, true);
                        }
                }
        },
        activateTree(component: ComponentBase | any, deep: boolean = true) {
                if (!component || component.isDisposed || !component._base || !component._base._inactive) { return; }
                component._base._inactive = false;
                ComponentHelper.callActivated(component);
                if (!deep) { return; }
                for (const c of component.controls.items.slice()) {
                        if (c && !c.isDisposed && c.isVisible && !c.isWait) {
                                ComponentHelper.activateTree(c, true);
                        }
                }
        },
        async callDisposed(component: ComponentBase | any) {
                if (!component || !component._base || component._base._disposedFired) { return; }
                component._base._disposedFired = true;
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onDisposed) { callReported(() => component.onDisposed(sender, ev), 'MJX122', 'onDisposed'); }
                if (Array.isArray(component._base._onDisposedHandlers)) {
                        for (const fn of component._base._onDisposedHandlers) {
                                callReported(() => fn(sender, ev), 'MJX122', 'onDisposed');
                        }
                }
                if (component.ondisposed) { callReported(() => component.ondisposed(sender, ev), 'MJX122', 'ondisposed'); }
                component._base.emiters.fire('ondisposed', ev);
                try { (globalThis as any).__MOTIF_DEVTOOLS_BUS__?.publish?.('component:disposed', { id: (component as any).id, type: component.constructor?.name }); } catch { }
        },
        async callBuilt(component: ComponentBase | any) {

                ComponentHelper.backgroundCallback(() => {
                        if (!component || component.isDisposed) { return; }
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onBuilt) { callReported(() => component.onBuilt(sender, ev), 'MJX122', 'onBuilt'); }
                        if (Array.isArray(component._base._onBuiltHandlers)) {
                                for (const fn of component._base._onBuiltHandlers) {
                                        callReported(() => fn(sender, ev), 'MJX122', 'onBuilt');
                                }
                        }
                        if (component.onbuilt) { callReported(() => component.onbuilt(sender, ev), 'MJX122', 'onbuilt'); }
                        component._base.emiters.fire('onbuilt', ev);
                        try { (globalThis as any).__MOTIF_DEVTOOLS_BUS__?.publish?.('component:mounted', { id: (component as any).id, type: component.constructor?.name }); } catch { }
                });
        },
        scheduleMounted(component: ComponentBase | any) {
                if (!component || component.isDisposed || component._base._mountedScheduled) { return; }
                const hasHook = typeof component.onMounted === 'function'
                        || (Array.isArray(component._base._onMountedHandlers) && component._base._onMountedHandlers.length > 0)
                        || typeof component.onmounted === 'function';
                if (!hasHook) { return; }
                component._base._mountedScheduled = true;
                const el = component.element as Element | null;
                if (!el || typeof (el as any).nodeType !== 'number') { return; }
                const stop = onElementAttached(el, () => {
                        if (component.isDisposed) { return; }
                        ComponentHelper.callMounted(component);
                });
                if (stop) {
                        component._register(disposableCore.toDisposable(stop));
                }
        },
        callMounted(component: ComponentBase | any) {
                if (!component || component.isDisposed || component._base._mountedFired) { return; }
                component._base._mountedFired = true;
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onMounted) { callReported(() => component.onMounted(sender, ev), 'MJX122', 'onMounted'); }
                if (Array.isArray(component._base._onMountedHandlers)) {
                        for (const fn of component._base._onMountedHandlers) {
                                callReported(() => fn(sender, ev), 'MJX122', 'onMounted');
                        }
                }
                if (component.onmounted) { callReported(() => component.onmounted(sender, ev), 'MJX122', 'onmounted'); }
                component._base.emiters.fire('onmounted', ev);
        },
        async callBuilding(component: ComponentBase | any) {
                ComponentHelper.backgroundCallback(() => {
                        if (!component || component.isDisposed) { return; }
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onBuilding) { callReported(() => component.onBuilding(sender, ev), 'MJX122', 'onBuilding'); }
                        if (Array.isArray(component._base._onBuildingHandlers)) {
                                for (const fn of component._base._onBuildingHandlers) {
                                        callReported(() => fn(sender, ev), 'MJX122', 'onBuilding');
                                }
                        }
                        component._base.emiters.fire('onbuilding', ev);
                });
        },
        async callConfig(component: ComponentBase | any) {
                ComponentHelper.backgroundCallback(() => {

                        if (!component || component.isDisposed || component.isConfigured) { return; }
                        component.isConfigured = true;

                        if (component.motif.options._preconfig) {
                                safeCallSilent(() => component.motif.options._preconfig(component), 'Component._preconfig');
                        }

                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onConfig) { callReported(() => component.onConfig(sender, ev), 'MJX122', 'onConfig'); }
                        if (Array.isArray(component._base._onConfigHandlers)) {
                                for (const fn of component._base._onConfigHandlers) {
                                        callReported(() => fn(sender, ev), 'MJX122', 'onConfig');
                                }
                        }
                        component._base.emiters.fire('onconfig', ev);
                });
        },
        async callConfigured(component: ComponentBase | any) {
                if (component.motif.options && component.motif.options._postconfigdone) {
                        return;
                }
                if (component?._base?._configDeferred && !component.isConfigured) {
                        ComponentHelper.callConfig(component);
                }
                component.motif.options._postconfigdone = true;
                ComponentHelper.backgroundCallback(() => {
                        if (!component || component.isDisposed) { return; }
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onConfigured) { callReported(() => component.onConfigured(sender, ev), 'MJX122', 'onConfigured'); }
                        if (Array.isArray(component._base._onConfiguredHandlers)) {
                                for (const fn of component._base._onConfiguredHandlers) {
                                        callReported(() => fn(sender, ev), 'MJX122', 'onConfigured');
                                }
                        }
                        component._base.emiters.fire('onconfigured', ev);
                });
        },
        async callOnInitialized(component: ComponentBase | any) {
                ComponentHelper.backgroundCallback(() => {
                        if (!component || component.isDisposed) { return; }
                        component.isInitialized = true;
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onInitialized) { callReported(() => component.onInitialized(sender, ev), 'MJX122', 'onInitialized'); }
                        if (Array.isArray(component._base._onInitializedHandlers)) {
                                for (const fn of component._base._onInitializedHandlers) {
                                        callReported(() => fn(sender, ev), 'MJX122', 'onInitialized');
                                }
                        }
                        component._base.emiters.fire('oninitialized', ev);
                });
        },
        async callOnInitializing(component: ComponentBase | any) {
                ComponentHelper.backgroundCallback(() => {
                        if (!component || component.isDisposed) { return; }
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onInitializing) { callReported(() => component.onInitializing(sender, ev), 'MJX122', 'onInitializing'); }
                        if (Array.isArray(component._base._onInitializingHandlers)) {
                                for (const fn of component._base._onInitializingHandlers) {
                                        callReported(() => fn(sender, ev), 'MJX122', 'onInitializing');
                                }
                        }
                        component._base.emiters.fire('oninitializing', ev);
                });
        },
        async callVisibilityChanged(component: ComponentBase | any) {
                ComponentHelper.backgroundCallback(() => {
                        if (!component || component.isDisposed) { return; }
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onVisibilityChanged) { callReported(() => component.onVisibilityChanged(sender, ev), 'MJX122', 'onVisibilityChanged'); }
                        if (Array.isArray(component._base._onVisibilityChangedHandlers)) {
                                for (const fn of component._base._onVisibilityChangedHandlers) {
                                        callReported(() => fn(sender, ev), 'MJX122', 'onVisibilityChanged');
                                }
                        }
                        component._base.emiters.fire('onvisibilitychanged', ev);
                });
        },
        findFragmentContent(c: ComponentBase) {
                const controlElement = c.element.nodeType == Node.COMMENT_NODE
                        ? c.motif.options.cache
                        : c.element as unknown as Node;

                if (c.element.nodeType == Node.COMMENT_NODE && controlElement?.childNodes.length == 0 && c.controls.length > 0) {
                        c.motif.options.cache?.appendChild(c.element);
                        c.controls.forEach(child => {
                                c.motif.options.cache?.appendChild(child.element as unknown as Node);
                        });
                        c.motif.options.cache?.appendChild(c.motif.options.closeFragment!);
                }
        },
        backgroundCallback(callback: () => any) {
                callback();
                // if (!requestIdleCallback) {
                //         if (!requestAnimationFrame) {
                //         } else {

                // } else {
        },
        internalBuild(this: ComponentBase, c: ComponentBase) {
                if (this.isDisposed || c?.isDisposed) { return; }
                ComponentHelper.callConfigured(c);
                c._base._activatePreBindings();
                if (c.isWait) return;
                const cisBuilt = c.isBuilt;
                if (!this.isBuilt) {
                        return;
                }
                if (c.isWait) {
                        return;
                }
                const enterSeq = c._base._enterSeq;
                if (!c.isBuilt) {
                        c.build();
                } else if (c.parent != this) {
                        c.parent?.controls.detach(c);
                        c.parent = this;
                        const pendingLeave = (c as any).__pendingLeave;
                        if (pendingLeave) {
                                pendingLeave.promise.then(() => {
                                        if (this.isDisposed || c.isDisposed || c.parent !== this) return;
                                        ComponentHelper.internalBuild.call(this, c);
                                });
                                return;
                        }
                }


                c.parent = this;

                const currentIndex = this.controls.items.indexOf(c);

                const appendableElement = findAppendableComponent(this);
                var controlElement = (c.element as Node).nodeType == Node.COMMENT_NODE
                        ? c.motif.options.cache
                        : c.element as unknown as Node;


                if (cisBuilt && (c.element as Node).nodeType == Node.COMMENT_NODE && controlElement?.childNodes.length == 0 && c.controls.length > 0) {

                        controlElement = ComponentHelper.getContent.call(c) as Node;
                }

                let referenceNode: Node | null = null;

                const insertHost = appendableElement?.element as Node | undefined;
                const domReferenceOf = (n: ComponentBase | undefined): Node | null => {
                        if (!n || !n.isBuilt) return null;
                        const candidate: Node | null = n.isVisible
                                ? (n.element as unknown as Node)
                                : (((n.motif.options as any)?.placeholder as Node | undefined) ?? null);
                        if (!candidate) return null;
                        return (insertHost && candidate.parentNode === insertHost) ? candidate : null;
                };

                const siblings = this.controls.items;
                for (let i = currentIndex + 1; i < siblings.length; i++) {
                        const candidate = domReferenceOf(siblings[i]);
                        if (candidate) {
                                referenceNode = candidate;
                                break;
                        }
                }
                if (!referenceNode) {
                        if ((this.element as Node).nodeType === Node.COMMENT_NODE) {
                                const close = this.motif.options.closeFragment as unknown as Node | undefined;
                                referenceNode = (close && insertHost && close.parentNode === insertHost) ? close : null;
                        } else {
                                referenceNode = null;
                        }
                }

                if (!c.isVisible) {
                        const cfg = (c as any).motif.options?.hideStrategy ?? 'auto';
                        const isFromListOrKeyed = !!((c as any).motif.options?.__fromList || typeof ((c as any).motif.options as any)?.indexkey !== 'undefined' || typeof (c as any).motif.options?.__key !== 'undefined');
                        const strategy: 'placeholder' | 'detach' = cfg === 'placeholder' ? 'placeholder' : (cfg === 'detach' ? 'detach' : (isFromListOrKeyed ? 'detach' : 'placeholder'));
                        if (strategy === 'placeholder') {
                                if (!(c as any).motif.options.placeholder) {
                                        (c as any).motif.options.placeholder = dom.createComment("h");
                                }
                                controlElement = ((c as any).motif.options.placeholder as unknown as Node);
                        } else {
                                return;
                        }
                }

                const parentNode = appendableElement?.element as Node | undefined;
                if (controlElement && parentNode && (controlElement === parentNode || controlElement.contains(parentNode))) {
                        reportWarning('MJX104', []);

                } else {
                        if (referenceNode) {
                                try {
                                        appendableElement?.element.insertBefore(controlElement!, referenceNode);
                                } catch {

                                        appendableElement?.element.appendChild(controlElement!);
                                }
                        } else {
                                appendableElement?.element.appendChild(controlElement!);
                        }
                }
                if (c.isVisible) {
                        const enteredInBuild = !cisBuilt && c._base._enterSeq !== enterSeq;
                        !enteredInBuild && wantsEnterTransition(c) && c.motif.options.transition.enterTransition(() => { });
                        if (cisBuilt) {
                                ComponentHelper.activateTree(c);
                        }
                }
        },
        getContent(this: ComponentBase): any {
                if (this.isDisposed || !this.element) { return null; }
                if ((this.element as Node).nodeType == Node.COMMENT_NODE) {
                        this.motif.options.cache?.appendChild(this.element as Node);
                        this.controls.forEach(child => {
                                this.motif.options.cache?.appendChild(ComponentHelper.getContent.call(child) as Node);
                        });
                        this.motif.options.cache?.appendChild(this.motif.options.closeFragment!);
                        return this.motif.options.cache;
                } else {
                        return this.element;
                }
        },
        routerClassing(this: ComponentBase, value: RouterClassingSettings) {
                try {
                        const type = value.to;
                        const path = value.path;
                        if (this.isDisposed) return;

                        const router = this.context?.router;
                        if (!router) return;

                        const requestPath = router.uri.startsWith('/') ? router.uri : '/' + router.uri;
                        const targetPath = path ?? '';

                        const exact = isExactMatch(requestPath, targetPath);

                        /* ---------- Active (segment‑eşleşme, tam eşleşme dahil) ---------- */
                        const active = exact || startsWithPath(requestPath, targetPath);

                        if (value.activeClass && (type === 'all' || type === 'active')) {
                                const clsList = value.activeClass.split(' ').filter((l: string) => l.trim().length);
                                clsList.forEach((cls: string) => this.element.classList.toggle(cls, active));
                        }

                        if (active && (type === 'all' || type === 'active')) {
                                value.onActive?.();
                        } else if ((type === 'all' || type === 'active')) {
                                value.offActive?.();
                        }

                        /* ---------- Exact (tam eşleşme) ---------- */
                        if (value.exactClass && (type === 'all' || type === 'exact')) {
                                const clsList = value.exactClass.split(' ').filter((l: string) => l.trim().length);
                                clsList.forEach((cls: string) => this.element.classList.toggle(cls, exact));
                        }

                        if (exact && (type === 'all' || type === 'exact')) {
                                value.onExact?.();
                        } else if ((type === 'all' || type === 'exact')) {
                                value.offExact?.();
                        }
                } catch (error) {

                }

        }
}

const fragmentCloseMarkers = new WeakMap<Comment, Comment>();

var globalId = 0;

const LIFECYCLE_X_EVENTS = new Set([
        'building', 'built', 'initializing', 'initialized', 'disposing', 'disposed',
        'config', 'configured', 'visibilitychanged', 'activated', 'deactivated'
]);

export interface IDisposeOptions {
        deep?: boolean;
        skipLeaveTransition?: boolean;
}

const RAW_APPLICATION = Symbol('motif.rawApplication');
const SCOPED_SUBSCRIBERS = new Set<PropertyKey>(['on', 'onRouterChanged']);

/**
 * Uygulamanın bileşene bağlı görünümü. `on`/`onRouterChanged` aboneliklerini sahibin ömrüne
 * kaydeder; diğer tüm üyeler (alanlar, metotlar, atamalar) uygulamanın kendisine yönlenir.
 */
function createScopedContext(app: Application, owner: ComponentBase): Application {
        const cache = new Map<PropertyKey, { fn: Function; bound: Function }>();
        return new Proxy(app, {
                get(target, prop) {
                        if (prop === RAW_APPLICATION) { return target; }
                        const value = Reflect.get(target, prop, target);
                        if (typeof value !== 'function') { return value; }
                        const hit = cache.get(prop);
                        if (hit && hit.fn === value) { return hit.bound; }
                        const bound = SCOPED_SUBSCRIBERS.has(prop)
                                ? (...args: any[]) => owner._trackContextSubscription(value.apply(target, args))
                                : value.bind(target);
                        cache.set(prop, { fn: value, bound });
                        return bound;
                },
                set(target, prop, value) {
                        return Reflect.set(target, prop, value, target);
                },
        });
}

export abstract class ComponentBase<TElement extends ElementType = any, TProps extends object = any> extends Disposable {

        public readonly motif: ComponentMotif<this, TProps> = new ComponentMotif<this, TProps>(this, {
                transition: {
                        transitionInfo: () => {
                                return {
                                        in: getTransitionInfo(this.element as Element, `${this.motif.options.transition.name}-enter ${this.motif.options.transition.name}-enter-start`),
                                        out: getTransitionInfo(this.element as Element, `${this.motif.options.transition.name}-leave ${this.motif.options.transition.name}-leave-start`),
                                }
                        },
                        name: '',
                        classes: undefined as TransitionProps | undefined,
                        activeCssCancel: null as (() => void) | null,
                        activeCssPhase: null as ('enter' | 'leave' | null),
                        cssProps: (): TransitionProps | null => {
                                const t = this.motif.options.transition;
                                if (t.classes) {
                                        return { name: t.classes.name || t.name || '', ...t.classes };
                                }
                                if (t.name && t.name.length > 0) {
                                        return { name: t.name };
                                }
                                return null;
                        },
                        skipNextLeave: false,
                        _suppressEnter: false,
                        _markedDirection: false,
                        in: (op: { keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions }) => {
                                this.motif.options.transitionIn = op;
                        },
                        out: (op: { keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions }) => {
                                this.motif.options.transitionOut = op;
                        },
                        enterTransition: (resolve: () => void): Animation => {
                                const t = this.motif.options.transition;
                                const appear = !this._base._enterPlayed;
                                this._base._enterPlayed = true;
                                this._base._enterSeq = (this._base._enterSeq ?? 0) + 1;
                                if (t._suppressEnter) {
                                        resolve && resolve();
                                        return shimAnimation as Animation;
                                }
                                const attempt = {};
                                this._base._enterRun = attempt;
                                const done = () => {
                                        if (this._base?._enterRun === attempt) {
                                                this._base._enterRun = null;
                                                clearNavDirection(this);
                                        }
                                        resolve && resolve();
                                };
                                if (this.motif.options.transitionIn) {
                                        return t.run(this.motif.options.transitionIn.keyframes, this.motif.options.transitionIn.options, done);
                                }
                                return t._runCss('enter', done, appear);
                        },
                        leaveTransition: (resolve: () => void): Animation => {
                                if (this.motif.options.transitionOut) {
                                        return this.motif.options.transition.run(this.motif.options.transitionOut.keyframes, this.motif.options.transitionOut.options, resolve);
                                }
                                return this.motif.options.transition._runCss('leave', resolve);
                        },
                        _runCss: (phase: 'enter' | 'leave', resolve: () => void, appear: boolean = false): Animation => {
                                const t = this.motif.options.transition;
                                if (phase === 'enter' && t.activeCssPhase === 'leave') {
                                        resolve && resolve();
                                        return shimAnimation as Animation;
                                }
                                const cssProps = t.cssProps();
                                const el = this.element as unknown as Element | null;
                                if (cssProps && el && (el as any).nodeType === 1 && (el as any).classList) {
                                        try { t.activeCssCancel?.(); } catch { }
                                        const cancel = runCssTransition(el, cssProps, phase, () => {
                                                if (this.motif.options?.transition) {
                                                        this.motif.options.transition.activeCssCancel = null;
                                                        this.motif.options.transition.activeCssPhase = null;
                                                }
                                                resolve && resolve();
                                        }, appear);
                                        t.activeCssCancel = cancel;
                                        t.activeCssPhase = phase;
                                        return shimAnimation as Animation;
                                }
                                resolve && resolve();
                                return shimAnimation as Animation;
                        },
                        activeAnimations: [] as Animation[],
                        run: (keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions, resolve?: () => void): Animation => {
                                this.motif.stopAnimations();

                                const element = this.element as unknown as HTMLElement;

                                if (element.animate) {
                                        var x = element.animate(keyframes, options);
                                        this.motif.options.transition.activeAnimations.push(x);

                                        let cleanedUp = false;
                                        const safeCleanup = () => {
                                                if (cleanedUp) return;
                                                cleanedUp = true;
                                                try {
                                                        if (this?.motif.options?.transition?.activeAnimations) {
                                                                this.motif.options.transition.activeAnimations = this.motif.options.transition.activeAnimations.filter(a => a !== x);
                                                        }
                                                } catch { }
                                        };

                                        x.addEventListener('finish', () => {
                                                resolve && resolve();
                                                safeCleanup();
                                        });

                                        x.oncancel = () => {
                                                safeCleanup();
                                        };
                                        return x;
                                }
                                else {
                                        resolve && resolve();
                                        const g: any = (globalThis as any);
                                        if (typeof g.Animation === 'function') {
                                                try { return new g.Animation(); } catch { /* ignore */ }
                                        }

                                        return shimAnimation as Animation;
                                }
                        }
                },
                set enableRouterClassing(value: RouterClassingSettings) {
                        try {

                                var ins = (this.getInstance() as ComponentBase);
                                const callback = ins.context.onRouterChanged(() => {
                                        ComponentHelper.routerClassing.call(ins, value);
                                });
                                ins.motif.register(disposableCore.toDisposable(() => {
                                        callback();
                                }));
                                ComponentHelper.routerClassing.call(ins, value);
                        } catch (error) {
                                reportError('MJX105', error);
                        }

                },
                getInstance: (): ComponentBase => {
                        return this;
                },
                get display(): boolean {
                        return this.getInstance().isVisible;
                },
                set display(value: boolean) {
                        if (value) {
                                this.getInstance().motif.show();
                        } else {
                                this.getInstance().motif.hide();
                        }
                },
                hasEvent: (name: string): boolean => {
                        const ins = this._eventHandlers?.has(name);
                        if (ins) return true;
                        return false;
                }
        });

        public element: TElement;
        public props: TProps;
        public isBuilt: boolean = false;
        public isInitialized: boolean = false;
        public isDisposed: boolean = false;
        public isConfigured: boolean = false;
        public isPainting: boolean = false;
        public isPainted: boolean = false;
        public isVisible: boolean = true;
        public controls: ControlCollection = new ControlCollection(this);

        private _eventHandlers?: Map<string, Set<{
                original: (sender: ComponentBase, e: EventArgs) => any,
                wrapped?: (e: Event) => void,
                dom?: boolean,
                domEvent?: boolean,
                capture?: boolean,
                type?: string
        }>>;
        private _isWait: boolean = false;
        public class: IClass<TElement> = new controlClass(this as any) as any as IClass<TElement>;
        public attr: controlAttribute<TElement> = new controlAttribute(this as any);
        public bindings = new BindingCollection(this);
        /** style(fn) izleyicisi: tek tek tutulur, yeniden çağrıda önceki durdurulur. */
        private _styleFx?: { stop: () => void; binding: IBaseBinding };

        public useModel<TModel>(modelCtor: TModel): UnwrapValueRefs<TModel> {
                return reactive<TModel>(modelCtor);
        }

        private _computeHideStrategy(): 'placeholder' | 'detach' {
                const cfg = this.motif.options?.hideStrategy ?? 'auto';
                if (cfg === 'placeholder') return 'placeholder';
                if (cfg === 'detach') return 'detach';
                if (this.motif.options?.__fromList || typeof (this.motif.options as any)?.indexkey !== 'undefined' || typeof this.motif.options?.__key !== 'undefined') {
                        return 'detach';
                }
                return 'placeholder';
        }

        private _isInDom(): boolean {
                try {
                        if (!this.element) return false;
                        const node = this.element as unknown as Node;
                        if (node.nodeType === Node.COMMENT_NODE) {
                                return !!node.parentNode;
                        }
                        return !!node.parentNode;
                } catch { return false; }
        }
        public set isWait(value: boolean) {
                this._isWait = value;
                if (this.isBuilt) {
                        if (value) {
                                this.motif.hide();
                        } else {
                                this.motif.show();
                        }
                        return;
                }
                if (value === false && this.parent && this.parent.isBuilt) {
                        ComponentHelper.internalBuild.call(this.parent, this);
                }

        }
        public get isWait(): boolean {
                return this._isWait;
        }

        constructor(element: TElement, props: TProps = {} as TProps) {
                super();
                recordServiceOwner(this);
                if (this.onElementCreating) {
                        this.element = this.onElementCreating.call(this);
                } else if ((props as any)?.onElementCreating) {
                        this.element = (props as any).onElementCreating.call(this);
                } else {
                        this.element = element;
                }

                if (props) {
                        for (const fn of takePendingRefs(this, extractRefs(props, this))) {
                                callReported(() => fn(this), 'MJX122', 'ref');
                        }
                }

                props && ParseProps(props, this);
                applyComponentOptions((props as any)?.options, this);
                this.props = props;

                // (class/style/id/tabindex/role/aria-*/data-*) kök düğüme (root node) düşer, prop'lar this.props'ta kalır.
                if (props) {
                        const ctor0 = new.target as any;
                        const plain = ctor0 === ComponentBase || Object.getPrototypeOf(ctor0) === ComponentBase;
                        if (plain) applyPlainElementProps(props, this);
                        else applyFallthroughProps(props, this);
                }


                ComponentHelper.callOnInitializing(this);
                this.controls.onAdd = (c) => {
                        this.motif.trigger('controladded', { control: c });
                        if (this.isWait || this.parent?.isWait) return;
                        ComponentHelper.internalBuild.call(this, c);

                }

                this.controls.onAddBeforeBuild = (c) => {
                        this.motif.trigger('controladded', { control: c });
                }


                this.controls.onRemove = (c) => {
                        this.motif.trigger('controlremoved', { control: c });
                }
                ComponentHelper.callOnInitialized(this);

                const ctor = new.target as any;
                const isBaseCtor = ctor === ComponentBase || Object.getPrototypeOf(ctor) === ComponentBase;
                if (isBaseCtor) {
                        ComponentHelper.callConfig(this);
                } else {
                        this._base._configDeferred = true;
                }

        }






        public childs?: any[];
        protected _base: BaseCtx = {
                prebinding_Activated: false,
                _offAll: () => {
                        if (!this._eventHandlers) return;
                        for (const [full, set] of this._eventHandlers) {
                                const name = full.split(":")[0];
                                const evt = name.startsWith("on") ? name.slice(2).toLowerCase() : name.toLowerCase();
                                for (const rec of set) {
                                        if (!rec || !rec.wrapped) { continue; }

                                        if ((rec as any).domEvent === false) { continue; }
                                        const cap = (rec as any).capture === true;
                                        try {
                                                (this.element as any).removeEventListener(evt, rec.wrapped as EventListener, cap);
                                        } catch { }

                                        try {
                                                if ((rec as any).capture === undefined) {
                                                        (this.element as any).removeEventListener(evt, rec.wrapped as EventListener, !cap);
                                                }
                                        } catch { }
                                }
                        }
                        this._eventHandlers.clear();
                        this._eventHandlers = undefined as any;
                },
                _deactivateBindings: () => {
                        try { this.bindings?.deactivateAll(); } catch { }

                },
                _activateBindings: () => {
                        try { this.bindings?.activateAll(); } catch { }

                },
                _reactivateBindings: () => {

                        try { this.bindings?.reActivateAll(); } catch { }

                },
                _activatePreBindings: () => {
                        if (this._base.prebinding_Activated) return;
                        this.bindings.items.filter(x => x.propertyName == "isWait" || x.propertyName == "display").forEach(b => {
                                b.activate();
                        }
                        );
                        this._base.prebinding_Activated = true;
                },

                _detachDomWithAnimation: () => {
                        const node = this.element as unknown as Node | null;
                        if (!node) return;

                        try {

                                const skip = this.motif.options.transition.skipNextLeave === true || (this as any)?._forceInstantDetach === true;
                                if (skip) {
                                        if (this?.motif.options?.transition) (this as any).motif.options.transition.skipNextLeave = false;
                                        (this as any)._forceInstantDetach = false;
                                        const immediate = () => {
                                                const parent = node.parentNode;
                                                if (node.nodeType === Node.COMMENT_NODE) {
                                                        const open = node;
                                                        const close = (this.motif.options?.closeFragment as unknown as Node | undefined) || null;
                                                        if (!parent) return;
                                                        if (close) {
                                                                let current: Node | null = open;
                                                                while (current) {
                                                                        const after: Node | null = current.nextSibling;
                                                                        try { parent.removeChild(current); } catch { }
                                                                        if (current === close) break;
                                                                        current = after;
                                                                }
                                                        } else {
                                                                try { parent.removeChild(open); } catch { }
                                                        }
                                                } else if (parent) {
                                                        try { parent.removeChild(node); } catch { }
                                                }
                                                const placeholder = (this.motif.options as any)?.placeholder as Node | undefined;
                                                if (placeholder && placeholder.parentNode) {
                                                        try { placeholder.parentNode.removeChild(placeholder); } catch { }
                                                }
                                        };
                                        immediate();
                                        return;
                                }
                        } catch { }

                        const removeNow = () => {
                                if (node.nodeType === Node.COMMENT_NODE) {
                                        const open = node;
                                        const close = (this.motif.options?.closeFragment as unknown as Node | undefined) || null;
                                        const parent = open.parentNode;
                                        if (!parent) return;
                                        if (close) {
                                                let current: Node | null = open;
                                                while (current) {
                                                        const after: Node | null = current.nextSibling;
                                                        try { parent.removeChild(current); } catch { }
                                                        if (current === close) break;
                                                        current = after;
                                                }
                                        } else {
                                                try { parent.removeChild(open); } catch { }
                                        }
                                        return;
                                }

                                const parent = node.parentNode;
                                if (parent) {
                                        try { parent.removeChild(node); } catch { }
                                        return;
                                }

                                const placeholder = (this.motif.options as any)?.placeholder as Node | undefined;
                                if (placeholder && placeholder.parentNode) {
                                        try { placeholder.parentNode.removeChild(placeholder); } catch { }
                                }
                        };

                        try {
                                this.motif.options.transition.leaveTransition(() => {
                                        removeNow();
                                });
                        } catch {
                                removeNow();
                        }
                }
                ,
                _detachDomWithAnimationAsync: async () => {
                        const node = this.element as unknown as Node | null;
                        if (!node) return Promise.resolve();

                        try {

                                const skip = this.motif.options.transition.skipNextLeave === true || (this as any)?._forceInstantDetach === true;
                                if (skip) {
                                        if (this.motif.options.transition) this.motif.options.transition.skipNextLeave = false;
                                        (this as any)._forceInstantDetach = false;
                                        const immediateRemove = () => {
                                                if (node.nodeType === Node.COMMENT_NODE) {
                                                        const open = node;
                                                        const close = (this.motif.options?.closeFragment as unknown as Node | undefined) || null;
                                                        const parent = open.parentNode;
                                                        if (!parent) return;
                                                        if (close) {
                                                                let current: Node | null = open;
                                                                while (current) {
                                                                        const after: Node | null = current.nextSibling;
                                                                        try { parent.removeChild(current); } catch { }
                                                                        if (current === close) break;
                                                                        current = after;
                                                                }
                                                        } else {
                                                                try { parent.removeChild(open); } catch { }
                                                        }
                                                } else {
                                                        const parent = node.parentNode;
                                                        if (parent) { try { parent.removeChild(node); } catch { } }
                                                }
                                                const placeholder = (this.motif.options as any)?.placeholder as Node | undefined;
                                                if (placeholder && placeholder.parentNode) {
                                                        try { placeholder.parentNode.removeChild(placeholder); } catch { }
                                                }
                                        };
                                        immediateRemove();
                                        return Promise.resolve();
                                }
                        } catch { }

                        const removeNow = () => {
                                if (node.nodeType === Node.COMMENT_NODE) {
                                        const open = node;
                                        const close = (this.motif.options?.closeFragment as unknown as Node | undefined) || null;
                                        const parent = open.parentNode;
                                        if (!parent) return;
                                        if (close) {
                                                let current: Node | null = open;
                                                while (current) {
                                                        const after: Node | null = current.nextSibling;
                                                        try { parent.removeChild(current); } catch { }
                                                        if (current === close) break;
                                                        current = after;
                                                }
                                        } else {
                                                try { parent.removeChild(open); } catch { }
                                        }
                                        return;
                                }

                                const parent = node.parentNode;
                                if (parent) {
                                        try { parent.removeChild(node); } catch { }
                                        return;
                                }

                                const placeholder = (this.motif.options as any)?.placeholder as Node | undefined;
                                if (placeholder && placeholder.parentNode) {
                                        try { placeholder.parentNode.removeChild(placeholder); } catch { }
                                }
                        };

                        return new Promise<void>((resolve) => {
                                try {
                                        this.motif.options.transition.leaveTransition(() => {
                                                removeNow();
                                                resolve();
                                        });
                                } catch {
                                        removeNow();
                                        resolve();
                                }
                        });
                }
                ,
                _disposeShallow: () => {
                        if (this.isDisposed) return;
                        ComponentHelper.callDisposing.call(this, this);
                        try {
                                this._base._offAll();

                        } catch {

                        }
                        this.motif.stopAnimations();

                        this._base._deactivateBindings();
                        if (this.controls?.items?.length) {
                                for (const c of this.controls.items) {
                                        try {
                                                (c as ComponentBase)._base._disposeShallow();
                                        } catch {

                                        }
                                }
                        }
                        ComponentHelper.callDisposed.call(this, this);
                        safeCall(() => { this._base.emiters.clear(); }, 'disposeShallow.emiters');
                        this.isDisposed = true;
                        super.dispose();

                },
                _deepCleanup: () => {
                        try { (this as any).parent = null; } catch { }

                        try {
                                this._eventHandlers?.clear();
                        } catch {

                        }
                        // for (const c of this.controls.items) {
                        //         try {
                        //         } catch {




                        (this as any)._eventHandlers = undefined;

                        try { (this.class as any)?._counts?.clear(); } catch { }
                        try { (this.class as any)?._watchers?.clear(); } catch { }
                        try { (this.attr as any)?._attrMap?.clear(); } catch { }
                        try { (this.attr as any)?._watchers?.clear(); } catch { }
                        try {
                                if (this.motif.options) {
                                        this.motif.options.cache = undefined as any;
                                        this.motif.options.closeFragment = undefined as any;
                                        (this.motif.options as any).placeholder = undefined;
                                }
                        } catch {

                        }
                        try { (this as any).element = null; } catch { }
                        try { (this as any).props = undefined; } catch { }
                        try { (this as any).childs = undefined; } catch { }
                        try { (this as any).class = undefined; } catch { }
                        try { (this as any).attr = undefined; } catch { }
                        try { (this as any).parent = null; } catch { }

                        try { this.motif.options = undefined as any; } catch { }
                        Object.entries(this).forEach(([key, value]) => {
                                if (key === 'motif') return;
                                try {
                                        (this as any)[key] = null;
                                        delete (this as any)[key];
                                } catch {

                                }
                        });
                        this.isDisposed = true;
                },
                emiters: new ComponentEmiter(this)
        }
        public parent: ComponentBase | null = null;
        public onElementCreating?(): TElement;
        public initializeComponent?(sender: ComponentBase): void;
        public onBuilding?(sender: ComponentBase, e: EventArgs): void;
        public onBuilt?(sender: ComponentBase, e: EventArgs): void;
        public onMounted?(sender: ComponentBase, e: EventArgs): void;
        public onInitializing?(sender: ComponentBase, e: EventArgs): void;
        public onInitialized?(sender: ComponentBase, e: EventArgs): void;
        public onDisposing?(sender: ComponentBase, e: EventArgs): void;
        public onDisposed?(sender: ComponentBase, e: EventArgs): void;
        public onConfig?(sender: ComponentBase, e: EventArgs): void;
        public onConfigured?(sender: ComponentBase, e: EventArgs): void;
        public onVisibilityChanged?(sender: ComponentBase, e: EventArgs): void;
        /** keepAlive rota bileşeni outlet'ten ayrılıp önbelleğe alındığında (RoutingEngine) tetiklenir. */
        public onDeactivated?(sender: ComponentBase, e: EventArgs): void;
        /** keepAlive rota bileşeni önbellekten outlet'e yeniden bağlandığında (RoutingEngine) tetiklenir. */
        public onActivated?(sender: ComponentBase, e: EventArgs): void;
        public view?(): ComponentBase;
        private _scopedContext?: Application;

        public get context(): Application {
                const parentCtx: any = this.parent?.context;
                const app: Application = parentCtx?.[RAW_APPLICATION] ?? parentCtx ?? Application.main;
                if (!app) { return app; }
                if ((this._scopedContext as any)?.[RAW_APPLICATION] !== app) {
                        this._scopedContext = createScopedContext(app, this);
                }
                return this._scopedContext!;
        }
        /** @internal context üzerinden açılan aboneliği bileşenin ömrüne bağlar; iptal fonksiyonunu döndürür. */
        public _trackContextSubscription(off: () => void): () => void {
                if (typeof off !== 'function') { return off; }
                if (this.isDisposed) { off(); return off; }
                const d = this._register(disposableCore.toDisposable(off));
                return () => { this._disposables.detach(d); off(); };
        }

        public build(building: boolean = true) {
                ComponentHelper.callConfigured(this);
                this._base._activatePreBindings();
                if (this.isDisposed || !this.element || this.isWait) { return; }
                if (this.isBuilt || this.isWait) {
                        return;
                }

                ComponentHelper.callBuilding(this);
                var ph: any = this.element;
                if (building) {
                        ph = dom.createDocumentFragment();
                }
                const isFragment = (typeof this.element !== 'string' && (this.element as unknown as Node).nodeType === Node.COMMENT_NODE);
                if (isFragment) {
                        this.motif.options.cache = dom.createDocumentFragment();
                        (this.element as any).textContent = "[";
                        this.motif.options.cache!.appendChild(this.element as unknown as Node);
                }
                if (this.isBuilt) {
                        return;
                }


                ComponentHelper.callInitializeComponent(this);

                if (this.view) {
                        const templ = this.view();
                        this.controls.add(templ);
                }

                const deferredSelectValue = (this.element as any)?.nodeName === 'SELECT'
                        ? this.bindings.items.filter(b => b.propertyName === 'value')
                        : [];
                if (deferredSelectValue.length) {
                        try {
                                this.bindings.items.filter(b => !deferredSelectValue.includes(b)).forEach(b => b.activate());
                        } catch { }
                } else {
                        this._base._activateBindings();
                }

                for (const element of this.controls.items.filter(c => !c.isWait)) {
                        element.parent = this;
                        element.build(false);
                        if (element.isWait) {
                                continue;
                        }
                        var target = isFragment ? this.motif.options.cache : this.element;
                        if (building) {
                                if (element.motif.options.cache) {
                                        ph.appendChild(element.motif.options.cache);
                                } else {
                                        ph.appendChild(element.element);
                                }
                        } else {
                                if (element.motif.options.cache) {
                                        (target as any).appendChild(element.motif.options.cache);
                                } else {
                                        (target as any).appendChild(element.element);
                                }
                        }
                        if (element._base?._inactive && element.isVisible) {
                                ComponentHelper.activateTree(element);
                        }

                }

                if (wantsEnterTransition(this)) {
                        const node = this.element as unknown as Node | null;
                        if (node && (node as any).isConnected) {
                                this.motif.options.transition.enterTransition(() => { });
                        } else {
                                const seq = this._base._enterSeq;
                                queueMicrotask(() => {
                                        if (!this.isDisposed && this.isVisible && this.motif.options?.transition && this._base._enterSeq === seq) {
                                                this.motif.options.transition.enterTransition(() => { });
                                        }
                                });
                        }
                } else {
                        clearNavDirection(this);
                }
                if (building) {
                        try {
                                var target = isFragment ? this.motif.options.cache : this.element;
                                if ((target as any).nodeType === Node.TEXT_NODE) {
                                        (target as Text).appendData(ph.textContent);
                                } else {
                                        if ((target as any).appendChild) {
                                                (target as any).appendChild(ph);
                                        } else {
                                                (target as any).append(ph);
                                        }
                                }
                        } catch (error) {
                        }

                }
                if (deferredSelectValue.length) {
                        try { deferredSelectValue.forEach(b => b.activate()); } catch { }
                }
                if (isFragment) {
                        this.motif.options.closeFragment = dom.createComment("]");
                        this.motif.options.cache!.appendChild(this.motif.options.closeFragment!);
                        if ((this.element as Node).nodeType === Node.COMMENT_NODE && this.motif.options.closeFragment) {
                                fragmentCloseMarkers.set(this.element as Comment, this.motif.options.closeFragment);
                        }
                }

                this.isBuilt = true;
                ComponentHelper.callBuilt(this);
                ComponentHelper.scheduleMounted(this);

        }

        public setState() {
                this.controls.forEach(c => {
                        c.setState();
                });
                this._base._reactivateBindings();
        }

        public reState() {
                this._base._reactivateBindings();
                this.controls.forEach(c => {
                        c.reState();
                });
        }

        public setText(value: string) {
                if (this.isDisposed || !this.element) { return; }
                if (isComponentLike(value)) { warnComponentInTextBinding(this, value); return; }
                if (this.element) {
                        (this.element as any).textContent = value;
                }
        }

        public style(content: CSSStyleDeclaration | string | Array<any> | Object | (() => any)) {
                if (this.isDisposed) { return this as any }
                const styleObj = (this.element as any)?.style as CSSStyleDeclaration | undefined;
                if (!styleObj) return this;
                if (typeof content === 'function') {
                        this._stopStyleEffect();
                        let prevKeys: string[] = [];
                        let prevWasString = false;
                        const run = () => effect(() => {
                                const v = (content as () => any)();
                                if (this.isDisposed) return;
                                const so: any = (this.element as any)?.style;
                                if (!so) return;
                                if (typeof v === 'string') {
                                        so.cssText = v;
                                        prevKeys = [];
                                        prevWasString = true;
                                } else if (v && typeof v === 'object') {
                                        if (prevWasString) { so.cssText = ''; prevWasString = false; }
                                        for (const k of prevKeys) {
                                                if (!(k in v)) { try { so[k] = ''; } catch { } }
                                        }
                                        Object.assign(so, v);
                                        prevKeys = Object.keys(v);
                                } else {
                                        if (prevWasString) { so.cssText = ''; prevWasString = false; }
                                        for (const k of prevKeys) { try { so[k] = ''; } catch { } }
                                        prevKeys = [];
                                }
                        });
                        let current = run();
                        const stop = () => { try { current(); } catch { } };
                        const binding: IBaseBinding = {
                                propertyName: '__style',
                                dataSource: null,
                                activate() { /* no-op */ },
                                reActivate() {
                                        stop();
                                        current = run();
                                },
                                deactivate() { stop(); }
                        } as any;
                        try { this.bindings.add(binding); } catch { }
                        this._styleFx = { stop, binding };
                        return this;
                }
                if (typeof content === 'string') {
                        (styleObj as any).cssText = content;
                } else if (content && typeof content === 'object') {
                        Object.assign(styleObj as any, content);
                }
                return this;
        }

        private _stopStyleEffect() {
                const fx = this._styleFx;
                if (!fx) return;
                this._styleFx = undefined;
                try { fx.stop(); } catch { }
                try { this.bindings.remove(fx.binding); } catch { }
        }

        private _addHandler(event: any, handler: (sender: ComponentBase, e: EventArgs) => void) {
                this.motif.on(event as any, handler as any);
        }
        private async _show(): Promise<any> {


                if (this.isDisposed || !this.element) { return; }
                if (this.isVisible) { return; }/* A*/

                if (this.motif.options?.transition?.activeAnimations?.length) {
                        safeCall(async () => {
                                await Promise.all(this.motif.options.transition.activeAnimations.map(a =>
                                        a.finished?.catch(() => { })
                                ));
                        }, 'show.waitForLeaveAnimations');
                }
                /** A*/
                const strategy = this._computeHideStrategy();
                if (strategy === 'detach') {

                        ComponentHelper.callVisibilityChanged(this);
                        const needAttach = !this._isInDom() && this.parent && this.parent.isBuilt && !this.isWait;
                        this.isVisible = true;
                        if (needAttach) {
                                ComponentHelper.internalBuild.call(this.parent!, this);
                        }
                        return;
                } else {
                        /** A*/
                        const placeholderParent = (this.motif.options.placeholder as Node)?.parentElement;
                        const expectedParent = findAppendableComponent(this.parent!)?.element;

                        if (this.motif.options.placeholder && placeholderParent && placeholderParent !== expectedParent) {
                                reportWarning('MJX106', []);
                                this.isVisible = true;
                                if (this.parent?.isBuilt) {
                                        ComponentHelper.internalBuild.call(this.parent, this);
                                }
                                return;
                        }

                        /** A*/
                        wantsEnterTransition(this) && this.motif.options.transition.enterTransition(() => { });
                        ComponentHelper.callVisibilityChanged(this);
                        if ((this.element as Node).nodeType === Node.COMMENT_NODE) {
                                this.controls.forEach(c => {
                                        c.motif.show();
                                });
                                this.isVisible = true;
                                ComponentHelper.activateTree(this, false);
                                return;
                        }
                        var parent = (this.motif.options.placeholder as Node)?.parentElement;
                        if (parent) {
                                parent.replaceChild(this.element as Node, this.motif.options.placeholder!);
                                this.isVisible = true;
                                ComponentHelper.activateTree(this);
                        }
                }
        }
        private async _hide(): Promise<any> {

                if (this.isDisposed || !this.element) { return; }
                if (!this.isVisible) { return; }

                const strategy = this._computeHideStrategy();
                if (strategy === 'detach') {
                        ComponentHelper.callVisibilityChanged(this);
                        await this._base._detachDomWithAnimationAsync();
                        this.isVisible = false;
                        ComponentHelper.deactivateTree(this);
                        return;
                } else {
                        const transition = this.motif.options.transition;
                        const skip = transition.skipNextLeave === true;
                        if (skip) transition.skipNextLeave = false;
                        const finish = () => {
                                ComponentHelper.callVisibilityChanged(this);
                                if ((this.element as Node).nodeType === Node.COMMENT_NODE) {
                                        this.controls.forEach(c => {
                                                if (skip && c.isVisible && c.element && !c.isDisposed && c.motif.options?.transition) {
                                                        c.motif.options.transition.skipNextLeave = true;
                                                }
                                                c.motif.hide();
                                        });
                                        this.isVisible = false;
                                        ComponentHelper.deactivateTree(this, false);
                                        return;
                                }
                                var parent = (this.element as Node).parentElement;
                                // if (!parent) {
                                //         var parentComp = findAppendableComponent(this.parent!);
                                //         if (parentComp && parentComp.isBuilt) {
                                //         } else {
                                if (parent) {
                                        if (!this.motif.options.placeholder) this.motif.options.placeholder = dom.createComment("h");
                                        parent.replaceChild(this.motif.options.placeholder!, this.element as Node);

                                }
                                this.isVisible = false;
                                ComponentHelper.deactivateTree(this);
                        };
                        if (skip) {
                                finish();
                                return;
                        }
                        return transition.leaveTransition(finish).finished;
                }

        }
        private _toggle() {
                if (this.isDisposed || !this.element) { return; }
                if (this.isVisible) {
                        this.motif.hide();
                } else {
                        this.motif.show();
                }
        }

        private async _on<K extends keyof HtmlElementEvents>(event: K, cb: (sender: ComponentBase | this, ev: HtmlElementEvents[K]) => any, domEvent: boolean = true): Promise<this> {
                if (this.isDisposed || !this.element) {
                        return this;
                }

                const full = String(event);
                if (full.startsWith("x:")) {
                        const xName = full.slice(2).toLowerCase();
                        if (xName === "mounted") {
                                let sub: IDisposable | undefined;
                                const stop = onElementAttached(this.element as Element, () => {
                                        if (sub) {
                                                this._base._mountedSubs?.get(cb)?.delete(sub);
                                                this._disposables.detach(sub);
                                        }
                                        if (this.isDisposed) { return; }
                                        const ev = { cancel: false } as EventArgs;
                                        callReported(() => (cb as any).length <= 1 ? (cb as any)(ev) : cb(this, ev as any), 'MJX122', 'x:mounted');
                                });
                                if (stop) {
                                        sub = this._register(disposableCore.toDisposable(stop));
                                        const subs: Map<Function, Set<IDisposable>> = this._base._mountedSubs ??= new Map();
                                        let set = subs.get(cb);
                                        if (!set) { set = new Set(); subs.set(cb, set); }
                                        set.add(sub);
                                }
                                return this;
                        }
                        if (LIFECYCLE_X_EVENTS.has(xName)) {
                                this._base.emiters.on("on" + xName, cb as any);
                                return this;
                        }
                }

                const [name, ...mods] = full.split(":");
                const evt = name.startsWith("on") ? name.slice(2).toLowerCase() : name.toLowerCase();
                const options: AddEventListenerOptions = {};
                if (mods.includes("once")) options.once = true;
                if (mods.includes("passive")) options.passive = true;
                if (mods.includes("capture")) options.capture = true;

                const wrapped = (ev: Event) => {
                        if (mods.includes("self") && ev.target !== this.element) return;
                        if (mods.includes("trusted") && !ev.isTrusted) return;
                        let res: any;
                        try {
                                if (cb && (cb as any).length <= 1) {
                                        res = (cb as any)(ev as any);
                                } else if (cb) {
                                        res = cb(this, ev as any);
                                }
                        } catch (error) {
                                reportError('MJX123', error, evt);
                        }
                        if (res && typeof res.then === 'function') {
                                res.then(undefined, (error: unknown) => reportError('MJX123', error, evt));
                        }
                        const prevent = () => { if (typeof (ev as any)?.preventDefault === 'function') ev.preventDefault(); };
                        const stop = () => { if (typeof (ev as any)?.stopPropagation === 'function') ev.stopPropagation(); };
                        if (mods.includes("prevent")) { prevent(); }
                        if (mods.includes("stop")) { stop(); }
                        if (res === false || (res && (res as any).cancel === true)) {
                                prevent();
                                stop();
                        }
                };
                if (domEvent) {
                        (this.element as any).addEventListener(evt, wrapped as EventListener, options);
                }


                this._eventHandlers ??= new Map();
                const key = full.toLowerCase();
                const set = this._eventHandlers.get(key) ?? new Set();
                set.add({ original: cb as any, wrapped, capture: !!options.capture, domEvent: !!domEvent, type: evt });
                this._eventHandlers.set(key, set);
                this._register(disposableCore.toDisposable(() => {
                        this.motif.off(event, cb);
                }));
                return this;
        }

        private async _trigger(event: any, ev: any): Promise<this> {
                if (this.isDisposed || !this.element) {
                        return this;
                }
                const name = String(event).toLowerCase();
                safeCall(() => {
                        var eh = this._eventHandlers?.get(name);
                        if (eh) {
                                eh.forEach(rec => {
                                        try {
                                                (rec.wrapped as any)(ev);
                                        } catch {

                                        }
                                });
                        }
                }, 'trigger');
                return this;
        }
        private async _off<K extends keyof HtmlElementEvents>(event: K, cb: (sender: ComponentBase | this, ev: HtmlElementEvents[K]) => any): Promise<this> {
                if (this.isDisposed || !this.element) {
                        return this;
                }

                const full = String(event).toLowerCase();
                if (full.startsWith("x:")) {
                        const xName = full.slice(2);
                        if (xName === "mounted") {
                                const set = this._base._mountedSubs?.get(cb);
                                if (set) {
                                        this._base._mountedSubs.delete(cb);
                                        for (const sub of set) {
                                                this._disposables.delete(sub);
                                        }
                                }
                                return this;
                        }
                        if (LIFECYCLE_X_EVENTS.has(xName)) {
                                this._base.emiters.off("on" + xName, cb as any);
                        }
                        return this;
                }
                const name = full.split(":")[0];
                const evt = name.startsWith("on") ? name.slice(2).toLowerCase() : name.toLowerCase();
                if (!this._eventHandlers) return this;
                const set = this._eventHandlers.get(full);
                if (!set) return this;
                for (const rec of Array.from(set)) {
                        if (rec.original === (cb as any)) {
                                if ((rec as any).domEvent !== false) {
                                        const cap = (rec as any).capture === true;
                                        safeCall(() => { (this.element as any).removeEventListener(evt, rec.wrapped as EventListener, cap); }, 'off.removeEventListener');
                                        safeCall(() => {
                                                if ((rec as any).capture === undefined) {
                                                        (this.element as any).removeEventListener(evt, rec.wrapped as EventListener, !cap);
                                                }
                                        }, 'off.removeEventListener.fallback');
                                }
                                set.delete(rec);
                                break;
                        }
                }
                if (set.size === 0) this._eventHandlers.delete(full);
                return this;
        }
        /** Süren bertaraf: ikinci bir dispose/disposeAsync çağrısı yenisini başlatmaz, bunu bekler. */
        private _disposing?: Promise<void>;

        public override dispose(options: IDisposeOptions = { deep: true }): Promise<void> {
                if (this.isDisposed) { return Promise.resolve(); }
                if (!this._disposing) { retireServiceOwner(this); }
                return this._disposing ??= this._disposeCore(options);
        }

        private async _disposeCore(options: IDisposeOptions): Promise<void> {
                if (options?.skipLeaveTransition) {
                        this.motif.options.transition.skipNextLeave = true;
                }
                safeCall(() => {
                        ComponentHelper.callDisposing.call(this, this);
                }, 'dispose.callDisposing');

                // DOM dinleyicileri hemen sökülür, aşağıda isDisposed true olunca off() boşa döner,
                // element null'lanınca da _offAll dom'dan sökülemez — DOM'dan çıkmış öğeye sonradan gelen 
                this._base._offAll();
                this._base._deactivateBindings();

                safeCall(() => {
                        (this.parent?.controls as any)?.silentDetach?.(this, true);
                }, 'dispose.silentDetach');

                this.motif.options.transition.skipNextLeave && await this.motif.stopAnimations();

                await this._base._detachDomWithAnimationAsync();

                if (this.constructor.name !== 'TransportTo') {
                        await disposeContentBlocks(this);
                }
                await safeCallAsync(async () => {
                        if (this.isDisposed) { return; }
                        const ctrls = Array.from(this.controls.items);
                        if (ctrls.length) {
                                await Promise.all(ctrls.map(async c => {
                                        try {
                                                await c.disposeAsync({ deep: options?.deep });
                                        } catch (error) {
                                                reportError('MJX107', error);
                                        }
                                }));
                        }
                }, 'dispose.disposeAsync');

                if (this.isDisposed) { return; }

                this.isDisposed = true;
                super.dispose();
                (this.element as any) = null;


                //if (options?.deep) {




                safeCall(() => {
                        ComponentHelper.callDisposed.call(this, this);
                }, 'dispose.callDisposed');
                safeCall(() => { this._base.emiters.clear(); }, 'dispose.emiters');

                this._base._offAll();
                this._base._deepCleanup();
                // var k = Object.keys(this);
                // for (var i = 0; i < k.length; i++) {
                //         try {
                //         } catch {

        }
        public disposeAsync(options: IDisposeOptions = { deep: true }): Promise<void> {
                if (this.isDisposed) { return Promise.resolve(); }
                if (!this._disposing) { retireServiceOwner(this); }
                return this._disposing ??= this._disposeAsyncCore(options);
        }

        private async _disposeAsyncCore(options: IDisposeOptions): Promise<void> {

 
                safeCall(() => {
                        ComponentHelper.callDisposing.call(this, this);
                }, 'disposeAsync.callDisposing');
                this._base._offAll();
                this._base._deactivateBindings();
                safeCall(() => {

                        (this.parent?.controls as any)?.silentDetach?.(this, true);
                }, 'disposeAsync.silentDetach');
                await this.motif.stopAnimations();
                await this._base._detachDomWithAnimationAsync();
                await safeCallAsync(async () => {
                        if (this.isDisposed) { return; }
                        const ctrls = Array.from(this.controls.items);
                        if (ctrls.length) {
                                await Promise.all(ctrls.map(c =>
                                        safeCallAsync(async () => {
                                                await c.disposeAsync({ deep: options?.deep });
                                        }, 'disposeAsync.disposeAsyncChildren.handler')
                                ));
                        }
                }, 'disposeAsync.disposeAsyncChildren');



                this.isDisposed = true;
                super.dispose();

                this.controls.items = [];
                safeCall(() => {
                        ComponentHelper.callDisposed.call(this, this);
                }, 'disposeAsync.callDisposed');
                safeCall(() => { this._base.emiters.clear(); }, 'disposeAsync.emiters');

                if (options?.deep) {
                        this._base._deepCleanup();
                }
                // var k = Object.keys(this);
                // for (var i = 0; i < k.length; i++) {
                //         try {
                //         } catch { }
        }


        protected async _clear(): Promise<any> {
                if (this.isDisposed == true) { return; }
                if (this.motif.options && this.motif.options.disableDisposal) { return; };
                await this.controls.clearAsync();
                //if (this.onupdated) this.onupdated(this as any, { data: this.model, field: '', source: 'clear' })
                // return new Promise((resolveOuter: any) => {
                //         this.controls.forEach(async (control, index) => {
                //                 if (index === this.controls.length - 1) {
                //                         dom.window.setTimeout(resolveOuter, 0);
                //                 await control.dispose();
        }

        using<T>(waitable: Promise<any>, onfulfilled?: ((value: T) => T | PromiseLike<T>) | undefined | null, onrejected?: ((reason: any) => never | PromiseLike<never>) | undefined | null) {
                waitable.then(
                        (value: T) => { this && !this.isDisposed && onfulfilled ? onfulfilled(value) : ''; },
                        (reason: any) => { this && !this.isDisposed && onrejected ? onrejected(reason) : '' });
        }
        doWork<T>(waitable: Promise<T> | PromiseLike<T>): Promise<T> {
                return Promise.resolve(waitable).then((value: T) => {
                        if (this && !this.isDisposed) {
                                return value
                        } else {
                                return motifError('MJX108');
                        };
                }) as Promise<T>;
        }

        siblings = {
                all: () => { return this.parent?.controls.items },
                next: () => {
                        if (!this.parent) return undefined;
                        const idx = this.parent.controls.items.indexOf(this);
                        return this.parent.controls.items[idx + 1];
                },
                prev: () => {
                        if (!this.parent) return undefined;
                        const idx = this.parent.controls.items.indexOf(this);
                        return this.parent.controls.items[idx - 1];
                },
                nextAll: () => {
                        if (!this.parent) return undefined as any;
                        const idx = this.parent.controls.items.indexOf(this);
                        return this.parent.controls.items.slice(idx + 1);
                },
                prevAll: () => {
                        if (!this.parent) return undefined as any;
                        const idx = this.parent.controls.items.indexOf(this);
                        return this.parent.controls.items.slice(0, idx);
                }
        };

        public get serviceProvider(): ServiceProvider | null {
                let c: ComponentBase | null = this as unknown as ComponentBase;
                while (c) {
                        const p = (c as any).provider as ServiceProvider | undefined;
                        if (p) return p;
                        c = c.parent;
                }
                try { return Application.main?.provider ?? null; } catch { return null; }
        }

        public getService<T = any>(token: any): T | null {
                try {

                        const sp = this.serviceProvider;
                        if (sp) {
                                return sp._getFor<T>(this, token);
                        }
                        reportWarning('MJX407', [describeServiceToken(token)], { token });
                } catch (err) {
                        reportWarning('MJX408', [describeServiceToken(token), String((err as any)?.message ?? err)], { token, error: err });
                }
                return null;
        }
        $(selector: string) {
                if (this.isDisposed || !this.element) {
                        return {
                                fromDom: () => null,
                                fromComponent: () => [] as ComponentBase[]
                        };
                }
                var result = {
                        fromDom: () => {
                                var findContainer = findAppendableComponent(this)?.element;
                                var findingTarget;
                                if (!findContainer) {
                                        findingTarget = document;
                                } else {
                                        findingTarget = findContainer;
                                }
                                if (findingTarget) {
                                        var elements = findingTarget.querySelectorAll(selector);
                                        return elements;
                                }
                                return null;
                        },
                        fromComponent: () => {
                                const findingComponent = findAppendableComponent(this);
                                const root = findingComponent ?? this;
                                const found: ComponentBase[] = [];
                                const walk = (cmp: ComponentBase) => {
                                        const el = cmp.element as any;
                                        if (el && el.nodeType === Node.ELEMENT_NODE) {
                                                const matches: ((sel: string) => boolean) | undefined = (el.matches || el.msMatchesSelector || el.webkitMatchesSelector);
                                                if (typeof matches === 'function') {
                                                        try { if (matches.call(el, selector)) { found.push(cmp); } } catch { }
                                                }
                                        }
                                        if (cmp.controls && cmp.controls.items && cmp.controls.items.length) {
                                                for (const child of cmp.controls.items) { walk(child); }
                                        }
                                };

                                walk(root);
                                return found;
                        }
                }
                return result;
        }

        private async _stopAnimations() {

                try { this.motif.options?.transition?.activeCssCancel?.(); } catch { }
                try {
                        if (this.motif.options?.transition?.activeAnimations?.length) {
                                try {
                                        await Promise.all(this.motif.options.transition.activeAnimations.map(a =>
                                                a.finished?.catch(() => { })
                                        ));
                                } catch { /* ignore */ }
                        }

                } catch (error) {

                }
                if (this.isDisposed) return;
                this.motif.options.transition.activeAnimations = [];
        }
        //         return this;

}


function findContentBlocks(root: ComponentBase, results: ComponentBase[] = []): ComponentBase[] {
        if (!root || root.isDisposed) return results;

        if (root.constructor.name === 'TransportTo') {
                results.push(root);
        }
        if (root.controls && root.controls.items) {
                root.controls.items.forEach(child => findContentBlocks(child, results));
        }

        return results;
}

async function disposeContentBlocks(root: ComponentBase): Promise<any> {
        const contentBlocks = findContentBlocks(root);
        return await Promise.all(contentBlocks.map(async (block) => {
                block.motif.options.transition.skipNextLeave = root.motif.options.transition.skipNextLeave;
                for (const element of block.controls.items) {
                        element.motif.options.transition.skipNextLeave = block.motif.options.transition.skipNextLeave;
                        element.dispose({ skipLeaveTransition: true });
                        element.isDisposed = true;
                }
                await block.dispose()
        }));
}

const _appliedRefs = new WeakMap<object, Set<Function>>();

export function takePendingRefs(component: ComponentBase, ref: any): Function[] {
        const fns: Function[] = (Array.isArray(ref) ? ref : [ref]).filter((fn: any) => typeof fn === 'function');
        if (fns.length === 0) return fns;
        let applied = _appliedRefs.get(component);
        if (!applied) {
                applied = new Set();
                _appliedRefs.set(component, applied);
        }
        const pending: Function[] = [];
        for (const fn of fns) {
                if (applied.has(fn)) continue;
                applied.add(fn);
                pending.push(fn);
        }
        return pending;
}

const isCallableRef = (ref: any): boolean => typeof ref === 'function' || Array.isArray(ref);

export function extractRefs(props: any, component?: ComponentBase): any[] {
        const refs: any[] = [];
        if (!props || typeof props !== 'object') return refs;
        if (Object.prototype.hasOwnProperty.call(props, 'ref')) {
                if (isCallableRef(props.ref)) {
                        refs.push(props.ref);
                        delete props.ref;
                } else if (component && props.ref && typeof props.ref === 'object') {
                        props.ref = component;
                }
        }
        const runover = props.runover;
        if (runover && typeof runover === 'object' && Object.prototype.hasOwnProperty.call(runover, 'ref')) {
                if (isCallableRef(runover.ref)) {
                        refs.push(runover.ref);
                        const rest = { ...runover };
                        delete rest.ref;
                        props.runover = rest;
                } else if (component && runover.ref && typeof runover.ref === 'object') {
                        runover.ref = component;
                }
        }
        return ([] as any[]).concat(...refs);
}

const LIFECYCLE_HANDLER_LISTS: Record<string, keyof LifecycleStorage> = {
        'initializecomponent': '_initializeComponentHandlers',
        'oninitializecomponent': '_onInitializeComponentHandlers',
        'onbuilding': '_onBuildingHandlers',
        'onbuilt': '_onBuiltHandlers',
        'onmounted': '_onMountedHandlers',
        'oninitializing': '_onInitializingHandlers',
        'oninitialized': '_onInitializedHandlers',
        'onconfig': '_onConfigHandlers',
        'onconfigured': '_onConfiguredHandlers',
        'onvisibilitychanged': '_onVisibilityChangedHandlers',
        'onactivated': '_onActivatedHandlers',
        'ondeactivated': '_onDeactivatedHandlers',
        'ondisposing': '_onDisposingHandlers',
        'ondisposed': '_onDisposedHandlers',
};

function collectLifecycleHandlers(component: ComponentBase, lowerKey: string, value: any): boolean {
        const listName = Object.prototype.hasOwnProperty.call(LIFECYCLE_HANDLER_LISTS, lowerKey) ? LIFECYCLE_HANDLER_LISTS[lowerKey] : undefined;
        if (!listName) return false;
        const fns: any[] = Array.isArray(value) ? value : [value];
        if (fns.length === 0 || !fns.every(fn => typeof fn === 'function')) return false;
        (component as any)._base[listName] ??= [];
        const list = (component as any)._base[listName] as Function[];
        for (const fn of fns) {
                if (!list.includes(fn)) list.push(fn);
        }
        return true;
}

export function ParseProps(props: any, component: ComponentBase): any {
        if (props) {
                if (component.motif.options.props) {
                        Object.assign(component.motif.options.props, props);
                } else {
                        component.motif.options.props = {};
                        Object.assign(component.motif.options.props, props);
                }
                var keys = Object.keys(props);
                keys.forEach(key => {
                        if (key == 'initializeComponent' || key == 'oninitializeComponent' || key.startsWith('on')) {
                                if (collectLifecycleHandlers(component, key.toLowerCase(), props[key])) {
                                        delete props[key];
                                        return;
                                }
                        } else if (key == 'childs') {
                                const flat: ComponentBase[] = ([] as any[]).concat(...props[key] as any);
                                component.childs = flat;
                                delete props[key];
                        } else if (key === 'transition') {
                                applyTransitionProp(props[key], component);
                                delete props[key];
                        } else if (componentMethods.hasOwnProperty(key.toLowerCase()) || componentMethods.hasOwnProperty("on" + key.toLowerCase())) {
                                var eventKey;
                                if (!key.toLowerCase().startsWith("on") && key.toLowerCase() !== "initializecomponent") {
                                        eventKey = "on" + key;
                                } else {
                                        eventKey = key;
                                }
                                (component as any)[eventKey] = props[key];
                                delete props[key];
                        } else if (key.startsWith("on")) {

                                component.motif.on(key as any, props[key]);
                        } else if (key.startsWith("x-")) {

                                var nkey = key.replace("x-", "on");
                                if (key.toLowerCase() == "x-wait") {
                                        component.bindings.wait(props[key]);

                                } else if (key.toLowerCase() == "x-display") {
                                        component.bindings.display(props[key]);
                                } else {
                                        if (collectLifecycleHandlers(component, nkey.toLowerCase(), props[key])) {
                                                delete props[key];
                                                return;
                                        }
                                }


                                delete props[key];
                        } else if (key.startsWith("runover")) {

                                ParseProps(props[key], component);
                                delete props[key];
                        } else if (key.startsWith("preconfig")) {
                                component.motif.options._preconfig = props[key];
                                delete props[key];
                        } else {
                                // var callback = props[key];
                                // if (typeof callback === "function") {
                                // } else {
                        }
                });
        }
}

const _transitionSources = new WeakMap<ComponentBase, any>();

function setTransition(component: ComponentBase, value: any, live: boolean): void {
        const transition = component.motif.options.transition;
        if (typeof value === 'string' && value.length > 0) {
                transition.name = value;
                if (live) transition.classes = undefined;
        } else if (value && typeof value === 'object') {
                if (typeof value.name === 'string' && value.name.length > 0) {
                        transition.name = value.name;
                }
                transition.classes = value;
        } else if (live) {
                transition.name = '';
                transition.classes = undefined;
        }
}

export function applyTransitionProp(value: any, component: ComponentBase): void {
        if (!component || component.isDisposed) return;
        if (value === undefined || value === null) return;
        if (_transitionSources.get(component) === value) return;
        _transitionSources.set(component, value);
        if (typeof value === 'function') {
                component.bindings.watch(() => {
                        const current = value();
                        if (component.isDisposed) return;
                        setTransition(component, current, true);
                });
                return;
        }
        setTransition(component, value, false);
}

export function isComponentLike(value: any): boolean {
        if (value instanceof ComponentBase) return true;
        return Array.isArray(value) && value.length > 0 && value.every(x => x instanceof ComponentBase);
}

const _textBindingWarned = new WeakSet<object>();

function warnComponentInTextBinding(component: ComponentBase, value: any): void {
        if (_textBindingWarned.has(component)) return;
        _textBindingWarned.add(component);
        reportWarning('MJX204', [], { value: Array.isArray(value) ? `ComponentBase[${value.length}]` : 'ComponentBase' });
}

const COMPONENT_OPTION_KEYS = ['hideStrategy', 'disableDisposal'] as const;

export function applyComponentOptions(source: any, component: ComponentBase): void {
        if (!source || typeof source !== 'object' || !component || component.isDisposed) return;
        for (const key of COMPONENT_OPTION_KEYS) {
                if (source[key] !== undefined) (component.motif.options as any)[key] = source[key];
        }
}

/** `applyPlainElementProps`'un DOM'a yazmayacağı çerçeve anahtarları. */
const PLAIN_ELEMENT_SKIP = new Set([
        'ref', 'key', 'indexkey', 'inject', 'options', 'props', 'settings', 'isSvg',
        'childs', 'initializeComponent', 'runover', 'transition', 'preconfig', 'nodes', 'onElementCreating'
]);

export function applyPlainElementProps(props: any, component: ComponentBase): void {
        if (!props || typeof props !== 'object' || component.isDisposed) return;
        const attrs: Record<string, any> = {};
        const applied = appliedDomProps(component);
        for (const key of Object.keys(props)) {
                if (PLAIN_ELEMENT_SKIP.has(key)) continue;
                if (key.startsWith('x-') || key.startsWith('x:') || key.startsWith('__')) continue;
                const v = props[key];
                if (v === undefined) continue;
                if (/^on/i.test(key)) {
                        if (typeof v === 'function') component.motif.on(key as any, v as any);
                        continue;
                }
                if (typeof v === 'function' && v.length > 0) continue;
                applied.set(key, v);
                if (key === 'class' || key === 'className') {
                        component.class.add(v && typeof v === 'object' && !Array.isArray(v) ? [v] : v);
                } else if (key === 'style') {
                        component.style(v);
                } else if (key === 'value' || key === 'checked' || key === 'selected') {
                        component.bindings.add(key, v);
                } else {
                        attrs[key] = v;
                }
        }
        if (Object.keys(attrs).length > 0) component.attr.add(attrs);
}

const _appliedDomProps = new WeakMap<ComponentBase, Map<string, any>>();
function appliedDomProps(component: ComponentBase): Map<string, any> {
        let m = _appliedDomProps.get(component);
        if (!m) { m = new Map(); _appliedDomProps.set(component, m); }
        return m;
}

/** Bileşen etiketinden köke düşen ortak öznitelikler. */
const FALLTHROUGH_KEYS = new Set(['class', 'className', 'style', 'id', 'tabindex', 'role']);
function isFallthroughKey(key: string): boolean {
        return FALLTHROUGH_KEYS.has(key) || key.startsWith('aria-') || key.startsWith('data-');
}

export function applyFallthroughProps(props: any, component: ComponentBase): void {
        if (!props || typeof props !== 'object' || component.isDisposed) return;
        const applied = appliedDomProps(component);
        const subset: Record<string, any> = {};
        for (const key of Object.keys(props)) {
                if (!isFallthroughKey(key)) continue;
                const v = props[key];
                if (v === undefined || v === null) continue;
                if (typeof v === 'function' && v.length > 0) continue;
                if (applied.has(key) && Object.is(applied.get(key), v)) continue;
                subset[key] = v;
        }
        if (Object.keys(subset).length > 0) applyPlainElementProps(subset, component);
}

const componentMethods: Record<string, unknown> = {
        "oninitializecomponent": (sender: ComponentBase, e: EventArgs) => { },
        "initializecomponent": (sender: ComponentBase, e: EventArgs) => { },
        "onconfigured": (sender: ComponentBase, e: EventArgs) => { },
        "onconfig": (sender: ComponentBase, e: EventArgs) => { },
        "onbuilding": (sender: ComponentBase, e: EventArgs) => { },
        "onbuilt": (sender: ComponentBase, e: EventArgs) => { },
        "onmounted": (sender: ComponentBase, e: EventArgs) => { },
        "oninitializing": (sender: ComponentBase, e: EventArgs) => { },
        "oninitialized": (sender: ComponentBase, e: EventArgs) => { },
        "ondisposing": (sender: ComponentBase, e: EventArgs) => { },
        "ondisposed": (sender: ComponentBase, e: EventArgs) => { },
        "onvisibilitychanged": (sender: ComponentBase, e: EventArgs) => { },
        "ondeactivated": (sender: ComponentBase, e: EventArgs) => { },
        "onactivated": (sender: ComponentBase, e: EventArgs) => { },
};


function findAppendableComponent(component: ComponentBase): ComponentBase | null | undefined {

        return safeCall<ComponentBase | null | undefined>(() => {
                if (!component || component.isDisposed) return null;
                if (component.element.nodeType !== Node.COMMENT_NODE && component.element.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && component.element.nodeType !== Node.TEXT_NODE) {
                        return component;
                } else if (component.parent) {
                        return findAppendableComponent(component.parent);
                }
                return null;
        }, 'findAppendableComponent', null);

}


function findParentElement(component: ComponentBase): ComponentBase | null {

        try {
                if (component.isDisposed) return null;
                if (component.element.nodeType !== Node.COMMENT_NODE && component.element.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && component.element.nodeType !== Node.TEXT_NODE) {
                        return component;
                } else if (component.parent) {
                        return findParentElement(component.parent);
                }
        } catch (error) {
                throw error;
        }
        return null;
}


function onElementAttached(element: Element, callback: () => any): (() => void) | null {
        if (document.contains(element)) {
                callback();
                return null;
        }

        let done = false;
        const observer = new MutationObserver(() => {
                if (done) { return; }
                if (document.contains(element)) {
                        done = true;
                        observer.disconnect();
                        callback();
                }
        });

        observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
        });

        return () => {
                if (done) { return; }
                done = true;
                try { observer.disconnect(); } catch { /* ignore */ }
        };
}

export function notifyActivated(component: ComponentBase): void {
        unpinServiceOwner(component);
        ComponentHelper.activateTree(component);
}
export function notifyDeactivated(component: ComponentBase): void {
        pinServiceOwner(component);
        ComponentHelper.deactivateTree(component);
}