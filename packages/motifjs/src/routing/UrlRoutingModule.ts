import { $, Application, dom, safeCallSilentAsync } from "..";
import { Component } from "../";
import { NavigationDirection, NavigationOptions, ResolveResult, RouteInfo, RouteResolveContext, RouterOptions, StackEntryInfo } from "./";
import type { RouteSnapshot } from "./routerState";
import { ScrollMemory } from "./scrollMemory";
import { NavigationStack, StackNavigation } from "./NavigationStack";
import { RouteCollection, compareRouteRecords } from "./";
import { RouteItem, RouteRecord, RouterValidateEventArgs } from "./";
import { RoutingEngine } from "./";
import { errorHandler } from "../common/ErrorHandler";
import { motifError, reportError, reportWarning } from "../common/diagnostics";

const pathOf = (uri: string): string => uri.split('#')[0].split('?')[0];

type HistoryStamp = { index: number; session: string; hasState?: boolean };

type TraversalInfo = { direction: NavigationDirection; state: any; from: HistoryStamp | null };

const newHistorySession = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export class UrlRoutingModule {
    private static readonly MAX_REDIRECTS = 10;
    private _routerOptions: RouterOptions;
    private routingEngine: RoutingEngine;
    routeCollection!: RouteCollection
    private routesMap: Map<any, RouteItem> = new Map();
    private mainApp!: Component;
    private application: Application;
    private _suppressBeforeEachOnce: boolean = false;
    private _suppressMiddlewaresOnce: boolean = false;
    private _scroll: ScrollMemory | null = null;

    constructor(options: RouterOptions, application: Application) {
        this._routerOptions = options;
        this.routeCollection = new RouteCollection(options.RouteItems);
        this.routingEngine = new RoutingEngine();
        this.application = application;
        this._installLinkInterceptor();

        const scrollMemory = options.scrollMemory;
        if (scrollMemory) {
            this._scroll = new ScrollMemory(scrollMemory === true ? {} : scrollMemory);
            this._scroll.locationAnchor = this._addressMode() === 'history';
        }

        if (options.stack && options.mode !== 'shell') {
            this._stack = new NavigationStack(options.stack);
            this.routingEngine.stack = this._stack;
        }
    }

    private _stack: NavigationStack | null = null;
    public getHooks(): RouterOptions['hooks'] | undefined {
        return this._routerOptions.hooks;
    }

    private _windowNavListener: ((this: Window, ev: Event) => any) | null = null;
    public start(mainApp: Component, shellUri?: string) {
        this.mainApp = mainApp;
        this.routingEngine.register(this.mainApp, this.application, this);
        const path = this._routerOptions.mode === 'shell' ? (shellUri ?? '/') : this._getCurrentUri();
        this._seedHistoryIndex();
        this._suppressMiddlewaresOnce = true;
        this.navigate(path);
        if (this._routerOptions.mode === 'shell') return;
        this._windowNavListener = () => {
            void this._onHistoryTraversal();
        };
        window.addEventListener(
            this._routerOptions.mode === 'hash' || this._routerOptions.mode === 'file' ? 'hashchange' : 'popstate',
            this._windowNavListener
        );
    }

    public get shownUri(): string | undefined {
        return this._previousRoute ? this._currentUri : undefined;
    }

    private _getCurrentUri(): string {
        try {
            const w = window as any;
            const mode = this._routerOptions.mode || (w?.location?.protocol === 'file:' ? 'hash' : 'history');
            if (mode === 'hash' || mode === 'file') {
                const h = w?.location?.hash || '';
                return h && h.startsWith('#') ? h.slice(1) || '/' : '/';
            }
            return (w?.location?.pathname || '/') + (w?.location?.search || '') + (w?.location?.hash || '');
        } catch { return '/'; }
    }

    private static readonly HISTORY_STAMP_KEY = '__motifHistory';
    private _historyStamp: HistoryStamp | null = null;

    private _addressMode(): NonNullable<RouterOptions['mode']> {
        const w = window as any;
        return this._routerOptions.mode || (w?.location?.protocol === 'file:' ? 'hash' : 'history');
    }

    private _readHistoryStamp(): HistoryStamp | null {
        try {
            const state = (window as any)?.history?.state;
            const stamp = state && typeof state === 'object' ? state[UrlRoutingModule.HISTORY_STAMP_KEY] : null;
            if (stamp && typeof stamp === 'object' && typeof stamp.index === 'number' && Number.isFinite(stamp.index) && typeof stamp.session === 'string') {
                return { index: stamp.index, session: stamp.session };
            }
        } catch { }
        return null;
    }

    private static _isPlainObject(value: any): boolean {
        if (!value || typeof value !== 'object') return false;
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    private _withHistoryStamp(state: any, stamp: HistoryStamp): any {
        if (state == null) return { [UrlRoutingModule.HISTORY_STAMP_KEY]: stamp };
        if (UrlRoutingModule._isPlainObject(state)) {
            return { ...state, [UrlRoutingModule.HISTORY_STAMP_KEY]: stamp };
        }
        return state;
    }

    private _routerState(userState: any, stamp: HistoryStamp): any {
        return userState
            ? this._withHistoryStamp(userState, { ...stamp, hasState: true })
            : this._withHistoryStamp(null, stamp);
    }

    private _userStateOf(historyState: any): any {
        if (historyState == null) return undefined;
        if (!UrlRoutingModule._isPlainObject(historyState)) return historyState;
        const key = UrlRoutingModule.HISTORY_STAMP_KEY;
        if (!(key in historyState)) return historyState;
        const stamp = historyState[key];
        if (!stamp || stamp.hasState !== true) return undefined;
        const { [key]: _omit, ...rest } = historyState;
        return rest;
    }

    private _currentHistoryUserState(): any {
        if (this._addressMode() === 'shell') return undefined;
        try { return this._userStateOf((window as any)?.history?.state); } catch { return undefined; }
    }

    private _nextHistoryStamp(push: boolean): HistoryStamp {
        const base = this._historyStamp;
        if (!base) return { index: 0, session: newHistorySession() };
        return { index: push ? base.index + 1 : base.index, session: base.session };
    }

    private _stampCurrentEntry(stamp: HistoryStamp, userState?: any): void {
        try {
            const w = window as any;
            if (!w?.history || typeof w.history.replaceState !== 'function') return;
            const current = w.history.state;
            let next: any;
            if (userState) {
                next = this._routerState(userState, stamp);
            } else {
                const hasState = UrlRoutingModule._isPlainObject(current) && Object.keys(current).length > 0;
                next = this._withHistoryStamp(current, hasState ? { ...stamp, hasState: true } : stamp);
            }
            if (next !== current) w.history.replaceState(next, '');
        } catch { }
    }

    private _seedHistoryIndex(): void {
        if (this._addressMode() === 'shell') return;
        const existing = this._readHistoryStamp();
        if (existing) {
            this._historyStamp = existing;
            return;
        }
        const stamp: HistoryStamp = { index: 0, session: newHistorySession() };
        this._stampCurrentEntry(stamp);
        this._historyStamp = stamp;
    }

    private _pendingTraversal: TraversalInfo | null = null;

    private async _onHistoryTraversal(): Promise<void> {
        const shown = this._historyStamp;
        const arrived = this._readHistoryStamp();
        this._historyStamp = arrived;
        let direction: NavigationDirection = 'traverse';
        if (shown && arrived && shown.session === arrived.session && shown.index !== arrived.index) {
            direction = arrived.index < shown.index ? 'back' : 'forward';
        }
        this._pendingTraversal = { direction, state: this._currentHistoryUserState(), from: shown };
        let result: any;
        try {
            result = await this.navigate(this._getCurrentUri());
        } finally {
            this._pendingTraversal = null;
        }
        const cancelled = !!result && result.cancelled === true;
        try { this._stack?.traversalSettled(cancelled); } catch { }
        if (!cancelled) return;
        const now = this._readHistoryStamp();
        this._historyStamp = now;
        if (!shown || !now || now.session !== shown.session) return;
        const delta = shown.index - now.index;
        if (delta === 0) return;
        try { (window as any).history.go(delta); } catch { }
    }

    private _currentUri: string = '___startup___';
    private _previousRoute: any = null;

    public get currentUri(): string {
        return this._currentUri;
    }

    public async navigate(uri: string, options?: NavigationOptions): Promise<any> {
        const traversal = this._pendingTraversal;
        this._pendingTraversal = null;

        return await safeCallSilentAsync(async () => {

            try { (globalThis as any).__MOTIF_DEVTOOLS_BUS__?.publish?.('route:navigation-start', { uri }); } catch { }
            const suppressBeforeEachThisCall = this._suppressBeforeEachOnce;
            if (suppressBeforeEachThisCall) {
                this._suppressBeforeEachOnce = false;
            }
            const suppressMiddlewaresThisCall = this._suppressMiddlewaresOnce;
            if (suppressMiddlewaresThisCall) {
                this._suppressMiddlewaresOnce = false;
            }
            const navOptions: NavigationOptions = options || {};
            const force = navOptions.force || false;

            if (uri === this._currentUri && !force) {
                return { ok: true, skipped: true, uri };
            }

            let gate: { proceed: boolean; uri: string };
            if (suppressMiddlewaresThisCall) {
                gate = { proceed: true, uri };
            } else {
                gate = await this._runMiddlewares(uri);
            }

            if (!gate.proceed) {
                return {
                    ok: false,
                    uri: gate.uri,
                    cancelled: true,
                    reason: 'middleware'
                };
            }
            uri = gate.uri;

            let target = this.resolve(uri);

            let redirectedFrom: string | undefined;
            let redirectError: Error | undefined;
            let redirectChain = '';
            if (target.ok && target.route?.redirect) {
                const requested = uri;
                const visited: string[] = [requested];
                while (target.ok && target.route?.redirect) {
                    const next = this._resolveRedirect(target, uri);
                    if (!next) break;
                    if (visited.length > UrlRoutingModule.MAX_REDIRECTS || visited.some(v => pathOf(v) === pathOf(next))) {
                        redirectChain = [...visited, next].join(' → ');
                        redirectError = motifError('MJX303', redirectChain);
                        break;
                    }
                    visited.push(next);
                    uri = next;
                    target = this.resolve(uri);
                }
                if (redirectError) {
                    reportWarning('MJX303', [redirectChain]);
                    uri = requested;
                    target = this._buildFallbackResult(uri, 'error', { path: uri, error: redirectError });
                } else if (uri !== requested) {
                    redirectedFrom = requested;
                    if (uri === this._currentUri && !force) {
                        return { ok: true, skipped: true, uri };
                    }
                }
            }

            const wasInitialNavigation = !this._previousRoute;
            const direction: NavigationDirection = wasInitialNavigation
                ? 'initial'
                : traversal ? traversal.direction : (navOptions.replace ? 'replace' : 'push');
            const entryState = traversal
                ? traversal.state
                : (wasInitialNavigation && navOptions.state === undefined ? this._currentHistoryUserState() : (navOptions.state || undefined));

            const toRoute = {
                path: target.uri || uri,
                params: target.params,
                meta: (target as any).meta ?? target.extend,
                options: options,
                redirectedFrom,
                direction,
                state: entryState
            };

            const fromRoute = this._previousRoute ? {
                path: this._previousRoute.path,
                params: this._previousRoute.params,
                meta: this._previousRoute.meta,
                options: this._previousRoute.options
            } : null;

            if (this._previousRoute && this._previousRoute.routeItem) {
                const currentRouteItem = this._previousRoute.routeItem as RouteItem;
                const leaveHook = currentRouteItem.onLeave || this._routerOptions.hooks?.onLeave;
                if (leaveHook) {
                    try {
                        const leaveContext = {
                            from: {
                                path: this._previousRoute.path,
                                params: this._previousRoute.params,
                                meta: this._previousRoute.meta
                            },
                            to: toRoute
                        };
                        const leaveResult = await leaveHook(leaveContext);
                        if (leaveResult === false) {
                            return { ok: false, cancelled: true, reason: 'onLeave' };
                        }
                        if (leaveResult && typeof leaveResult === 'object' && (leaveResult as any).cancel === true) {
                            const customReason = (leaveResult as any).reason || 'onLeave';
                            return { ok: false, cancelled: true, reason: customReason };
                        }
                    } catch (error) {
                        reportError('MJX306', error, 'onLeave');
                    }
                }
            }

            let guardResult: string | false | true = true;
            if (!suppressBeforeEachThisCall) {
                guardResult = await this.application._runBeforeEachGuards(toRoute, fromRoute);
            }

            if (guardResult === false) {
                return { ok: false, cancelled: true, reason: 'guard' };
            }

            if (typeof guardResult === 'string') {
                const addressShowsBlocked = this._addressShows(uri, redirectedFrom);
                return await this.navigate(guardResult, addressShowsBlocked ? { ...navOptions, replace: true } : options);
            }

            const snapshotOf = (result: ResolveResult): RouteSnapshot => ({
                target: result,
                chain: result.chain.map(r => this.routingEngine.generatePathString(r.path, result.params) || ''),
                direction,
                state: entryState,
            });

            if (!target.ok && !redirectError) {
                target = this._buildFallbackResult(uri, 'notFound', { path: uri });
            }
            this._currentUri = uri;
            this._previousRoute = {
                path: target.uri,
                params: target.params,
                meta: (target as any).meta ?? target.extend,
                routeItem: target.route
            };

            let appliedPath = target.uri;

            this._scroll?.leaving();

            const leavingStamp = traversal ? traversal.from : this._historyStamp;
            try {
                const replaceSource = !!redirectedFrom && this._addressShows(redirectedFrom);
                this._applyUrl(appliedPath, replaceSource ? { ...navOptions, replace: true } : navOptions);
            } catch { }
            const stackNav: StackNavigation | undefined = this._stack
                ? { direction, from: leavingStamp, to: this._historyStamp, uri: appliedPath }
                : undefined;

            try {
                await this.routingEngine.execute(target, stackNav, snapshotOf(target));
            } catch (error) {
                reportError('MJX304', error);
                target = this._buildFallbackResult(uri, 'error', { path: uri, error });
                try { await this.routingEngine.execute(target, stackNav, snapshotOf(target)); } catch (e2) { reportError('MJX305', e2); }
            }
            if (this._stack) this.application._routerState.touch();
            if (navOptions.scroll) { 
                this._handleScrollBehavior(navOptions.scroll);
            } else {
                this._scroll?.arrived(this._uriWithHash(appliedPath, uri), direction);
            }
            this.application.fire?.('motifjs-router-navigated', {
                uri: appliedPath,
                params: target.params,
                meta: (target as any).meta ?? target.extend,
                route: target.ok ? target.route : null,
                ok: target.ok,
                initial: wasInitialNavigation,
                redirectedFrom,
                direction,
                state: entryState
            });
            try { (globalThis as any).__MOTIF_DEVTOOLS_BUS__?.publish?.('route:navigation-end', { uri: appliedPath, params: target.params }); } catch { }

            return target;

        }, 'UrlRoutingModule.navigate');

    }
 
    public describeStack(): StackEntryInfo[] | undefined {
        return this._stack ? this._stack.describe() : undefined;
    }

    public routeInfos(): RouteInfo[] {
        const out: RouteInfo[] = [];
        const visit = (node: RouteItem, chain: RouteItem[]) => {
            const nextChain = [...chain, node];
            out.push({
                fullPath: node.fullPath || node.path,
                name: node.name ?? null,
                meta: node.meta ?? node.extend ?? {},
                route: node,
                chain: nextChain,
            });
            for (const child of node.childs || []) visit(child, nextChain);
        };
        for (const node of this.routeCollection?.['routes'] || []) visit(node, []);
        return out;
    }

    public href(name: string, params?: Record<string, any>): string {
        const routeItem = this.routeCollection['routesMap']?.get(name);
        if (!routeItem) throw motifError('MJX302', name);
        const path = routeItem.fullPath || routeItem.path;
        return this.routingEngine.generatePathString(path, params || {}) || path;
    }

    public async evict(route?: RouteItem | string | null): Promise<void> {
        let item: RouteItem | null | undefined = null;
        if (typeof route === 'string') {
            item = this.routeCollection['routesMap']?.get(route);
            if (!item) throw motifError('MJX302', String(route));
        } else {
            item = route;
        }
        await this.routingEngine.evict(item);
    }

    private _fallbackRoutes: { notFound?: RouteItem; error?: RouteItem } = {};

    private _getFallbackRoute(kind: 'notFound' | 'error'): RouteItem {
        const existing = this._fallbackRoutes[kind];
        if (existing) return existing;
        const custom = this._routerOptions.fallbacks?.[kind];
        const control = custom ?? (kind === 'notFound' ? UrlRoutingModule._builtinNotFound : UrlRoutingModule._builtinError);
        const item: RouteItem = {
            path: '',
            fullPath: null,
            control,
            name: kind === 'notFound' ? 'not-found' : 'error',
            childs: [],
            extend: {},
            meta: {},
            validate: undefined,
            keepAlive: false,
        };
        this._fallbackRoutes[kind] = item;
        return item;
    }

    private _buildFallbackResult(uri: string, kind: 'notFound' | 'error', params: Record<string, any>): ResolveResult {
        const fallback = this._getFallbackRoute(kind);
        const prefix = this._findLayoutPrefix(uri);
        const chain = [...(prefix?.chain ?? []), fallback];
        const mergedExtend: Record<string, any> = {};
        const mergedMeta: Record<string, any> = {};
        for (const item of chain) {
            if (item?.extend && typeof item.extend === 'object') Object.assign(mergedExtend, item.extend);
            if (item?.meta && typeof item.meta === 'object') Object.assign(mergedMeta, item.meta);
        }
        return {
            ok: false,
            uri,
            fullPath: null,
            route: fallback,
            chain,
            params: { ...(prefix?.params ?? {}), ...params },
            extend: mergedExtend,
            meta: mergedMeta,
        };
    }

    private _findLayoutPrefix(uri: string): { chain: RouteItem[]; params: Record<string, any> } | null {
        const path = uri.split('?')[0].split('#')[0];
        const segs = path.split('/').filter(Boolean);
        let best: { rec: RouteRecord; params: Record<string, any>; depth: number } | null = null;
        for (const rec of this.routeCollection?.records || []) {
            if (!rec.leaf.childs || !rec.leaf.childs.length) continue;
            const depth = rec.fullPath.split('/').filter(Boolean).length;
            if (depth > segs.length) continue;
            const prefix = '/' + segs.slice(0, depth).join('/');
            let matched = false;
            try { matched = rec.scanner.exist(prefix, this._pageSearch()); } catch { matched = false; }
            if (!matched) continue;
            const params = { ...rec.scanner.parameters };
            if (!this.validateChain(prefix, rec, params)) continue;
            if (!best || rec.chain.length > best.rec.chain.length || (rec.chain.length === best.rec.chain.length && depth > best.depth)) {
                best = { rec, params, depth };
            }
        }
        return best ? { chain: best.rec.chain, params: best.params } : null;
    }

    private static _builtinNotFound = () => new Component('div', {
        initializeComponent(sender: Component) {
            sender.style({
                padding: '20px', fontFamily: 'Arial, sans-serif', display: 'flex', 'flex-direction': 'column', 'align-items': 'center'
            });
            (sender.element as HTMLElement).appendChild($('h2', {}, ...['404 - Not Found']));
            (sender.element as HTMLElement).appendChild($('p', {}, ...['The requested page was not found.']));
        },
    });

    private static _builtinError = () => new Component('div', {
        initializeComponent(sender: Component) {
            sender.style({
                padding: '20px', fontFamily: 'Arial, sans-serif', display: 'flex', 'flex-direction': 'column', 'align-items': 'center'
            });
            (sender.element as HTMLElement).appendChild($('h2', {}, ...['Error']));
            (sender.element as HTMLElement).appendChild($('p', {}, ...['The requested page could not be loaded.']));
        },
    });

    public async navigateByName(name: string, params?: Record<string, any>, options?: NavigationOptions): Promise<any> {

        return await this.navigate(this.href(name, params), options);
    }

    private async _runMiddlewares(initialUri: string): Promise<{ proceed: boolean, uri: string }> {
        let urix = initialUri;
        const ctx: RouteResolveContext = {
            uri: urix,
            rewritePath: (uri: string) => {
                urix = uri;
                (ctx as any).uri = uri;
            },
            context: this.application
        };
        let proceed = false;
        const stack = this._routerOptions.middlewareCollections ? this._routerOptions.middlewareCollections() || [] : [];
        const dispatch = async (i: number): Promise<void> => {
            if (i === stack.length) { proceed = true; return; }
            const fn = stack[i];
            await fn(ctx, async () => { await dispatch(i + 1); });
        };
        if (stack.length === 0) {
            proceed = true;
        } else {
            await dispatch(0);
        }
        return { proceed, uri: urix };
    }

    public resolve(uri: string): ResolveResult {
        const candidates: Array<{ rec: RouteRecord; params: Record<string, any> }> = [];
        const pageSearch = this._pageSearch();
        for (const rec of this.routeCollection?.records! || []) {
            if (!rec.scanner.exist(uri, pageSearch)) continue;
            const params = { ...rec.scanner.parameters };
            if (!this.validateChain(uri, rec, params)) continue;
            candidates.push({ rec, params });
        }

        if (candidates.length === 0) {
            const catchAll = (this.routeCollection?.records || []).find(r => r.scanner.exist('/*'));
            if (catchAll) {
                const mergedExtend: Record<string, any> = {};
                try {
                    for (const item of catchAll.chain) {
                        if (item && item.extend && typeof item.extend === 'object') {
                            Object.assign(mergedExtend, item.extend);
                        }
                    }
                } catch { /* ignore */ }

                return {
                    ok: true,
                    uri,
                    fullPath: catchAll.fullPath,
                    route: catchAll.leaf,
                    chain: catchAll.chain,
                    params: {},
                    extend: mergedExtend || {},
                    meta: (catchAll as any).meta || {}
                };
            }

            return {
                ok: false,
                uri,
                fullPath: null,
                route: null,
                chain: [],
                params: {},
                extend: {}
            };
        }

        let best = candidates[0];
        const groups = new Map<string, Array<{ rec: RouteRecord; params: Record<string, any> }>>();
        for (const c of candidates) {
            // Aynı path grubunda en uzun zincirli olanı seç.
            const key = c.rec.fullPath;
            const arr = groups.get(key) || [];
            arr.push(c); groups.set(key, arr);
        }
        let pickedFromDuplicate = false;
        for (const [key, arr] of groups) {
            if (arr.length > 1) {
                // Legacy sıralamaya dön: sığ zincir önce, sonra uzun fullPath. 
                const pool = arr.some(c => !c.rec.aliasOf) ? arr.filter(c => !c.rec.aliasOf) : arr;
                const deepest = pool.reduce((a, b) => a.rec.chain.length >= b.rec.chain.length ? a : b);
                best = deepest;
                pickedFromDuplicate = true;
                break;
            }
        }
        if (!pickedFromDuplicate) {
            // En iyi adayı ResolveResult'a dönüştür.
            // Ortak tercih kuralı (RouteCollection.compareRouteRecords): sığ zincir, statik segment, az parametre, uzun path
            best = candidates.reduce((a, b) => compareRouteRecords(a.rec, b.rec) <= 0 ? a : b, candidates[0]);
        }

        const rec = best.rec;
        const params = best.params;
        const mergedExtend: Record<string, any> = {};
        try {
            for (const item of rec.chain) {
                if (item && item.extend && typeof item.extend === 'object') {
                    Object.assign(mergedExtend, item.extend);
                }
            }
        } catch { /* ignore */ }
        return {
            ok: true,
            uri,
            fullPath: rec.fullPath,
            aliasOf: rec.aliasOf ?? null,
            route: rec.leaf,
            chain: rec.chain,
            params,
            extend: mergedExtend,
            meta: (() => {
                const mergedMeta: Record<string, any> = {};
                try {
                    for (const item of rec.chain) {
                        if (item && (item as any).meta && typeof (item as any).meta === 'object') {
                            Object.assign(mergedMeta, (item as any).meta);
                        }
                    }
                } catch { /* ignore */ }
                return mergedMeta;
            })()
        };
    }

    // Doğrulama başarısızsa zincir geçersiz.
    private validateChain(uri: string, rec: RouteRecord, params: Record<string, any>): boolean {
        for (const item of rec.chain) {
            if (typeof item.validate === 'function') {
                const e: RouterValidateEventArgs = {
                    uri,
                    key: item.name ?? rec.fullPath,
                    // createInstance: control alanından gerçek component instance'ını üretir.
                    routes: this.routesMap,
                    params
                };
                // Fonksiyon ise: doğrudan çağırmayı dener (factory gibi).
                if (!item.validate(e)) return false;
            }
        }
        return true;
    }

    private _navHandler: ((e: Event) => void) | null = null;
    private _installLinkInterceptor() {
        try {
            if (this._navHandler) return;
            this._navHandler = (ev: Event) => {
                const w = window as any;
                const mode = this._routerOptions.mode || (w?.location?.protocol === 'file:' ? 'hash' : 'history');
                let el = ev.target as HTMLElement | null;
                while (el && el !== document.body) {
                    if (el instanceof HTMLAnchorElement) break;
                    el = el.parentElement;
                }
                if (!el || !(el instanceof HTMLAnchorElement)) return;
                // opt-in via data-router-link veya rel="router"
                const rel = el.getAttribute('rel') || '';
                const optIn = el.getAttribute("x-command") == 'router' || el.hasAttribute('data-router-link') || rel.toLowerCase() === 'router';
                if (!optIn) return;
                // modifier keys veya target="_blank" => ignore
                const a = el as HTMLAnchorElement;
                if (a.target && a.target !== '_self') return;
                if ((ev as MouseEvent).metaKey || (ev as MouseEvent).ctrlKey || (ev as MouseEvent).shiftKey || (ev as MouseEvent).altKey) return;
                let href = a.getAttribute('href') || '';
                if (!href) {
                    href = a.getAttribute('x-to') || '';
                };
                if (!href) return;
                // same-origin kontorlü (history mode için)
                if (mode === 'history') {
                    const u = new URL(href, w.location.href);
                    if (u.origin !== w.location.origin) return;
                    ev.preventDefault();
                    const path = u.pathname + u.search + u.hash;
                    this.navigate(path);
                    return;
                }
                ev.preventDefault();
                const path = href.startsWith('#') ? href.slice(1) : href;
                this.navigate(path);
            };
            document.addEventListener('click', this._navHandler);
        } catch { }
    }

    private _applyUrl(uri: string, options: NavigationOptions = {}) {
        try {
            const w = window as any;
            const mode = this._routerOptions.mode || (w?.location?.protocol === 'file:' ? 'hash' : 'history');
            if (mode === 'shell') return; // shell mode'da URL değişikliğine izin verme

            if (mode === 'hash' || mode === 'file') {
                const target = uri.startsWith('#') ? uri : ('#' + uri);
                if (w?.location?.hash !== target) {
                    if (options.replace && w?.history && typeof w.history.replaceState === 'function') {
                        const stamp = this._nextHistoryStamp(false);
                        w.history.replaceState(this._routerState(options.state, stamp), '', target);
                        this._historyStamp = stamp;
                    } else {
                        w.location.hash = target;
                        const stamp = this._nextHistoryStamp(true);
                        this._stampCurrentEntry(stamp, options.state);
                        this._historyStamp = stamp;
                    }
                }
                return;
            }

            if (w?.history && typeof w.history.pushState === 'function') {
                const current = (w.location.pathname || '/') + (w.location.search || '') + (w.location.hash || '');
                let wanted = uri;
                try {
                    const url = new URL(uri, w.location.href);
                    wanted = url.pathname + url.search + url.hash;
                } catch { }
                if (current !== wanted) {
                    if (options.replace) {
                        const stamp = this._nextHistoryStamp(false);
                        w.history.replaceState(this._routerState(options.state, stamp), '', uri);
                        this._historyStamp = stamp;
                    } else {
                        const stamp = this._nextHistoryStamp(true);
                        w.history.pushState(this._routerState(options.state, stamp), '', uri);
                        this._historyStamp = stamp;
                    }
                }
            }
        } catch { }
    }

    private _resolveRedirect(target: ResolveResult, uri: string): string | null {
        const redirect = target.route?.redirect;
        if (!redirect) return null;
        if (typeof redirect === 'function') {
            const result = redirect({
                path: target.uri,
                params: target.params,
                meta: (target as any).meta ?? target.extend
            });
            return typeof result === 'string' && result.length > 0 ? result : null;
        }
        const path = this.routingEngine.generatePathString(redirect, target.params || {});
        const hashIndex = uri.indexOf('#');
        const hash = hashIndex >= 0 ? uri.slice(hashIndex) : '';
        const beforeHash = hashIndex >= 0 ? uri.slice(0, hashIndex) : uri;
        const queryIndex = beforeHash.indexOf('?');
        const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : '';
        const ownHashIndex = path.indexOf('#');
        const ownHash = ownHashIndex >= 0 ? path.slice(ownHashIndex) : '';
        let result = ownHashIndex >= 0 ? path.slice(0, ownHashIndex) : path;
        if (query && !result.includes('?')) result += query;
        return result + (ownHash || hash);
    }

    private _pageSearch(): string | undefined {
        try {
            const w = window as any;
            const mode = this._routerOptions.mode || (w?.location?.protocol === 'file:' ? 'hash' : 'history');
            if (mode === 'history' || mode === 'shell') return undefined;
            return w?.location?.search || undefined;
        } catch { return undefined; }
    }

    private _addressShows(...uris: Array<string | undefined>): boolean {
        const current = this._getCurrentUri().split('#')[0];
        return uris.some(u => !!u && u.split('#')[0] === current);
    }

    private _uriWithHash(appliedPath: string, requestedUri: string): string {
        const index = requestedUri.indexOf('#');
        if (index < 0 || appliedPath.indexOf('#') >= 0) return appliedPath;
        return appliedPath + requestedUri.slice(index);
    }

    private _handleScrollBehavior(scrollOption?: NavigationOptions['scroll']) {
        if (!scrollOption) return;

        try {
            if (scrollOption === 'top') {
                window.scrollTo({ top: 0, behavior: 'auto' });
            } else if (scrollOption === 'smooth') {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (scrollOption === 'instant') {
                window.scrollTo({ top: 0, behavior: 'instant' });
            } else if (typeof scrollOption === 'object') {
                window.scrollTo({
                    top: scrollOption.top || 0,
                    left: scrollOption.left || 0,
                    behavior: scrollOption.behavior || 'auto'
                });
            }
        } catch { }
    }

    public dispose(): Promise<void> {
        try { this._scroll?.dispose(); } catch { }
        this._scroll = null;
        this._historyStamp = null;
        let done: Promise<void> = Promise.resolve();
        try {
            // keepAlive önbelleğindeki örnekleri bırak
            try { done = this.routingEngine.dispose(); } catch { }
            if (this._navHandler) {
                try { document.removeEventListener('click', this._navHandler); } catch { }
                this._navHandler = null;
            }
            if (this._windowNavListener) {
                const evt = this._routerOptions.mode === 'hash' || this._routerOptions.mode === 'file' ? 'hashchange' : 'popstate';
                try { window.removeEventListener(evt, this._windowNavListener); } catch { }
                this._windowNavListener = null;
            }
        } catch { }
        return done;
    }

}