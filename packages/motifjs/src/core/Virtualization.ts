
import { Component, findAppendableComponent } from '../';
import { ComponentBase, notifyDeactivated } from '../';
import { effect, untracked } from '../store';
import { reportError, reportWarning } from '../common/diagnostics';

export interface VirtualizationDataRequest {
    page: number;
    pageSize: number;
    scrollTop: number;
}

export interface VirtualizationDataResponse<T> {
    items: T[];
    totalCount: number;
    hasMore: boolean;
}

export interface VirtualizationState<T> {
    isLoading: boolean;
    isInitialized: boolean;
    currentPage: number;
    totalCount: number;
    hasMore: boolean;
    error?: Error;
    data: T[];
}

export interface VirtualizationProps<T> {
    dataRequest: (request: VirtualizationDataRequest) => Promise<VirtualizationDataResponse<T>>;
    itemTemplate: (item: T, index: number) => any;
    itemHeight: number | ((item: T, index: number) => number);
    pageSize?: number;
    renderMode?: 'item' | 'page';
    mainTemplate?: (content: Component, state: VirtualizationState<T>) => any;
    loadingTemplate?: (state: VirtualizationState<T>) => any;
    emptyTemplate?: () => any;
    errorTemplate?: (error: Error) => any;
    overscan?: number;
    autoLoad?: boolean;
    autoLoadThreshold?: number;
    overscanPages?: number;
    pageBuffer?: number;
    className?: string;
    style?: Partial<CSSStyleDeclaration>;
    filter?: (item: T[]) => T[];
    cacheSize?: number;
    
    autoRefresh?: boolean; 
    watch?: () => unknown;
}

export class Virtualization<T = any> extends Component<HTMLDivElement, VirtualizationProps<T>> {
    private readonly _state: VirtualizationState<T>;

    private _virtualContent!: Component<Comment>;
    private _topSpacer!: Component<HTMLDivElement>;
    private _bottomSpacer!: Component<HTMLDivElement>;
    private _cache = new Map<any, ComponentBase>();
    private _view: T[] = [];
    private _occurrence: number[] = [];
    private _occurrenceKeys = new WeakMap<object, object[]>();

    private _isLoadingMore = false;
    private _emptyRendered: boolean = false;
    private _renderPending = false;

    constructor(props: VirtualizationProps<T>) {
        super('div', props as any);

        if (props.className) this.class.add(props.className);
        if (props.style) Object.assign(this.element.style, props.style);

        this._state = this.useModel({
            isLoading: false,
            isInitialized: false,
            currentPage: 0,
            totalCount: 0,
            hasMore: true,
            error: undefined,
            data: []
        });

        this._loadMore = this._loadMore.bind(this);
        this._renderLoadingState = this._renderLoadingState.bind(this);
        this._renderErrorState = this._renderErrorState.bind(this);
        this._renderEmptyState = this._renderEmptyState.bind(this);
        this._loadInitial = this._loadInitial.bind(this);
        this.renderViewport = this.renderViewport.bind(this);
        this._makeView();
    }

    contentWrapper = new Component();
    wrapper!: Component;
    private _makeView() {

        this._topSpacer = new Component<HTMLDivElement>('div');
        this._topSpacer.element.style.cssText = 'height: 0px;';
        this._topSpacer.class.add('motif-virtualization-top-spacer');
        this._bottomSpacer = new Component<HTMLDivElement>('div');
        this._bottomSpacer.element.style.cssText = 'height: 0px;';
        this._bottomSpacer.class.add('motif-virtualization-bottom-spacer');

        this._virtualContent = new Component<Comment>(document.createComment(''));  

        if (this.props.mainTemplate) {
            this.contentWrapper.controls.add(this._topSpacer, this._virtualContent, this._bottomSpacer);     
            this.contentWrapper.onBuilding = ((s) => {
                var el = findAppendableComponent(s.parent!);
                if (el) {
                    this.wrapper = el!;
                    this._loadInitial();
                    el.style({ overflowY: 'auto', position: 'relative' });
                    el.motif.on('scroll', this._handleScroll);
                }
            });

            this.controls.add(this.props.mainTemplate(this.contentWrapper, this._state));
        } else {
            this.wrapper = this;
            this.element.style.cssText = 'overflow-y: auto; height: 100%; position: relative;';
            this.controls.add(this._topSpacer, this._virtualContent, this._bottomSpacer);
            this.motif.on('scroll', this._handleScroll); 
        }
    }

    private _initialLoadStarted = false;
    onBuilding() {
        if (this.props.mainTemplate || this._initialLoadStarted) return;
        this._initialLoadStarted = true;
        this._loadInitial();
    }

    onMounted() {
        this._observeResize();
        if (this._renderPending) this.renderViewport();
    }

    onDisposing() {
        this._stopResizeObserver();
        this._stopDataWatch();
        this._clearContent();
    }

    private _offsets: number[] | null = null;
    private _resizeObserver?: ResizeObserver;
    private _observed?: Element;
    private _observedHeight = -1;

    private _fixedHeight(): number | null {
        const h = this.props.itemHeight;
        return typeof h === 'function' ? null : h;
    }

    private _computeOffsets(): void {
        const fn = this.props.itemHeight;
        if (typeof fn !== 'function') { this._offsets = null; return; }
        const view = this._view;
        const offsets = new Array<number>(view.length + 1);
        offsets[0] = 0;
        for (let i = 0; i < view.length; i++) {
            let h = 0;
            try { h = Number(fn(view[i], i)); } catch { h = 0; }
            offsets[i + 1] = offsets[i] + (h > 0 && Number.isFinite(h) ? h : 0);
        }
        this._offsets = offsets;
    }

    private _layoutOffsets(): number[] {
        if (!this._offsets || this._offsets.length !== this._view.length + 1) this._computeOffsets();
        return this._offsets!;
    }

    private _offsetOf(index: number): number {
        const h = this._fixedHeight();
        if (h !== null) return index * h;
        const offsets = this._layoutOffsets();
        return offsets[Math.min(Math.max(0, index), offsets.length - 1)];
    }

    private _indexAt(y: number, offsets: number[]): number {
        const total = offsets.length - 1;
        if (total <= 0) return 0;
        let lo = 0, hi = total - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (offsets[mid] <= y) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    private _observeResize(): void {
        const el = this.wrapper?.element as unknown as HTMLElement | undefined;
        if (!el || this._observed === el || this.isDisposed) return;
        const RO = (globalThis as any).ResizeObserver;
        if (typeof RO !== 'function') return;
        this._stopResizeObserver();
        this._observedHeight = el.clientHeight;
        const observer: ResizeObserver = new RO(() => {
            if (this.isDisposed) return;
            const h = el.clientHeight;
            if (h === this._observedHeight) return;
            this._observedHeight = h;
            this.renderViewport();
        });
        observer.observe(el);
        this._resizeObserver = observer;
        this._observed = el;
    }

    private _stopResizeObserver(): void {
        try { this._resizeObserver?.disconnect(); } catch { }
        this._resizeObserver = undefined;
        this._observed = undefined;
    }

    
    private _loadSeq = 0;
    private _dataWatchStop?: () => void;
    private _reloadScheduled = false;
    private _reloadTimes: number[] = [];

    private _stopDataWatch(): void {
        this._dataWatchStop?.();
        this._dataWatchStop = undefined;
    }

    /**
     * dataRequest'i çağırır. `watch` açıksa çağrının senkron kısmında okunan reaktif veriyi izler;
     * değişince yeniden yükleme planlar. Aksi hâlde çağrı hiçbir dış effect'e bağımlılık sızdırmaz.
     */
    private _request(request: VirtualizationDataRequest, watch: boolean): Promise<VirtualizationDataResponse<T>> {
        const call = (): Promise<VirtualizationDataResponse<T>> => {
            try { return Promise.resolve(this.props.dataRequest(request)); }
            catch (error) { return Promise.reject(error); }
        };
        if (!watch || this.props.autoRefresh === false) return untracked(call);

        this._stopDataWatch();
        let result!: Promise<VirtualizationDataResponse<T>>;
        let first = true;
        this._dataWatchStop = effect(() => {
            if (first) {
                first = false;
                try { this.props.watch?.(); } catch (error) { reportError('MJX205', error); }
                result = call();
                return;
            }
            this._scheduleReload();
        });
        return result;
    }

    private _scheduleReload(): void {
        if (this._reloadScheduled || this.isDisposed) return;
        this._reloadScheduled = true;
        queueMicrotask(() => {
            this._reloadScheduled = false;
            if (this.isDisposed) return;
            // Sonsuz döngü koruması, 1 sn'de 30'u aşınca dur.
            const now = Date.now();
            this._reloadTimes = this._reloadTimes.filter(t => now - t < 1000);
            this._reloadTimes.push(now);
            if (this._reloadTimes.length > 30) {
                this._stopDataWatch();
                reportWarning('MJX206', []);
                return;
            }
            if (this._state.isInitialized) void this._reloadLoaded();
            else void this._loadInitial();
        });
    }

    /** Yüklü aralığı (0..currentPage) tek istekte yeniden alır; içerik yanıt gelene kadar kalır. */
    private async _reloadLoaded(): Promise<void> {
        const seq = ++this._loadSeq;
        const pageSize = this.props.pageSize || 50;
        const pages = this._state.currentPage + 1;
        try {
            const response = await this._request({
                page: 0,
                pageSize: pageSize * pages,
                scrollTop: this.wrapper?.element?.scrollTop ?? 0
            }, true);
            if (this.isDisposed || seq !== this._loadSeq) return;
            const el = this.wrapper?.element as HTMLElement | undefined;
            const top = el?.scrollTop ?? 0;
            this._state.currentPage = pages - 1;
            this._state.totalCount = response.totalCount;
            this._state.hasMore = response.hasMore;
            this._state.error = undefined;
            this._state.data = response.items;
            this._rebuildView();
            // Satırlar sökülürken içerik kısalmasın: kısalırsa tarayıcı kaydırmayı kırpar.
            // Boşluğu geçici olarak yeni listenin tam boyuna sabitle; renderViewport düzeltir.
            this._topSpacer.style({ height: '0px' });
            this._bottomSpacer.style({ height: this._offsetOf(this._view.length) + 'px' });
            this._clearContent();
            if (el && el.scrollTop !== top) el.scrollTop = top;
            this.renderViewport();
        } catch (error) {
            if (this.isDisposed || seq !== this._loadSeq) return;
            this._state.error = error as Error;
            this._renderErrorState(error as Error);
        }
    }

    private _handleScroll = (_sender: Component, _event: Event) => {
        this.renderViewport();
        if (this.props.autoLoad === false) return;
        if (!this._state.hasMore || this._isLoadingMore || !this._state.isInitialized) return;
        const el = this.wrapper.element as HTMLElement;
        const fixed = this._fixedHeight();
        const loadedBottom = fixed !== null ? this._state.data.length * fixed : this._offsetOf(this._view.length);
        const distanceToLoaded = loadedBottom - (el.scrollTop + el.clientHeight);
        if (distanceToLoaded < (this.props.autoLoadThreshold ?? 100)) void this._loadMore();
    }

    private async _loadInitial(): Promise<void> {
        const seq = ++this._loadSeq;
        this._state.isLoading = true;
        this._renderLoadingState();

        try {
            const pageSize = this.props.pageSize || 50;

            const response = await this._request({
                page: 0,
                pageSize,
                scrollTop: 0
            }, true);
            if (this.isDisposed || seq !== this._loadSeq) return;
            this._state.currentPage = 0;
            this._state.totalCount = response.totalCount;
            this._state.hasMore = response.hasMore;
            this._state.isInitialized = true;
            this._state.isLoading = false;
            this._state.error = undefined;
            this._state.data = response.items;
            this._clearContent();
            this._rebuildView();
            this.renderViewport();

        } catch (error) {
            if (this.isDisposed || seq !== this._loadSeq) return;
            this._state.isLoading = false;
            this._state.error = error as Error;
            this._renderErrorState(error as Error);
        }
    }

    private async _loadMore(): Promise<void> {
        if (this._isLoadingMore || !this._state.hasMore || !this._state.isInitialized) return;
        const seq = this._loadSeq;
        try {
            this._isLoadingMore = true;
            const nextPage = this._state.currentPage + 1;

            const pageSize = this.props.pageSize || 50;
            const response = await this._request({
                page: nextPage,
                pageSize,
                scrollTop: this.wrapper?.element?.scrollTop ?? 0
            }, false);
            if (this.isDisposed || seq !== this._loadSeq) return;
            this._state.totalCount = response.totalCount;
            this._state.currentPage = nextPage;
            this._state.hasMore = response.hasMore;
            this._state.error = undefined;
            this._state.data.push(...response.items);
            this._rebuildView();
            this.renderViewport();

        } catch (error) {
            if (this.isDisposed || seq !== this._loadSeq) return;
            this._state.error = error as Error;
            reportError('MJX207', error);
        } finally {
            this._isLoadingMore = false;
        }

    }


    private _rebuildView(): void {
        this._view = this.props.filter ? this.props.filter(this._state.data) : this._state.data;
        const seen = new Map<object, number>();
        this._occurrence = this._view.map(item => {
            if (typeof item !== 'object' || item === null) return 0;
            const n = seen.get(item) ?? 0;
            seen.set(item, n + 1);
            return n;
        });
        if (typeof this.props.itemHeight === 'function') this._computeOffsets();
        else this._offsets = null;
    }

    private _clearContent(): void {
        if (!this._virtualContent) return;
        const controls = this._virtualContent.controls;

        for (const c of this._cache.values()) {
            controls.silentUnlink(c);
            if (!c.isDisposed) void c.dispose();
        }
        this._cache.clear();
        controls.clear();
        this._emptyRendered = false;
    }

    private renderViewport(): void {
        if (this.isDisposed || !this.wrapper || !this._state.isInitialized) return;
        const el = this.wrapper.element as HTMLElement;
        this._observeResize();
        const view = this._view;
        const total = view.length;

        if (total === 0) {
            if (!this._emptyRendered) {
                this._clearContent();
                this._renderEmptyState();
            }
            this._topSpacer.style({ height: '0px' });
            this._bottomSpacer.style({ height: '0px' });
            return;
        }
        if (this._emptyRendered) this._clearContent();

        const h = this._fixedHeight();
        let overscan: number, first: number, last: number, topPx: number, bottomPx: number;
        if (h !== null) {
            const visible = Math.floor(el.clientHeight / h);
            if (visible <= 0) {
                this._renderPending = !(el as any).isConnected;
                return;
            }
            this._renderPending = false;

            overscan = Math.max(0, this.props.overscan ?? visible);
            const anchor = Math.min(Math.max(0, Math.floor(el.scrollTop / h)), total - 1);
            first = Math.max(0, anchor - overscan);
            last = Math.min(total, anchor + visible + overscan);
            topPx = first * h;
            bottomPx = Math.max(0, total - last) * h;
        } else {
            if (el.clientHeight <= 0) {
                this._renderPending = !(el as any).isConnected;
                return;
            }
            this._renderPending = false;

            const offsets = this._layoutOffsets();
            const top = Math.max(0, el.scrollTop);
            const bottom = top + el.clientHeight;
            const anchor = this._indexAt(top, offsets);
            let end = anchor;
            while (end < total && offsets[end] < bottom) end++;
            const visible = Math.max(1, end - anchor);
            overscan = Math.max(0, this.props.overscan ?? visible);
            first = Math.max(0, anchor - overscan);
            last = Math.min(total, Math.max(end, anchor + 1) + overscan);
            topPx = offsets[first];
            bottomPx = Math.max(0, offsets[total] - offsets[last]);
        }

        const rows: ComponentBase[] = new Array(last - first);
        const keep = new Set<ComponentBase>();
        for (let i = first; i < last; i++) {
            const c = this._rowFor(view[i], i);
            rows[i - first] = c;
            keep.add(c);
        }

        const inDom = this._virtualContent.controls.items;
        for (const c of inDom.slice()) {
            if (!keep.has(c)) this._detachRow(c);
        }

        for (let pos = 0; pos < rows.length; pos++) {
            const c = rows[pos];
            if (inDom[pos] === c) continue;
            if (c.parent === this._virtualContent) this._detachRow(c);
            this._virtualContent.controls.insert(pos, c);
        }
        this._topSpacer.style({ height: topPx + 'px' });
        this._bottomSpacer.style({ height: bottomPx + 'px' });

        this._evictCache(Math.max(200, (last - first) * 3));

        if (this.props.autoLoad !== false && this._state.hasMore && !this._isLoadingMore && total < last + overscan) {
            void this._loadMore();
        }
    }

    private _occurrenceKey(item: object, occurrence: number): object {
        let keys = this._occurrenceKeys.get(item);
        if (!keys) {
            keys = [];
            this._occurrenceKeys.set(item, keys);
        }
        return keys[occurrence] ??= {};
    }

    private _rowFor(item: T, index: number): ComponentBase {
        const occurrence = this._occurrence[index] ?? 0;
        const key = (typeof item === 'object' && item !== null)
            ? (occurrence === 0 ? item : this._occurrenceKey(item, occurrence))
            : index;
        let component = this._cache.get(key);
        if (component && component.isDisposed) {
            this._cache.delete(key);
            component = undefined;
        }
        if (component) {
            this._cache.delete(key);
            this._cache.set(key, component);
            return component;
        }
        const rendered = this.props.itemTemplate(item, index);
        component = rendered instanceof ComponentBase ? rendered : new Component(rendered);
        (component as any).__listItemRef = item;
        this._cache.set(key, component);
        return component;
    }

    private _detachRow(c: ComponentBase): void {
        const controls = this._virtualContent.controls;
        if (c.isDisposed) { controls.silentUnlink(c); return; }
        const node = c.element as unknown as Node;
        if (node.nodeType === Node.COMMENT_NODE) {
            controls.silentUnlink(c);
            const close = (c.motif.options as any).closeFragment as Node | undefined;
            const frag: DocumentFragment = (c.motif.options as any).cache ?? ((c.motif.options as any).cache = document.createDocumentFragment());
            let cur: Node | null = node;
            while (cur) {
                const next: Node | null = cur.nextSibling;
                frag.appendChild(cur);
                if (cur === close) break;
                cur = next;
            }
            notifyDeactivated(c);
        } else {
            controls.silentDetach(c);
        }
    }

    private _evictCache(limit: number): void {
        const max = this.props.cacheSize ?? limit;
        if (this._cache.size <= max) return;
        for (const [key, c] of this._cache) {
            if (this._cache.size <= max) break;
            if (c.parent === this._virtualContent) continue;
            this._cache.delete(key);
            if (!c.isDisposed) void c.dispose();
        }
    }

    private _renderLoadingState(): void {
        if (!this._virtualContent || !this.props.loadingTemplate) return;
        this._clearContent();
        const loadingElement = this.props.loadingTemplate(this._state);
        this._virtualContent.controls.add(loadingElement);
    }

    private _renderEmptyState(): void {
        if (!this._virtualContent || !this.props.emptyTemplate) return;
        this._clearContent();
        const emptyElement = this.props.emptyTemplate();
        this._virtualContent.controls.add(emptyElement);
        this._emptyRendered = true;
    }

    private _renderErrorState(error: Error): void {
        if (!this._virtualContent) {
            reportError('MJX207', error);
            return;
        }
        this._clearContent();
        if (this.props.errorTemplate) {
            const errorElement = this.props.errorTemplate(error);
            this._virtualContent.controls.add(errorElement);
        } else {
            reportError('MJX207', error);
        }
    }

    public refresh(): Promise<void> {
        this._state.data = [];
        this._state.currentPage = 0;
        this._state.isInitialized = false;
        this._state.hasMore = true;
        this._rebuildView();
        return this._loadInitial();
    }

    public setData(data: T[]) { 
        this._loadSeq++;
        this._stopDataWatch();
        this._state.data = data;
        this._state.currentPage = 0;
        this._state.totalCount = data.length;
        this._state.hasMore = false;
        this._state.isInitialized = true;
        this._state.isLoading = false;
        this._state.error = undefined;
        this._clearContent();
        this._rebuildView();
        this.renderViewport();
    }

    public scrollToIndex(index: number): void {
        if (!this.wrapper) return;
        const total = this._view.length;
        const i = Math.min(Math.max(0, index), Math.max(0, total - 1));
        this.wrapper.element.scrollTop = this._offsetOf(i);
        this.renderViewport();
    }

    public getState(): Readonly<VirtualizationState<T>> {
        return { ...this._state };
    }

}
