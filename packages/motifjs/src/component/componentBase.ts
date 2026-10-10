import { ControlCollection, dom, Disposable, disposableCore, IClass, IDisposable, Application, isExactMatch, startsWithPath, reactive, safeCallSilent, safeCallSilentAsync, safeCall, safeCallAsync } from "..";
import { ServiceProvider } from "..";
import { BindingCollection, IBaseBinding } from "../bindings";
import { effect } from "../store/reactivity-core";
import { ComponentEmiter } from "./ComponentEmiter";
import { controlAttribute } from "./controlAttribute";
import { controlClass } from "./controlClass";
import { ComponentBaseOptions, ElementType, EventArgs, HtmlElementEvents, OptionalParams, RouterClassingSettings, shimAnimation, VisibilityChangedEventArgs } from "./types";
import { UnwrapValueRefs } from "../store/common";
import { getTransitionInfo, runCssTransition, TransitionProps } from "../common/transition";
import { callReported, motifError, reportError, reportWarning } from "../common/diagnostics";
import { ComponentMotif } from "./ComponentMotif";
import { pinServiceOwner, recordServiceOwner, retireServiceOwner, unpinServiceOwner } from "../dependencyInjection/ServiceProvider";
import { contentBlocks as liveContentBlocks } from "./contentBlockRegistry";
import { OPTIONS_OWNER, TRANSITION_SLOT } from "./optionsSlots";
import { deferUntilEntered, isTransitionMode, pendingLeaves, trackEnter, trackLeave, transitionSettings, TransitionMode } from "../common/transitionRegistry";
import { lazyBindMethods } from "../common/lazyBind";
import type { MotifDomEventProps } from "../jsx-runtime";
import { isDevLike } from "../devtools/devbus";

/** DI token'ını okunur biçime çevirir (dev uyarıları için). */
function describeServiceToken(t: any): string {
        if (typeof t === 'string') return t;
        if (typeof t === 'symbol') return t.toString();
        if (typeof t === 'function') return t.name || '[AnonymousClass]';
        return String(t);
}

type TransitionApi = ComponentBaseOptions<any>['transition'];

function peekTransition(c: any): TransitionApi | undefined {
        return c?.motif?.options?.[TRANSITION_SLOT];
}

/**WAAPI keyframe (transitionIn) YA DA CSS class transition (name/classes) tanımlı olarak enter animasyonu varmı */
function clearNavDirection(c: any): void {
        const t = peekTransition(c);
        if (!t?._markedDirection) return;
        t._markedDirection = false;
        try { (c.element as any)?.removeAttribute?.('data-nav-direction'); } catch { }
}

function enterModeOf(container: any): TransitionMode {
        let c = container;
        while (c) {
                const mode = peekTransition(c)?.mode;
                if (mode) return mode;
                const node = c.element as Node | null;
                if (!node || node.nodeType !== Node.COMMENT_NODE) break;
                c = c.parent ?? c._base?._leaveContainer;
        }
        return transitionSettings.mode;
}

function leaveModeOf(c: any): TransitionMode {
        return enterModeOf(c.parent ?? c._base?._leaveContainer);
}

function wantsEnterTransition(c: any): boolean {
        const o = c?.motif?.options;
        const t = o?.[TRANSITION_SLOT];
        return !!(o?.transitionIn || (t && (t.classes || (t.name && t.name.length > 0))));
}

function createTransitionApi(owner: ComponentBase): TransitionApi {
        const cur = (): TransitionApi => (owner.motif.options as any)?.[TRANSITION_SLOT] ?? t;
        const t: TransitionApi = {
                transitionInfo: () => {
                        const s = cur();
                        return {
                                in: getTransitionInfo(owner.element as Element, `${s.name}-enter ${s.name}-enter-start`),
                                out: getTransitionInfo(owner.element as Element, `${s.name}-leave ${s.name}-leave-start`),
                        }
                },
                name: '',
                mode: undefined as TransitionMode | undefined,
                classes: undefined as TransitionProps | undefined,
                activeCssCancel: null as (() => void) | null,
                activeCssPhase: null as ('enter' | 'leave' | null),
                cssProps: (): TransitionProps | null => {
                        const s = cur();
                        if (s.classes) {
                                return { name: s.classes.name || s.name || '', ...s.classes };
                        }
                        if (s.name && s.name.length > 0) {
                                return { name: s.name };
                        }
                        return null;
                },
                skipNextLeave: false,
                _suppressEnter: false,
                _markedDirection: false,
                in: (op) => {
                        owner.motif.options.transitionIn = op;
                },
                out: (op) => {
                        owner.motif.options.transitionOut = op;
                },
                enterTransition: (resolve: () => void): Animation => {
                        const s = cur();
                        const base = (owner as any)._base;
                        const appear = !base._enterPlayed;
                        base._enterPlayed = true;
                        base._enterSeq = (base._enterSeq ?? 0) + 1;
                        if (s._suppressEnter) {
                                resolve && resolve();
                                return shimAnimation as Animation;
                        }
                        const attempt = {};
                        base._enterRun = attempt;
                        const enter = trackEnter(owner.element as unknown as Node, () => {
                                if ((owner as any)._base?._enterRun === attempt) {
                                        (owner as any)._base._enterRun = null;
                                        clearNavDirection(owner);
                                }
                                resolve && resolve();
                        }, owner.motif.options.placeholder as Node | undefined);
                        const transitionIn = owner.motif.options.transitionIn;
                        const animation = transitionIn
                                ? s.run(transitionIn.keyframes, transitionIn.options, enter.done)
                                : s._runCss('enter', enter.done, appear);
                        if (animation && animation !== (shimAnimation as unknown as Animation) && typeof (animation as any).addEventListener === 'function') {
                                (animation as any).addEventListener('cancel', enter.release);
                        }
                        return animation;
                },
                leaveTransition: (resolve: () => void): Animation => {
                        const s = cur();
                        const node = owner.element as unknown as Node;
                        const leave = trackLeave(node, resolve);
                        const play = (): Animation => {
                                const transitionOut = owner.motif.options?.transitionOut;
                                const animation = transitionOut
                                        ? s.run(transitionOut.keyframes, transitionOut.options, leave.done)
                                        : s._runCss('leave', leave.done);
                                if (animation && animation !== (shimAnimation as unknown as Animation) && typeof (animation as any).addEventListener === 'function') {
                                        (animation as any).addEventListener('cancel', leave.release);
                                }
                                return animation;
                        };
                        if (leave.finished && leaveModeOf(owner) === 'in-out') {
                                return deferUntilEntered(node, leave, play);
                        }
                        return play();
                },
                _runCss: (phase: 'enter' | 'leave', resolve: () => void, appear: boolean = false): Animation => {
                        const s = cur();
                        if (phase === 'enter' && s.activeCssPhase === 'leave') {
                                resolve && resolve();
                                return shimAnimation as Animation;
                        }
                        const cssProps = s.cssProps();
                        const el = owner.element as unknown as Element | null;
                        if (cssProps && el && (el as any).nodeType === 1 && (el as any).classList) {
                                try { s.activeCssCancel?.(); } catch { }
                                const cancel = runCssTransition(el, cssProps, phase, () => {
                                        s.activeCssCancel = null;
                                        s.activeCssPhase = null;
                                        resolve && resolve();
                                }, appear);
                                s.activeCssCancel = cancel;
                                s.activeCssPhase = phase;
                                return shimAnimation as Animation;
                        }
                        resolve && resolve();
                        return shimAnimation as Animation;
                },
                activeAnimations: [] as Animation[],
                run: (keyframes, options, resolve) => {
                        const s = cur();
                        owner.motif.stopAnimations();

                        const element = owner.element as unknown as HTMLElement;

                        if (element.animate) {
                                var x = element.animate(keyframes, options);
                                s.activeAnimations.push(x);

                                let cleanedUp = false;
                                const safeCleanup = () => {
                                        if (cleanedUp) return;
                                        cleanedUp = true;
                                        try {
                                                if (s.activeAnimations) {
                                                        s.activeAnimations = s.activeAnimations.filter(a => a !== x);
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
        };
        return t;
}

class ComponentOptionsImpl {
        [OPTIONS_OWNER]: ComponentBase;
        [TRANSITION_SLOT]?: TransitionApi;

        constructor(owner: ComponentBase) {
                this[OPTIONS_OWNER] = owner;
        }

        get transition(): TransitionApi {
                return this[TRANSITION_SLOT] ??= createTransitionApi(this[OPTIONS_OWNER]);
        }

        set transition(value: TransitionApi) {
                this[TRANSITION_SLOT] = value;
        }

        set enableRouterClassing(value: RouterClassingSettings) {
                try {
                        const ins = this[OPTIONS_OWNER];
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
        }

        getInstance(): ComponentBase {
                return this[OPTIONS_OWNER];
        }

        get display(): boolean {
                return this[OPTIONS_OWNER].isVisible;
        }

        set display(value: boolean) {
                if (value) {
                        this[OPTIONS_OWNER].motif.show();
                } else {
                        this[OPTIONS_OWNER].motif.hide();
                }
        }

        hasEvent(name: string): boolean {
                return !!(this[OPTIONS_OWNER] as any)._eventHandlers?.has(name);
        }
}
lazyBindMethods(ComponentOptionsImpl.prototype, ['getInstance', 'hasEvent']);




export type IBaseProp<T extends any> = OptionalParams<T> & MotifDomEventProps & {
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
        onVisibilityChanged?(sender: ComponentBase, e: VisibilityChangedEventArgs): void;
        onActivated?(sender: ComponentBase, e: EventArgs): void;
        onDeactivated?(sender: ComponentBase, e: EventArgs): void;
        runover?: {
                initializeComponent?: (sender: ComponentBase) => void;
        }
        [key: string]: any;
};

type LifecycleHandler = (sender: ComponentBase, e: EventArgs) => void;
type HookSlot = LifecycleHandler | LifecycleHandler[];
interface LifecycleStorage {
        _initializeComponentHandlers?: HookSlot;
        _onInitializeComponentHandlers?: HookSlot;
        _onBuildingHandlers?: HookSlot;
        _onBuiltHandlers?: HookSlot;
        _onMountedHandlers?: HookSlot;
        _onInitializingHandlers?: HookSlot;
        _onInitializedHandlers?: HookSlot;
        _onConfigHandlers?: HookSlot;
        _onConfiguredHandlers?: HookSlot;
        _onVisibilityChangedHandlers?: HookSlot;
        _onActivatedHandlers?: HookSlot;
        _onDeactivatedHandlers?: HookSlot;
        _onDisposingHandlers?: HookSlot;
        _onDisposedHandlers?: HookSlot;
}
interface BaseCtx extends LifecycleStorage {
        owner: ComponentBase;
        prebinding_Activated: boolean;
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
        _emiters?: ComponentEmiter;
        itemRef?: any;
        [key: string]: any;
}

function fireLifecycle(component: any, name: string, ev: EventArgs): void {
        const base = component._base;
        if (base) base._emiters?.fire(name, ev);
}

function runHooks(base: any, listName: keyof LifecycleStorage, sender: any, ev: EventArgs, label: string): void {
        let slot: HookSlot | undefined = base[listName];
        if (!slot) return;
        let from = 0;
        if (typeof slot === 'function') {
                const fn = slot;
                callReported(() => fn(sender, ev), 'MJX122', label);
                slot = base[listName];
                if (!Array.isArray(slot)) return;
                from = 1;
        }
        for (let i = from; i < slot.length; i++) {
                const fn = slot[i];
                callReported(() => fn(sender, ev), 'MJX122', label);
        }
}

function hasLifecycleHook(component: any, hook: string, listName: keyof LifecycleStorage, lowerName: string, legacyProp?: string): boolean {
        if (component[hook]) return true;
        if (component._base[listName]) return true;
        if (legacyProp && component[legacyProp]) return true;
        return !!component._base._emiters?.hasListeners(lowerName);
}

const RESERVED_METHODS = ['build', 'setState', 'reState', 'setText', 'style', 'dispose', 'disposeAsync', 'using', 'doWork', 'getService', '$', 'useModel', 'context', 'siblings', 'serviceProvider', 'isWait'];
const checkedComponentClasses = new WeakSet<Function>();

function callsSuper(fn: unknown, name: string): boolean {
        if (typeof fn !== 'function') return false;
        const escaped = name.replace(/\$/g, '\\$');
        return new RegExp(`\\bsuper\\s*(\\.\\s*${escaped}(?![\\w$])|\\[)`).test(Function.prototype.toString.call(fn));
}

function reservedMemberProblems(c: ComponentBase): Array<[string, 'method' | 'field' | 'replaced']> {
        const problems: Array<[string, 'method' | 'field' | 'replaced']> = [];
        const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
        for (const name of RESERVED_METHODS) {
                if (own(c, name)) { problems.push([name, 'field']); continue; }
                for (let p = Object.getPrototypeOf(c); p && p !== ComponentBase.prototype; p = Object.getPrototypeOf(p)) {
                        const d = Object.getOwnPropertyDescriptor(p, name);
                        if (!d) continue;
                        const fns = 'value' in d ? [d.value] : [d.get, d.set].filter(Boolean);
                        if (!fns.some(fn => callsSuper(fn, name))) problems.push([name, 'method']);
                        break;
                }
        }
        const anyC = c as any;
        if (!(anyC.motif instanceof ComponentMotif)) problems.push(['motif', 'replaced']);
        if (!(anyC.controls instanceof ControlCollection)) problems.push(['controls', 'replaced']);
        if (!(anyC.class instanceof controlClass)) problems.push(['class', 'replaced']);
        if (!(anyC.attr instanceof controlAttribute)) problems.push(['attr', 'replaced']);
        if (!(anyC.bindings instanceof BindingCollection)) problems.push(['bindings', 'replaced']);
        if (anyC.element != null && typeof Node !== 'undefined' && !(anyC.element instanceof Node)) problems.push(['element', 'replaced']);
        if (anyC.parent != null && !(anyC.parent instanceof ComponentBase)) problems.push(['parent', 'replaced']);
        return problems;
}

export function checkReservedMembers(c: ComponentBase): void {
        if (!isDevLike()) return;
        const ctor = (c as any)?.constructor;
        if (typeof ctor !== 'function' || checkedComponentClasses.has(ctor)) return;
        checkedComponentClasses.add(ctor);
        const name = ctor.name || 'An anonymous component class';
        for (const [member, how] of reservedMemberProblems(c)) {
                reportWarning('MJX128', [name, member, how]);
        }
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
                runHooks(component._base, '_initializeComponentHandlers', sender, ev, 'initializeComponent');
                // 3) class method  oninitializeComponent  
                if (typeof component.oninitializeComponent === 'function') {
                        callReported(() => component.oninitializeComponent(sender, ev), 'MJX122', 'oninitializeComponent');
                }
                // 4) aggregated extra oninitializeComponent handlers (örn, from props)
                runHooks(component._base, '_onInitializeComponentHandlers', sender, ev, 'oninitializeComponent');
        },
        callDisposing(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                if (!hasLifecycleHook(component, 'onDisposing', '_onDisposingHandlers', 'ondisposing', 'ondisposing')) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onDisposing) {
                        callReported(() => component.onDisposing(sender, ev), 'MJX122', 'onDisposing');
                }
                runHooks(component._base, '_onDisposingHandlers', sender, ev, 'onDisposing');
                if (component.ondisposing) {
                        callReported(() => component.ondisposing(sender, ev), 'MJX122', 'ondisposing');
                }
                fireLifecycle(component,'ondisposing', ev);
        },
        callActivated(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onActivated) { callReported(() => component.onActivated(sender, ev), 'MJX122', 'onActivated'); }
                runHooks(component._base, '_onActivatedHandlers', sender, ev, 'onActivated');
                fireLifecycle(component,'onactivated', ev);
        },
        callDeactivated(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onDeactivated) { callReported(() => component.onDeactivated(sender, ev), 'MJX122', 'onDeactivated'); }
                runHooks(component._base, '_onDeactivatedHandlers', sender, ev, 'onDeactivated');
                fireLifecycle(component,'ondeactivated', ev);
        },
        deactivateTree(component: ComponentBase | any, deep: boolean = true) {
                if (!component || component.isDisposed || !component.isBuilt || !component._base || component._base._inactive) { return; }
                component._base._inactive = true;
                ComponentHelper.callDeactivated(component);
                if (!deep || component.isDisposed) { return; }
                for (const c of childrenOf(component).slice()) {
                        if (c && !c.isDisposed && c.isVisible && !c.isWait) {
                                ComponentHelper.deactivateTree(c, true);
                        }
                }
        },
        activateTree(component: ComponentBase | any, deep: boolean = true) {
                if (!component || component.isDisposed || !component._base || !component._base._inactive) { return; }
                component._base._inactive = false;
                ComponentHelper.callActivated(component);
                if (!deep || component.isDisposed) { return; }
                for (const c of childrenOf(component).slice()) {
                        if (c && !c.isDisposed && c.isVisible && !c.isWait) {
                                ComponentHelper.activateTree(c, true);
                        }
                }
        },
        callDisposed(component: ComponentBase | any) {
                if (!component || !component._base || component._base._disposedFired) { return; }
                component._base._disposedFired = true;
                if (hasLifecycleHook(component, 'onDisposed', '_onDisposedHandlers', 'ondisposed', 'ondisposed')) {
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onDisposed) { callReported(() => component.onDisposed(sender, ev), 'MJX122', 'onDisposed'); }
                        runHooks(component._base, '_onDisposedHandlers', sender, ev, 'onDisposed');
                        if (component.ondisposed) { callReported(() => component.ondisposed(sender, ev), 'MJX122', 'ondisposed'); }
                        fireLifecycle(component,'ondisposed', ev);
                }
                try { (globalThis as any).__MOTIF_DEVTOOLS_BUS__?.publish?.('component:disposed', { id: (component as any).id, type: component.constructor?.name }); } catch { }
        },
        callBuilt(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                if (hasLifecycleHook(component, 'onBuilt', '_onBuiltHandlers', 'onbuilt', 'onbuilt')) {
                        const sender = component, ev = { cancel: false } as EventArgs;
                        if (component.onBuilt) { callReported(() => component.onBuilt(sender, ev), 'MJX122', 'onBuilt'); }
                        runHooks(component._base, '_onBuiltHandlers', sender, ev, 'onBuilt');
                        if (component.onbuilt) { callReported(() => component.onbuilt(sender, ev), 'MJX122', 'onbuilt'); }
                        fireLifecycle(component,'onbuilt', ev);
                }
                try { (globalThis as any).__MOTIF_DEVTOOLS_BUS__?.publish?.('component:mounted', { id: (component as any).id, type: component.constructor?.name }); } catch { }
        },
        scheduleMounted(component: ComponentBase | any) {
                if (!component || component.isDisposed || component._base._mountedScheduled) { return; }
                const hasHook = typeof component.onMounted === 'function'
                        || !!component._base._onMountedHandlers
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
                runHooks(component._base, '_onMountedHandlers', sender, ev, 'onMounted');
                if (component.onmounted) { callReported(() => component.onmounted(sender, ev), 'MJX122', 'onmounted'); }
                fireLifecycle(component,'onmounted', ev);
        },
        callBuilding(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                if (!hasLifecycleHook(component, 'onBuilding', '_onBuildingHandlers', 'onbuilding')) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onBuilding) { callReported(() => component.onBuilding(sender, ev), 'MJX122', 'onBuilding'); }
                runHooks(component._base, '_onBuildingHandlers', sender, ev, 'onBuilding');
                fireLifecycle(component,'onbuilding', ev);
        },
        callConfig(component: ComponentBase | any) {
                if (!component || component.isDisposed || component.isConfigured) { return; }
                component.isConfigured = true;

                if (component.motif.options._preconfig) {
                        safeCallSilent(() => component.motif.options._preconfig(component), 'Component._preconfig');
                }

                if (!hasLifecycleHook(component, 'onConfig', '_onConfigHandlers', 'onconfig')) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onConfig) { callReported(() => component.onConfig(sender, ev), 'MJX122', 'onConfig'); }
                runHooks(component._base, '_onConfigHandlers', sender, ev, 'onConfig');
                fireLifecycle(component,'onconfig', ev);
        },
        callConfigured(component: ComponentBase | any) {
                if (component.motif.options && component.motif.options._postconfigdone) {
                        return;
                }
                if (component?._base?._configDeferred && !component.isConfigured) {
                        ComponentHelper.callConfig(component);
                }
                component.motif.options._postconfigdone = true;
                if (!component || component.isDisposed) { return; }
                if (!hasLifecycleHook(component, 'onConfigured', '_onConfiguredHandlers', 'onconfigured')) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onConfigured) { callReported(() => component.onConfigured(sender, ev), 'MJX122', 'onConfigured'); }
                runHooks(component._base, '_onConfiguredHandlers', sender, ev, 'onConfigured');
                fireLifecycle(component,'onconfigured', ev);
        },
        callOnInitialized(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                component.isInitialized = true;
                if (!hasLifecycleHook(component, 'onInitialized', '_onInitializedHandlers', 'oninitialized')) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onInitialized) { callReported(() => component.onInitialized(sender, ev), 'MJX122', 'onInitialized'); }
                runHooks(component._base, '_onInitializedHandlers', sender, ev, 'onInitialized');
                fireLifecycle(component,'oninitialized', ev);
        },
        callOnInitializing(component: ComponentBase | any) {
                if (!component || component.isDisposed) { return; }
                if (!hasLifecycleHook(component, 'onInitializing', '_onInitializingHandlers', 'oninitializing')) { return; }
                const sender = component, ev = { cancel: false } as EventArgs;
                if (component.onInitializing) { callReported(() => component.onInitializing(sender, ev), 'MJX122', 'onInitializing'); }
                runHooks(component._base, '_onInitializingHandlers', sender, ev, 'onInitializing');
                fireLifecycle(component,'oninitializing', ev);
        },
        callVisibilityChanged(component: ComponentBase | any, visible: boolean) {
                if (!component || component.isDisposed) { return; }
                if (!hasLifecycleHook(component, 'onVisibilityChanged', '_onVisibilityChangedHandlers', 'onvisibilitychanged')) { return; }
                const sender = component, ev: VisibilityChangedEventArgs = { cancel: false, visible };
                if (component.onVisibilityChanged) { callReported(() => component.onVisibilityChanged(sender, ev), 'MJX122', 'onVisibilityChanged'); }
                runHooks(component._base, '_onVisibilityChangedHandlers', sender, ev, 'onVisibilityChanged');
                fireLifecycle(component,'onvisibilitychanged', ev);
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
                if (c.isDisposed) return;
                c._base._activatePreBindings();
                if (c.isWait) {
                        if (this.isBuilt) placeTrace(this, c);
                        return;
                }
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


                if (c.isDisposed || this.isDisposed) return;
                c.parent = this;

                const ownItems = this.controls.items;
                const currentIndex = ownItems.length > 0 && ownItems[ownItems.length - 1] === c ? ownItems.length - 1 : ownItems.indexOf(c);

                const appendableElement = findAppendableComponent(this);
                var controlElement = (c.element as Node).nodeType == Node.COMMENT_NODE
                        ? c.motif.options.cache
                        : c.element as unknown as Node;


                if (cisBuilt && (c.element as Node).nodeType == Node.COMMENT_NODE && controlElement?.childNodes.length == 0 && c.controls.length > 0) {

                        controlElement = ComponentHelper.getContent.call(c) as Node;
                }

                const insertHost = appendableElement?.element as Node | undefined;
                const trace = c.motif.options.placeholder as Node | undefined;
                const ownTrace = c.isVisible && trace && insertHost && trace.parentNode === insertHost ? trace : null;
                const referenceNode: Node | null = ownTrace ?? (insertHost ? followingAnchor(this, currentIndex + 1, insertHost) : null);

                if (!c.isVisible) {
                        if (keepsTrace(c)) {
                                if (!(c as any).motif.options.placeholder) {
                                        (c as any).motif.options.placeholder = dom.createComment("h");
                                }
                                controlElement = ((c as any).motif.options.placeholder as unknown as Node);
                        } else {
                                return;
                        }
                }

                if (insertHost && enterModeOf(this) === 'out-in') {
                        const wait = pendingLeaves(insertHost, controlElement);
                        if (wait) {
                                c._base._enterSeq = (c._base._enterSeq ?? 0) + 1;
                                wait.then(() => {
                                        if (this.isDisposed || c.isDisposed || c.parent !== this) return;
                                        ComponentHelper.internalBuild.call(this, c);
                                });
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
                        if (ownTrace && ownTrace.parentNode) ownTrace.parentNode.removeChild(ownTrace);
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
                                const node = child.isWait || !child.isVisible
                                        ? (keepsTrace(child) ? ((child.motif.options as any).placeholder ??= dom.createComment("h")) as Node : undefined)
                                        : ComponentHelper.getContent.call(child) as Node;
                                if (node) this.motif.options.cache?.appendChild(node);
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

function keepsTrace(c: ComponentBase): boolean {
        return c.motif.options?.hideStrategy !== 'detach';
}

export function domAnchor(c: ComponentBase, host: Node): Node | null {
        const trace = c.motif.options?.placeholder as Node | undefined;
        if (trace && trace.parentNode === host) return trace;
        const node = c.element as unknown as Node | null;
        return node && node.parentNode === host ? node : null;
}

function followingAnchor(owner: ComponentBase, start: number, host: Node): Node | null {
        const siblings = owner.controls.items;
        for (let i = start; i < siblings.length; i++) {
                const anchor = siblings[i] ? domAnchor(siblings[i], host) : null;
                if (anchor) return anchor;
        }
        if ((owner.element as unknown as Node).nodeType === Node.COMMENT_NODE) {
                const close = owner.motif.options.closeFragment as unknown as Node | undefined;
                return close && close.parentNode === host ? close : null;
        }
        return null;
}

function placeTrace(owner: ComponentBase, c: ComponentBase): void {
        if (!keepsTrace(c)) return;
        const host = findAppendableComponent(owner)?.element as unknown as Node | undefined;
        if (!host) return;
        const element = c.element as unknown as Node | null;
        if (element && element.parentNode === host) return;
        const opts: any = c.motif.options;
        const trace: Node = opts.placeholder ?? (opts.placeholder = dom.createComment("h"));
        if (trace.parentNode === host) return;
        host.insertBefore(trace, followingAnchor(owner, owner.controls.items.indexOf(c) + 1, host));
}

function removeComponentDom(c: any, node: Node, alsoPlaceholder: boolean): void {
        const opts = c.motif?.options;
        const parent = node.parentNode;
        if (node.nodeType === Node.COMMENT_NODE) {
                if (parent) {
                        const close = (opts?.closeFragment as unknown as Node | undefined) || null;
                        if (close) {
                                let current: Node | null = node;
                                while (current) {
                                        const after: Node | null = current.nextSibling;
                                        try { parent.removeChild(current); } catch { }
                                        if (current === close) break;
                                        current = after;
                                }
                        } else {
                                try { parent.removeChild(node); } catch { }
                        }
                        if (!alsoPlaceholder) return;
                }
        } else if (parent) {
                try { parent.removeChild(node); } catch { }
                if (!alsoPlaceholder) return;
        }
        const placeholder = opts?.placeholder as Node | undefined;
        if (placeholder && placeholder.parentNode) {
                try { placeholder.parentNode.removeChild(placeholder); } catch { }
        }
}

function detachDomWithAnimation(c: any): void {
        const node = c.element as unknown as Node | null;
        if (!node || c._keepElementOnDispose === true) return;
        const opts = c.motif.options;
        const t = opts?.[TRANSITION_SLOT] as TransitionApi | undefined;
        try {
                const skip = t?.skipNextLeave === true || c._forceInstantDetach === true;
                if (skip) {
                        if (t) t.skipNextLeave = false;
                        c._forceInstantDetach = false;
                        removeComponentDom(c, node, true);
                        return;
                }
        } catch { }
        if (!t && !opts?.transitionOut) {
                removeComponentDom(c, node, false);
                return;
        }
        try {
                opts.transition.leaveTransition(() => {
                        removeComponentDom(c, node, false);
                });
        } catch {
                removeComponentDom(c, node, false);
        }
}

async function detachDomWithAnimationAsync(c: any): Promise<void> {
        const node = c.element as unknown as Node | null;
        if (!node || c._keepElementOnDispose === true) return;
        const opts = c.motif.options;
        const t = opts?.[TRANSITION_SLOT] as TransitionApi | undefined;
        try {
                const skip = t?.skipNextLeave === true || c._forceInstantDetach === true;
                if (skip) {
                        if (t) t.skipNextLeave = false;
                        c._forceInstantDetach = false;
                        removeComponentDom(c, node, true);
                        return;
                }
        } catch { }
        if (!t && !opts?.transitionOut) {
                removeComponentDom(c, node, false);
                return;
        }
        return new Promise<void>((resolve) => {
                try {
                        opts.transition.leaveTransition(() => {
                                removeComponentDom(c, node, false);
                                resolve();
                        });
                } catch {
                        removeComponentDom(c, node, false);
                        resolve();
                }
        });
}

function disposeShallow(c: any): void {
        if (c.isDisposed) return;
        ComponentHelper.callDisposing.call(c, c);
        try {
                c._base._offAll();
        } catch {

        }
        c.motif.stopAnimations();

        c._base._deactivateBindings();
        if (childrenOf(c).length) {
                for (const child of c._controls.items) {
                        try {
                                (child as any)._base._disposeShallow();
                        } catch {

                        }
                }
        }
        ComponentHelper.callDisposed.call(c, c);
        safeCall(() => { c._base._emiters?.clear(); }, 'disposeShallow.emiters');
        c.isDisposed = true;
        Disposable.prototype.dispose.call(c);
}

function deepCleanup(c: any): void {
        try { c.parent = null; } catch { }

        try {
                c._eventHandlers?.clear();
        } catch {

        }
        c._eventHandlers = undefined;

        try { c._class?._countsStore?.clear(); } catch { }
        try { c._class?._watchersStore?.clear(); } catch { }
        try { c._attr?._attrMapStore?.clear(); } catch { }
        try { c._attr?._watchersStore?.clear(); } catch { }
        try {
                if (c.motif.options) {
                        c.motif.options.cache = undefined;
                        c.motif.options.closeFragment = undefined;
                        c.motif.options.placeholder = undefined;
                }
        } catch {

        }
        try { c.element = null; } catch { }
        try { c.props = undefined; } catch { }
        try { c.childs = undefined; } catch { }
        try { c.class = undefined; } catch { }
        try { c.attr = undefined; } catch { }
        try { c.parent = null; } catch { }

        try { c.motif.options = undefined; } catch { }
        const keys = Object.keys(c);
        for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (key === 'motif') continue;
                try { c[key] = undefined; } catch { }
        }
        c.isDisposed = true;
}

const DISPOSE_STARTED = Promise.resolve();

function subtreeDisposesSync(c: any, root: boolean): boolean {
        if (!root && c._disposing && !c.isDisposed) return false;
        if (c.disposeAsync !== ComponentBase.prototype.disposeAsync) return false;
        const opts = c.motif?.options;
        if (opts) {
                if (opts.transitionOut) return false;
                const t = opts[TRANSITION_SLOT] as TransitionApi | undefined;
                if (t) {
                        if (t.activeAnimations && t.activeAnimations.length > 0) return false;
                        if (t.activeCssCancel) return false;
                        if (t.classes || (t.name && t.name.length > 0)) return false;
                }
        }
        const items = childrenOf(c);
        if (items.length) {
                for (let i = 0; i < items.length; i++) {
                        const child = items[i];
                        if (child && !child.isDisposed && !subtreeDisposesSync(child, false)) return false;
                }
        }
        return true;
}

const teardownApplications = new WeakMap<object, Application>();

function owningApplication(c: any): Application | null {
        for (let p = c; p; p = p.parent) {
                if (p.application) return p.application;
                const recorded = teardownApplications.get(p);
                if (recorded) return recorded;
        }
        return Application.main ?? null;
}

function disposePrefix(c: any, options: IDisposeOptions, asChild: boolean): void {
        const ctx = asChild ? 'disposeAsync' : 'dispose';
        if (Application._disposingCount > 0) {
                const app = owningApplication(c);
                if (app && app.state === 'disposing') teardownApplications.set(c, app);
        }
        if (!asChild && options?.skipLeaveTransition) {
                c.motif.options.transition.skipNextLeave = true;
        }
        safeCall(() => { ComponentHelper.callDisposing.call(c, c); }, ctx + '.callDisposing');
        c._base._offAll();
        c._base._deactivateBindings();
        safeCall(() => { c.parent?.controls?.silentDetach?.(c, true); }, ctx + '.silentDetach');
}

function disposeFinish(c: any, options: IDisposeOptions, asChild: boolean): void {
        c.isDisposed = true;
        Disposable.prototype.dispose.call(c);
        if (asChild) {
                if (c._controls) c._controls.items = [];
                safeCall(() => { ComponentHelper.callDisposed.call(c, c); }, 'disposeAsync.callDisposed');
                safeCall(() => { c._base._emiters?.clear(); }, 'disposeAsync.emiters');
                if (options?.deep) {
                        c._base._deepCleanup();
                }
                return;
        }
        c.element = null;
        safeCall(() => { ComponentHelper.callDisposed.call(c, c); }, 'dispose.callDisposed');
        safeCall(() => { c._base._emiters?.clear(); }, 'dispose.emiters');
        c._base._offAll();
        c._base._deepCleanup();
}

async function disposeRemainderAsync(c: any, options: IDisposeOptions, asChild: boolean, leave: Promise<void> | undefined): Promise<void> {
        if (leave) {
                await leave;
        } else {
                if (asChild) {
                        await c.motif.stopAnimations();
                } else if (peekTransition(c)?.skipNextLeave) {
                        await c.motif.stopAnimations();
                }
                await c._base._detachDomWithAnimationAsync();
        }
        if (!asChild && c.constructor.name !== 'TransportTo') {
                await disposeContentBlocks(c);
        }
        const childOptions: IDisposeOptions = { deep: options?.deep };
        await safeCallAsync(async () => {
                if (c.isDisposed) { return; }
                const ctrls = Array.from(childrenOf(c)) as any[];
                if (ctrls.length) {
                        await Promise.all(ctrls.map(child => asChild
                                ? safeCallAsync(async () => { await child.disposeAsync(childOptions); }, 'disposeAsync.disposeAsyncChildren.handler')
                                : (async () => {
                                        try {
                                                await child.disposeAsync(childOptions);
                                        } catch (error) {
                                                reportError('MJX107', error);
                                        }
                                })()));
                }
        }, asChild ? 'disposeAsync.disposeAsyncChildren' : 'dispose.disposeAsync');
        if (!asChild && c.isDisposed) { return; }
        disposeFinish(c, options, asChild);
}

function disposeRemainderSync(root: any, options: IDisposeOptions, asChild: boolean, rootDetached: boolean): Promise<void>[] | null {
        const childOptions: IDisposeOptions = { deep: options?.deep };
        const nodes: any[] = [root];
        const parents: number[] = [-1];
        let pending: Promise<void>[] | null = null;
        if (!rootDetached) detachDomWithAnimation(root);
        for (let n = 0; n < nodes.length; n++) {
                const node = nodes[n];
                if (node.isDisposed) continue;
                const items = childrenOf(node);
                if (items.length === 0) continue;
                const ctrls = Array.from(items) as any[];
                for (let j = 0; j < ctrls.length; j++) {
                        const child = ctrls[j];
                        if (child.isDisposed) continue;
                        if (child._disposing) {
                                (pending ??= []).push(child._disposing);
                                continue;
                        }
                        try {
                                retireServiceOwner(child);
                                child._disposing = root._disposing;
                                disposePrefix(child, childOptions, true);
                                if ((child.element as Node | null)?.isConnected !== false) detachDomWithAnimation(child);
                                nodes.push(child);
                                parents.push(n);
                        } catch (error) {
                                reportError('MJX107', error);
                        }
                }
        }
        const count = nodes.length;
        if (count > 1) {
                const heights = new Array<number>(count).fill(0);
                for (let i = count - 1; i >= 1; i--) {
                        const p = parents[i];
                        if (heights[i] + 1 > heights[p]) heights[p] = heights[i] + 1;
                }
                const order: number[] = [];
                for (let i = 1; i < count; i++) order.push(i);
                order.sort((a, b) => heights[a] - heights[b] || a - b);
                for (let k = 0; k < order.length; k++) {
                        try {
                                disposeFinish(nodes[order[k]], childOptions, true);
                        } catch (error) {
                                reportError('MJX107', error);
                        }
                }
        }
        if (pending) return pending;
        if (!asChild && root.isDisposed) { return null; }
        disposeFinish(root, options, asChild);
        return null;
}

const BASE_PROTO = {
        get emiters(): ComponentEmiter {
                const base = this as unknown as BaseCtx;
                return base._emiters ??= new ComponentEmiter(base.owner);
        },
        _offAll(this: BaseCtx): void {
                const c: any = this.owner;
                if (!c._eventHandlers) return;
                for (const [full, set] of c._eventHandlers) {
                        const name = full.split(":")[0];
                        const evt = name.startsWith("on") ? name.slice(2).toLowerCase() : name.toLowerCase();
                        for (const rec of set) {
                                if (!rec || !rec.wrapped) { continue; }

                                if ((rec as any).domEvent === false) { continue; }
                                const cap = (rec as any).capture === true;
                                try {
                                        (c.element as any).removeEventListener(evt, rec.wrapped as EventListener, cap);
                                } catch { }

                                try {
                                        if ((rec as any).capture === undefined) {
                                                (c.element as any).removeEventListener(evt, rec.wrapped as EventListener, !cap);
                                        }
                                } catch { }
                        }
                }
                c._eventHandlers.clear();
                c._eventHandlers = undefined;
        },
        _deactivateBindings(this: BaseCtx): void {
                const c: any = this.owner;
                try { if (c._bindings?._items?.length) c._bindings.deactivateAll(); } catch { }
        },
        _activateBindings(this: BaseCtx): void {
                const c: any = this.owner;
                try { c._bindings?.activateAll(); } catch { }
        },
        _reactivateBindings(this: BaseCtx): void {
                const c: any = this.owner;
                try { c._bindings?.reActivateAll(); } catch { }
        },
        _activatePreBindings(this: BaseCtx): void {
                if (this.prebinding_Activated) return;
                const c: any = this.owner;
                const registered = c._bindings?._items as IBaseBinding[] | undefined;
                if (registered && registered.length > 0) {
                        c._bindings.items.filter((x: IBaseBinding) => x.propertyName == "isWait" || x.propertyName == "display").forEach((b: IBaseBinding) => {
                                b.activate();
                        }
                        );
                }
                this.prebinding_Activated = true;
        },
        _detachDomWithAnimation(this: BaseCtx): void {
                detachDomWithAnimation(this.owner);
        },
        _detachDomWithAnimationAsync(this: BaseCtx): Promise<void> {
                return detachDomWithAnimationAsync(this.owner);
        },
        _disposeShallow(this: BaseCtx): void {
                disposeShallow(this.owner);
        },
        _deepCleanup(this: BaseCtx): void {
                deepCleanup(this.owner);
        },
};

function createBaseCtx(owner: ComponentBase): BaseCtx {
        const base: BaseCtx = Object.create(BASE_PROTO);
        base.owner = owner;
        base.prebinding_Activated = false;
        return base;
}

function controlsOwner(collection: ControlCollection): any {
        return (collection as any).owner;
}

const NO_CHILDREN: ComponentBase[] = Object.freeze([]) as any;

function childrenOf(c: any): ComponentBase[] {
        return c._controls?.items ?? NO_CHILDREN;
}

function createOwnedControls(c: ComponentBase): ControlCollection {
        const controls = new ControlCollection(c);
        controls.onAdd = ownerControlAdded;
        controls.onAddBeforeBuild = ownerControlAddedBeforeBuild;
        controls.onRemove = ownerControlRemoved;
        return controls;
}

function ownerControlAdded(this: ControlCollection, c: ComponentBase) {
        const owner = controlsOwner(this);
        if (owner._eventHandlers?.has('controladded')) owner.motif.trigger('controladded', { control: c });
        if (!owner.isVisible && (owner.element as Node)?.nodeType === Node.COMMENT_NODE) return;
        ComponentHelper.internalBuild.call(owner, c);
}

function ownerControlAddedBeforeBuild(this: ControlCollection, c: ComponentBase) {
        const owner = controlsOwner(this);
        if (owner._eventHandlers?.has('controladded')) owner.motif.trigger('controladded', { control: c });
}

function ownerControlRemoved(this: ControlCollection, c: ComponentBase) {
        const owner = controlsOwner(this);
        if (owner._eventHandlers?.has('controlremoved')) owner.motif.trigger('controlremoved', { control: c });
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

export interface SiblingsApi {
        all: () => ComponentBase[] | undefined;
        next: () => ComponentBase | undefined;
        prev: () => ComponentBase | undefined;
        nextAll: () => any;
        prevAll: () => any;
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

        public readonly motif: ComponentMotif<this, TProps> = new ComponentMotif<this, TProps>(this, new ComponentOptionsImpl(this) as unknown as ComponentMotif<this, TProps>['options']);

        public element: TElement;
        public props: TProps;
        public isBuilt: boolean = false;
        public isInitialized: boolean = false;
        public isDisposed: boolean = false;
        public isConfigured: boolean = false;
        public isPainting: boolean = false;
        public isPainted: boolean = false;
        public isVisible: boolean = true;
        private _controls?: ControlCollection = undefined;
        public get controls(): ControlCollection {
                return this._controls !== undefined || (this.isDisposed && !this.element) ? this._controls! : (this._controls = createOwnedControls(this));
        }
        public set controls(value: ControlCollection) {
                this._controls = value;
        }

        private _eventHandlers?: Map<string, Set<{
                original: (sender: ComponentBase, e: EventArgs) => any,
                wrapped?: (e: Event) => void,
                dom?: boolean,
                domEvent?: boolean,
                capture?: boolean,
                type?: string
        }>>;
        private _isWait: boolean = false;
        private _class?: IClass<TElement> = undefined;
        private _attr?: controlAttribute<TElement> = undefined;
        public get class(): IClass<TElement> {
                return this._class !== undefined || (this.isDisposed && !this.element) ? this._class! : (this._class = new controlClass(this as any) as any as IClass<TElement>);
        }
        public set class(value: IClass<TElement>) {
                this._class = value;
        }
        public get attr(): controlAttribute<TElement> {
                return this._attr !== undefined || (this.isDisposed && !this.element) ? this._attr! : (this._attr = new controlAttribute(this as any));
        }
        public set attr(value: controlAttribute<TElement>) {
                this._attr = value;
        }
        private _bindings?: BindingCollection = undefined;
        public get bindings(): BindingCollection {
                return this._bindings !== undefined || (this.isDisposed && !this.element) ? this._bindings! : (this._bindings = new BindingCollection(this));
        }
        public set bindings(value: BindingCollection) {
                this._bindings = value;
        }
        /** style(fn) izleyicisi: tek tek tutulur, yeniden çağrıda önceki durdurulur. */
        private _styleFx?: { stop: () => void; binding: IBaseBinding };

        public useModel<TModel>(modelCtor: TModel): UnwrapValueRefs<TModel> {
                return reactive<TModel>(modelCtor);
        }

        private _computeHideStrategy(): 'placeholder' | 'detach' {
                return keepsTrace(this) ? 'placeholder' : 'detach';
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
                const asComponentRoot = constructingComponentRoot;
                constructingComponentRoot = false;
                recordServiceOwner(this);
                if (this.onElementCreating) {
                        this.element = this.onElementCreating.call(this);
                } else if ((props as any)?.onElementCreating) {
                        this.element = (props as any).onElementCreating.call(this);
                } else {
                        this.element = element;
                }
                if ((this.element as any)?.nodeType !== 3) {
                        if (this._controls === undefined) this._controls = new ControlCollection(this);
                        if (this._class === undefined) this._class = new controlClass(this as any) as any as IClass<TElement>;
                        if (this._attr === undefined) this._attr = new controlAttribute(this as any);
                        if (this._bindings === undefined) this._bindings = new BindingCollection(this);
                }

                const refs = props ? extractRefs(props, this) : [];

                props && ParseProps(props, this);
                applyComponentOptions((props as any)?.options, this);
                this.props = props;

                // (class/style/id/tabindex/role/aria-*/data-*) kök düğüme (root node) düşer, prop'lar this.props'ta kalır.
                if (props) {
                        const ctor0 = new.target as any;
                        const plain = !asComponentRoot && (ctor0 === ComponentBase || Object.getPrototypeOf(ctor0) === ComponentBase);
                        if (plain) applyPlainElementProps(props, this);
                        else applyFallthroughProps(props, this);
                }

                if (refs.length > 0) {
                        for (const fn of takePendingRefs(this, refs)) {
                                callReported(() => fn(this), 'MJX122', 'ref');
                        }
                }

                ComponentHelper.callOnInitializing(this);
                if (this.isDisposed) return;
                const controls = this._controls;
                if (controls) {
                        controls.onAdd = ownerControlAdded;
                        controls.onAddBeforeBuild = ownerControlAddedBeforeBuild;
                        controls.onRemove = ownerControlRemoved;
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
        protected _base: BaseCtx = createBaseCtx(this);
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
        public onVisibilityChanged?(sender: ComponentBase, e: VisibilityChangedEventArgs): void;
        /** keepAlive rota bileşeni outlet'ten ayrılıp önbelleğe alındığında (RoutingEngine) tetiklenir. */
        public onDeactivated?(sender: ComponentBase, e: EventArgs): void;
        /** keepAlive rota bileşeni önbellekten outlet'e yeniden bağlandığında (RoutingEngine) tetiklenir. */
        public onActivated?(sender: ComponentBase, e: EventArgs): void;
        public view?(): ComponentBase;
        private _scopedContext?: Application;

        public get context(): Application {
                const parentCtx: any = this.parent?.context;
                const app: Application = parentCtx?.[RAW_APPLICATION] ?? parentCtx ?? teardownApplications.get(this) ?? Application.main;
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
                checkReservedMembers(this);
                ComponentHelper.callConfigured(this);
                this._base._activatePreBindings();
                if (this.isDisposed || !this.element || this.isWait) { return; }
                if (this.isBuilt || this.isWait) {
                        return;
                }

                ComponentHelper.callBuilding(this);
                if (this.isDisposed) { return; }
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
                if (this.isDisposed) { return; }

                if (this.view) {
                        const templ = this.view();
                        this.controls.add(templ);
                        if (this.isDisposed) { return; }
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

                for (const element of childrenOf(this).slice()) {
                        var target = isFragment ? this.motif.options.cache : this.element;
                        if (!element.isWait) {
                                element.parent = this;
                                element.build(false);
                        }
                        if (element.isWait) {
                                if (keepsTrace(element)) {
                                        const opts: any = element.motif.options;
                                        (building ? ph : target as any).appendChild(opts.placeholder ?? (opts.placeholder = dom.createComment("h")));
                                }
                                continue;
                        }
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

                if (this.isDisposed) { return; }
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
                if (this.isWait) { return; }

                if (this.parent && enterModeOf(this.parent) === 'out-in') {
                        const showHost = ((this.motif.options.placeholder as Node | undefined)?.parentNode)
                                ?? (findAppendableComponent(this.parent)?.element as Node | undefined);
                        const wait = pendingLeaves(showHost, this.element as unknown as Node);
                        if (wait) {
                                const seq = this._base._showSeq = (this._base._showSeq ?? 0) + 1;
                                return wait.then(() => {
                                        if (this.isDisposed || this._base._showSeq !== seq) return;
                                        return this._show();
                                });
                        }
                }

                if (peekTransition(this)?.activeAnimations?.length) {
                        safeCall(async () => {
                                await Promise.all(this.motif.options.transition.activeAnimations.map(a =>
                                        a.finished?.catch(() => { })
                                ));
                        }, 'show.waitForLeaveAnimations');
                }
                /** A*/
                const strategy = this._computeHideStrategy();
                if (strategy === 'detach') {

                        ComponentHelper.callVisibilityChanged(this, true);
                        if (this.isDisposed) { return; }
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
                                ComponentHelper.callVisibilityChanged(this, true);
                                if (this.isDisposed) { return; }
                                this.isVisible = true;
                                if (this.parent?.isBuilt) {
                                        ComponentHelper.internalBuild.call(this.parent, this);
                                }
                                return;
                        }

                        /** A*/
                        wantsEnterTransition(this) && this.motif.options.transition.enterTransition(() => { });
                        ComponentHelper.callVisibilityChanged(this, true);
                        if (this.isDisposed) { return; }
                        if ((this.element as Node).nodeType === Node.COMMENT_NODE) {
                                this.controls.items.filter(c => !c.isBuilt).forEach(c => ComponentHelper.internalBuild.call(this, c));
                                this.controls.forEach(c => {
                                        c.motif.show();
                                });
                                this.isVisible = true;
                                ComponentHelper.activateTree(this, false);
                                return;
                        }
                        if (!this.isBuilt) {
                                this.isVisible = true;
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
                this._base._showSeq = (this._base._showSeq ?? 0) + 1;
                if (!this.isVisible) { return; }

                const strategy = this._computeHideStrategy();
                if (strategy === 'detach') {
                        ComponentHelper.callVisibilityChanged(this, false);
                        if (this.isDisposed) { return; }
                        await this._base._detachDomWithAnimationAsync();
                        this.isVisible = false;
                        ComponentHelper.deactivateTree(this);
                        return;
                } else {
                        const transition = this.motif.options.transition;
                        const skip = transition.skipNextLeave === true;
                        if (skip) transition.skipNextLeave = false;
                        const finish = () => {
                                ComponentHelper.callVisibilityChanged(this, false);
                                if (this.isDisposed) { return; }
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
                        if (res && (res as any).cancel === true) {
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
                                this._base._emiters?.off("on" + xName, cb as any);
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
                if (this._disposing) { return this._disposing; }
                retireServiceOwner(this);
                this._disposing = DISPOSE_STARTED;
                return this._disposing = this._disposeCore(options, false);
        }

        private async _disposeCore(options: IDisposeOptions, asChild: boolean): Promise<void> {
                disposePrefix(this, options, asChild);
                let leave: Promise<void> | undefined;
                if (!asChild && !peekTransition(this)?.skipNextLeave) {
                        leave = this._base._detachDomWithAnimationAsync();
                }
                await undefined;
                if (liveContentBlocks.live === 0 && subtreeDisposesSync(this, true)) {
                        const pending = disposeRemainderSync(this, options, asChild, leave !== undefined);
                        if (pending) {
                                await Promise.all(pending);
                                if (!asChild && this.isDisposed) { return; }
                                disposeFinish(this, options, asChild);
                        }
                        return;
                }
                await disposeRemainderAsync(this, options, asChild, leave);
        }

        public disposeAsync(options: IDisposeOptions = { deep: true }): Promise<void> {
                if (this.isDisposed) { return Promise.resolve(); }
                if (this._disposing) { return this._disposing; }
                retireServiceOwner(this);
                this._disposing = DISPOSE_STARTED;
                return this._disposing = this._disposeCore(options, true);
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

        private _siblingsApi?: SiblingsApi;
        private _siblingsSet?: boolean;

        get siblings(): SiblingsApi {
                if (this._siblingsSet) { return this._siblingsApi as SiblingsApi; }
                if (this.isDisposed && !this.motif?.options) { return this._siblingsApi as SiblingsApi; }
                return this._siblingsApi ??= this._createSiblingsApi();
        }

        set siblings(value: SiblingsApi) {
                this._siblingsApi = value;
                this._siblingsSet = true;
        }

        private _createSiblingsApi(): SiblingsApi {
                return {
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
        }

        public get serviceProvider(): ServiceProvider | null {
                let c: ComponentBase | null = this as unknown as ComponentBase;
                while (c) {
                        const p = (c as any).provider as ServiceProvider | undefined;
                        if (p) return p;
                        const recorded = teardownApplications.get(c);
                        if (recorded) return recorded.state === 'disposed' ? null : recorded.provider;
                        c = c.parent;
                }
                try { return Application.main?.provider ?? null; } catch { return null; }
        }

        public getService<T>(token: (abstract new (...args: any) => T) | { prototype: T }): T | null;
        public getService<T = any>(token: string | symbol | object): T | null;
        public getService(token: any): any {
                try {

                        const sp = this.serviceProvider;
                        if (sp) {
                                return sp._getFor(this, token);
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
                const t = peekTransition(this);
                try { t?.activeCssCancel?.(); } catch { }
                try {
                        if (t?.activeAnimations?.length) {
                                try {
                                        await Promise.all(t.activeAnimations.map(a =>
                                                a.finished?.catch(() => { })
                                        ));
                                } catch { /* ignore */ }
                        }

                } catch (error) {

                }
                if (this.isDisposed) return;
                if (t) t.activeAnimations = [];
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
        if (liveContentBlocks.live === 0) return;
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

export function disposeUnplacedChilds(owner: ComponentBase, kids: unknown): void {
        if (!Array.isArray(kids) || !kids.some(kid => kid instanceof ComponentBase)) return;
        owner.motif.setDisposable(() => {
                for (const kid of kids) {
                        if (kid instanceof ComponentBase && !kid.isDisposed && !kid.parent) kid.dispose();
                }
        });
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
        return refs.length === 0 ? refs : ([] as any[]).concat(...refs);
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
        const base = (component as any)._base;
        for (const fn of fns) {
                const slot: HookSlot | undefined = base[listName];
                if (slot === undefined) base[listName] = fn;
                else if (typeof slot === 'function') { if (slot !== fn) base[listName] = [slot, fn]; }
                else if (!slot.includes(fn)) slot.push(fn);
        }
        return true;
}

export function ParseProps(props: any, component: ComponentBase): any {
        if (props) {
                var keys = Object.keys(props);
                if (keys.length === 0) return;
                keys.forEach(key => {
                        if (key == 'initializeComponent' || key == 'oninitializeComponent' || key.startsWith('on')) {
                                if (collectLifecycleHandlers(component, key.toLowerCase(), props[key])) {
                                        delete props[key];
                                        return;
                                }
                        } else if (key == 'childs') {
                                const flat: ComponentBase[] = ([] as any[]).concat(...props[key] as any);
                                component.childs = flat;
                                disposeUnplacedChilds(component, flat);
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
                if (!('mode' in value)) {
                        transition.classes = value;
                } else {
                        const { mode, ...classes } = value;
                        if (isTransitionMode(mode)) {
                                transition.mode = mode;
                        }
                        if (Object.keys(classes).length > 0) {
                                transition.classes = classes;
                        }
                }
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

const SPREAD_HTML_KEYS = new Set(['innerhtml', 'srcdoc']);
const SPREAD_URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);
const JAVASCRIPT_URL = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;

function isJavascriptUrl(value: unknown): boolean {
        if (value === undefined || value === null || typeof value === 'boolean') return false;
        try { return JAVASCRIPT_URL.test(String(value)); } catch { return false; }
}

function guardSpreadUrl(key: string, read: () => any): () => any {
        return () => {
                let value = read();
                if (typeof value === 'function') value = value();
                if (typeof value === 'function') value = value();
                if (!isJavascriptUrl(value)) return value;
                reportWarning('MJX125', [key]);
                return null;
        };
}

export function applyPlainElementProps(props: any, component: ComponentBase): void {
        if (!props || typeof props !== 'object' || component.isDisposed) return;
        const keys = Object.keys(props);
        if (keys.length === 0) return;
        let attrs: Record<string, any> | null = null;
        let applied: Map<string, any> | null = null;
        for (const key of keys) {
                if (PLAIN_ELEMENT_SKIP.has(key)) continue;
                if (key.startsWith('x-') || key.startsWith('x:') || key.startsWith('__')) continue;
                let v = props[key];
                if (v === undefined) continue;
                if (/^on/i.test(key)) {
                        if (typeof v === 'function') component.motif.on(key as any, v as any);
                        continue;
                }
                if (typeof v === 'function' && v.length > 0) continue;
                const lowerKey = key.toLowerCase();
                if (SPREAD_HTML_KEYS.has(lowerKey)) {
                        reportWarning('MJX124', [key]);
                        continue;
                }
                if (SPREAD_URL_ATTRIBUTES.has(lowerKey)) {
                        if (typeof v === 'function') {
                                v = guardSpreadUrl(key, v);
                        } else if (isJavascriptUrl(v)) {
                                reportWarning('MJX125', [key]);
                                continue;
                        }
                }
                (applied ??= appliedDomProps(component)).set(key, v);
                if (key === 'class' || key === 'className') {
                        component.class.add(v && typeof v === 'object' && !Array.isArray(v) ? [v] : v);
                } else if (key === 'style') {
                        component.style(v);
                } else if (key === 'value' || key === 'checked' || key === 'selected') {
                        component.bindings.add(key, v);
                } else {
                        (attrs ??= {})[key] = v;
                }
        }
        if (attrs) component.attr.add(attrs);
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

let constructingComponentRoot = false;

export function constructComponentRoot<T>(make: () => T): T {
        constructingComponentRoot = true;
        try {
                return make();
        } finally {
                constructingComponentRoot = false;
        }
}

export function applyFallthroughProps(props: any, component: ComponentBase): void {
        if (!props || typeof props !== 'object' || component.isDisposed) return;
        const applied = _appliedDomProps.get(component);
        let subset: Record<string, any> | null = null;
        for (const key of Object.keys(props)) {
                if (!isFallthroughKey(key)) continue;
                const v = props[key];
                if (v === undefined || v === null) continue;
                if (typeof v === 'function' && v.length > 0) continue;
                if (applied && applied.has(key) && Object.is(applied.get(key), v)) continue;
                (subset ??= {})[key] = v;
        }
        if (subset) applyPlainElementProps(subset, component);
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


type AttachWaiter = { element: Element; callback: () => any };
const attachWaiters = new Set<AttachWaiter>();
let attachObserver: MutationObserver | null = null;

function releaseAttachObserver() {
        if (attachWaiters.size || !attachObserver) { return; }
        try { attachObserver.disconnect(); } catch { /* ignore */ }
        attachObserver = null;
}

function flushAttachWaiters() {
        for (const waiter of [...attachWaiters]) {
                if (!attachWaiters.has(waiter) || !document.contains(waiter.element)) { continue; }
                attachWaiters.delete(waiter);
                try {
                        waiter.callback();
                } catch (error) {
                        queueMicrotask(() => { throw error; });
                }
        }
        releaseAttachObserver();
}

function onElementAttached(element: Element, callback: () => any): (() => void) | null {
        if (document.contains(element)) {
                callback();
                return null;
        }

        const waiter: AttachWaiter = { element, callback };
        attachWaiters.add(waiter);
        if (!attachObserver) {
                attachObserver = new MutationObserver(flushAttachWaiters);
                attachObserver.observe(document.documentElement, {
                        childList: true,
                        subtree: true,
                });
        }

        return () => {
                if (attachWaiters.delete(waiter)) { releaseAttachObserver(); }
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