import type { Application } from "../application";
import { Component } from "../component/Component";
import { ComponentBase } from "../component/componentBase";
import { motifError } from "../common/diagnostics";
import { reactive } from "../store";
import { dom } from "./dom";
import { connectDocument } from "./documents";

export type WindowKind = 'popup' | 'pip';

export interface WindowOptions {
    kind?: WindowKind;
    fallback?: 'popup' | 'none';
    width?: number;
    height?: number;
    left?: number;
    top?: number;
    name?: string;
    features?: string;
    title?: string;
    styles?: 'live' | 'once' | 'none' | ((doc: Document) => void);
    orphans?: 'dispose' | 'keep';
    closeWhenEmpty?: boolean;
    closeOnNavigate?: boolean;
    owner?: ComponentBase;
}

export type WindowClosedResult = { returned: ComponentBase[]; disposed: ComponentBase[]; kept: ComponentBase[] };

type Origin = { parent: ComponentBase; before: ComponentBase | null };

export class AppWindow {
    public readonly host: Component;
    public readonly components: ComponentBase[] = [];
    private _open = true;
    private _resolve!: (result: WindowClosedResult) => void;
    private readonly _closed: Promise<WindowClosedResult>;
    private readonly _offs: Array<() => void> = [];
    private readonly _watchers = new Map<ComponentBase, () => void>();

    constructor(private readonly _manager: WindowManager, public readonly window: Window, public readonly kind: WindowKind | 'attached', private readonly _options: WindowOptions) {
        this._closed = new Promise(resolve => { this._resolve = resolve; });
        this.host = new Component(window.document.body);
        (this.host as any)._keepElementOnDispose = true;
        this.host.build();
        try { window.document.title = _options.title ?? dom.document?.title ?? ''; } catch { }
        this._offs.push(connectDocument(window.document));
        const onHide = () => { this._finish(false); };
        window.addEventListener('pagehide', onHide);
        this._offs.push(() => { try { window.removeEventListener('pagehide', onHide); } catch { } });
        if (_options.owner) _options.owner.motif.setDisposable(() => { this.close(); });
    }

    public get document(): Document {
        return this.window.document;
    }

    public get isOpen(): boolean {
        return this._open;
    }

    public get closed(): Promise<WindowClosedResult> {
        return this._closed;
    }

    public add(...components: ComponentBase[]): this {
        if (!this._open) throw motifError('MJX420');
        for (const component of components) {
            if (!component || component.isDisposed) throw motifError('MJX422');
            this._manager._take(component, this);
            if (component.parent) component.parent.controls.silentDetach(component);
            this.host.controls.add(component);
            if (!this.components.includes(component)) this.components.push(component);
            this._watch(component);
        }
        return this;
    }

    public release(component: ComponentBase): void {
        if (!this.components.includes(component)) return;
        this._forget(component);
        if (!this._manager._restore(component) && !component.isDisposed) this.host.controls.silentDetach(component);
        this._closeWhenEmpty();
    }

    public focus(): void {
        try { this.window.focus(); } catch { }
    }

    public close(): Promise<WindowClosedResult> {
        if (this._open) {
            this._finish(false);
            try { this.window.close(); } catch { }
        }
        return this._closed;
    }

    public _track(off: () => void): void {
        this._offs.push(off);
    }

    public _lost(component: ComponentBase): void {
        this._forget(component);
        this._closeWhenEmpty();
    }

    public _finish(disposing: boolean): void {
        if (!this._open) return;
        this._open = false;
        const result: WindowClosedResult = { returned: [], disposed: [], kept: [] };
        for (const component of this.components.splice(0)) {
            this._unwatch(component);
            if (component.isDisposed) continue;
            if (!disposing && this._manager._restore(component)) { result.returned.push(component); continue; }
            if (!disposing && this._options.orphans === 'keep') {
                this._manager._forget(component);
                this.host.controls.silentDetach(component);
                result.kept.push(component);
                continue;
            }
            this._manager._forget(component);
            result.disposed.push(component);
        }
        for (const off of this._offs.splice(0)) { try { off(); } catch { } }
        this.host.dispose();
        this._manager._remove(this);
        this._resolve(result);
    }

    private _forget(component: ComponentBase): void {
        const index = this.components.indexOf(component);
        if (index >= 0) this.components.splice(index, 1);
        this._unwatch(component);
    }

    private _watch(component: ComponentBase): void {
        if (this._watchers.has(component)) return;
        const dropped = () => {
            this._forget(component);
            this._manager._forget(component);
            this._closeWhenEmpty();
        };
        component.motif.on('x:disposed' as any, dropped);
        this._watchers.set(component, () => { component.motif.off('x:disposed' as any, dropped); });
    }

    private _unwatch(component: ComponentBase): void {
        const off = this._watchers.get(component);
        if (!off) return;
        this._watchers.delete(component);
        off();
    }

    private _closeWhenEmpty(): void {
        if (this._open && !this.components.length && this._options.closeWhenEmpty !== false) this.close();
    }
}

export class WindowManager {
    private readonly _state = reactive({ version: 0 });
    private readonly _items: AppWindow[] = [];
    private readonly _origins = new WeakMap<ComponentBase, Origin>();
    private readonly _holders = new WeakMap<ComponentBase, AppWindow>();
    private _seq = 0;
    private _pageHide: (() => void) | null = null;

    constructor(private readonly _app: Application) { }

    public get list(): AppWindow[] {
        void this._state.version;
        return this._items.slice();
    }

    public supports(kind: WindowKind): boolean {
        const win: any = dom.window;
        if (kind === 'pip') return typeof win?.documentPictureInPicture?.requestWindow === 'function';
        return typeof win?.open === 'function';
    }

    public open(component: ComponentBase, options: WindowOptions = {}): Promise<AppWindow> {
        return this.create(options).then(handle => handle.add(component));
    }

    public create(options: WindowOptions = {}): Promise<AppWindow> {
        if (options.kind === 'pip' && options.fallback === 'none') return Promise.reject(motifError('MJX419'));
        let win: Window | null = null;
        try { win = dom.window.open('', options.name ?? `motif-window-${++this._seq}`, this._features(options)); } catch { win = null; }
        if (!win) return Promise.reject(motifError('MJX418'));
        return Promise.resolve(this._attach(win, 'popup', options));
    }

    public attach(win: Window, options: WindowOptions = {}): AppWindow {
        if (!win || typeof win !== 'object' || (win as any).document?.nodeType !== 9) throw motifError('MJX421');
        return this._attach(win, 'attached', options);
    }

    public of(component: ComponentBase): AppWindow | null {
        return this._holders.get(component) ?? null;
    }

    public closeAll(): Promise<void> {
        return Promise.all(this._items.slice().map(handle => handle.close())).then(() => undefined);
    }

    public _take(component: ComponentBase, target: AppWindow): void {
        const previous = this._holders.get(component);
        if (previous && previous !== target) previous._lost(component);
        if (!this._origins.has(component) && component.parent && !this._isHost(component.parent)) {
            const items = component.parent.controls.items;
            const index = items.indexOf(component);
            this._origins.set(component, { parent: component.parent, before: index >= 0 ? items[index + 1] ?? null : null });
        }
        this._holders.set(component, target);
    }

    public _restore(component: ComponentBase): boolean {
        this._holders.delete(component);
        const origin = this._origins.get(component);
        if (!origin) return false;
        this._origins.delete(component);
        if (origin.parent.isDisposed) return false;
        if (component.parent) component.parent.controls.silentDetach(component);
        const items = origin.parent.controls.items;
        let anchor: ComponentBase | null = origin.before;
        let index = -1;
        while (anchor) {
            index = items.indexOf(anchor);
            if (index >= 0) break;
            anchor = this._origins.get(anchor)?.before ?? null;
        }
        if (index >= 0) origin.parent.controls.insert(index, component); else origin.parent.controls.add(component);
        return true;
    }

    public _forget(component: ComponentBase): void {
        this._holders.delete(component);
        this._origins.delete(component);
    }

    public _remove(handle: AppWindow): void {
        const index = this._items.indexOf(handle);
        if (index < 0) return;
        this._items.splice(index, 1);
        this._state.version++;
        if (!this._items.length) this._unlistenPage();
        this._app.fire('window-closed', { window: handle });
    }

    public _disposeAll(): void {
        for (const handle of this._items.slice()) {
            handle._finish(true);
            try { handle.window.close(); } catch { }
        }
        this._unlistenPage();
    }

    private _attach(win: Window, kind: WindowKind | 'attached', options: WindowOptions): AppWindow {
        const handle = new AppWindow(this, win, kind, options);
        this._items.push(handle);
        this._state.version++;
        this._listenPage();
        if (options.closeOnNavigate) handle._track(this._app.onRouterChanged(() => { handle.close(); }));
        this._app.fire('window-opened', { window: handle });
        return handle;
    }

    private _features(options: WindowOptions): string {
        const parts = ['popup'];
        if (options.width != null) parts.push(`width=${options.width}`);
        if (options.height != null) parts.push(`height=${options.height}`);
        if (options.left != null) parts.push(`left=${options.left}`);
        if (options.top != null) parts.push(`top=${options.top}`);
        if (options.features) parts.push(options.features);
        return parts.join(',');
    }

    private _isHost(component: ComponentBase): boolean {
        return this._items.some(handle => handle.host === component);
    }

    private _listenPage(): void {
        if (this._pageHide) return;
        this._pageHide = () => { this._disposeAll(); };
        try { dom.window.addEventListener('pagehide', this._pageHide); } catch { this._pageHide = null; }
    }

    private _unlistenPage(): void {
        if (!this._pageHide) return;
        try { dom.window.removeEventListener('pagehide', this._pageHide); } catch { }
        this._pageHide = null;
    }
}
