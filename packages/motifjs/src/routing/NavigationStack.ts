import { ComponentBase, notifyDeactivated } from "../";
import { disposeNavigationTarget, hasOwnTransition } from "../component/navigation";
import { reportError } from "../common/diagnostics";
import type { NavigationDirection, RouteItem, StackEntryInfo, StackOptions, StackTransitionContext } from "./";

export type HistoryPoint = { index: number; session: string };

export type StackNavigation = {
    direction: NavigationDirection;
    from: HistoryPoint | null;
    to: HistoryPoint | null;
    uri: string;
};

type SavedScroll = Array<[Element, number, number]>;

type SavedPresentation = {
    style: string | null;
    inert: boolean;
    ariaHidden: string | null;
};

export type RetainedEntry = {
    point: HistoryPoint;
    uri: string;
    chain: RouteItem[];
    instances: ComponentBase[];
    top: ComponentBase;
    topIndex: number;
    outlet: any;
    attached: boolean;
    hidden: boolean;
    pendingDetach: boolean;
    saved: SavedPresentation | null;
    scroll: SavedScroll;
};

type Gesture = {
    startX: number;
    startY: number;
    lastX: number;
    samples: Array<[number, number]>;
    dragging: boolean;
    width: number;
    top: HTMLElement;
    topSaved: string | null;
    under: RetainedEntry | null;
    underSaved: string | null;
    offs: Array<() => void>;
};

const STORAGE_KEY = 'motifjs:stack';
const SLIDE_OFFSET = 30;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const isElement = (node: any): node is HTMLElement => !!node && node.nodeType === 1 && !!node.style;

export { hasOwnTransition };

export function markDirection(component: ComponentBase | null | undefined, direction: NavigationDirection): void {
    const el = component?.element as any;
    if (!component || component.isDisposed || !isElement(el)) return;
    try { el.setAttribute('data-nav-direction', direction); } catch { }
    (component.motif.options.transition as any)._markedDirection = true;
}

export function unmarkDirection(component: ComponentBase | null | undefined): void {
    const transition: any = component?.motif?.options?.transition;
    if (!transition?._markedDirection) return;
    transition._markedDirection = false;
    try { (component!.element as any)?.removeAttribute?.('data-nav-direction'); } catch { }
}

export function playLeave(component: ComponentBase): Promise<void> {
    return new Promise<void>((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        try {
            const animation: any = component.motif.options.transition.leaveTransition(done);
            if (animation && typeof animation.addEventListener === 'function') animation.addEventListener('cancel', done);
        } catch {
            done();
        }
    });
}

function saveStyle(el: HTMLElement): string | null {
    return el.getAttribute('style');
}

function restoreStyle(el: HTMLElement, value: string | null): void {
    try {
        el.setAttribute('style', value ?? '');
        if (value === null) el.removeAttribute('style');
    } catch { }
}

function saveScroll(root: HTMLElement): SavedScroll {
    const saved: SavedScroll = [];
    try {
        const visit = (el: Element) => {
            const top = (el as HTMLElement).scrollTop || 0;
            const left = (el as HTMLElement).scrollLeft || 0;
            if (top || left) saved.push([el, top, left]);
        };
        visit(root);
        root.querySelectorAll('*').forEach(visit);
    } catch { }
    return saved;
}

function restoreScroll(saved: SavedScroll): void {
    for (const [el, top, left] of saved) {
        try {
            (el as HTMLElement).scrollTop = top;
            (el as HTMLElement).scrollLeft = left;
        } catch { }
    }
}

function prefersReducedMotion(): boolean {
    try {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { return false; }
}

function play(el: HTMLElement, keyframes: Keyframe[], duration: number, running: Animation[]): Promise<void> {
    if (typeof (el as any).animate !== 'function' || duration <= 0) return Promise.resolve();
    try {
        const animation = el.animate(keyframes, { duration, easing: EASING, fill: 'forwards' });
        running.push(animation);
        return animation.finished.then(() => undefined, () => undefined);
    } catch {
        return Promise.resolve();
    }
}

function overlay(floating: HTMLElement, anchor: HTMLElement, above: boolean): void {
    floating.style.position = 'absolute';
    floating.style.top = '0px';
    floating.style.left = '0px';
    floating.style.margin = '0px';
    floating.style.boxSizing = 'border-box';
    const a = anchor.getBoundingClientRect();
    const f = floating.getBoundingClientRect();
    floating.style.top = (a.top - f.top) + 'px';
    floating.style.left = (a.left - f.left) + 'px';
    floating.style.width = a.width + 'px';
    floating.style.height = a.height + 'px';
    floating.style.pointerEvents = 'none';
    floating.style.zIndex = above ? '2' : '0';
    if (!above) {
        let position = '';
        try { position = getComputedStyle(anchor).position; } catch { }
        if (!position || position === 'static') anchor.style.position = 'relative';
        anchor.style.zIndex = '1';
    }
}

export class NavigationStack {
    readonly retainAttached: boolean;
    readonly depth: number;
    readonly persist: boolean;
    readonly animation: StackOptions['animation'];
    readonly duration: number;
    private readonly swipe: { edge: number; threshold: number } | null;

    private session: string | null = null;
    private readonly entries = new Map<number, RetainedEntry>();
    private readonly uris = new Map<number, string>();
    private loaded: { session: string; uris: Array<[number, string]> } | null = null;
    private current: HistoryPoint | null = null;
    private currentTop: ComponentBase | null = null;
    private readonly offs: Array<() => void> = [];
    private gesture: Gesture | null = null;
    private gestureCommitted = false;
    private awaitingGestureResult = false;
    private disposed = false;

    constructor(options: true | StackOptions) {
        const o: StackOptions = options === true ? {} : options;
        this.retainAttached = o.retain === true;
        this.depth = Math.max(0, Math.floor(o.depth ?? 5));
        this.persist = o.persist === true;
        this.animation = o.animation ?? 'none';
        this.duration = Math.max(0, o.duration ?? 300);
        const sb = o.swipeBack;
        this.swipe = sb
            ? {
                edge: (typeof sb === 'object' && typeof sb.edge === 'number' && sb.edge > 0) ? sb.edge : 24,
                threshold: (typeof sb === 'object' && typeof sb.threshold === 'number' && sb.threshold > 0) ? sb.threshold : 0.35,
            }
            : null;
        if (this.persist) this.load();
        if (this.swipe) this.installSwipe();
    }

    public get retainedCount(): number {
        return this.entries.size;
    }

    public isRetaining(nav: StackNavigation): boolean {
        return !!nav.from && !!nav.to && nav.from.session === nav.to.session && nav.to.index > nav.from.index;
    }

    public begin(nav: StackNavigation): void {
        const point = nav.to;
        if (!point) return;
        if (this.session !== point.session) {
            this.disposeAllEntries();
            this.uris.clear();
            this.session = point.session;
            if (this.loaded && this.loaded.session === point.session) {
                for (const [index, uri] of this.loaded.uris) this.uris.set(index, uri);
            }
            this.loaded = null;
        }
        if (nav.direction === 'push') {
            this.truncate(point.index);
        } else if (nav.direction === 'replace') {
            const stale = this.entries.get(point.index);
            if (stale) { this.entries.delete(point.index); void this.disposeEntry(stale); }
        }
    }

    public take(point: HistoryPoint | null): RetainedEntry | null {
        if (!point || point.session !== this.session) return null;
        const entry = this.entries.get(point.index);
        if (!entry) return null;
        this.entries.delete(point.index);
        entry.pendingDetach = false;
        return entry;
    }

    public retain(point: HistoryPoint, uri: string, chain: RouteItem[], instances: ComponentBase[], topIndex: number, outlet: any, deferHide: boolean): RetainedEntry {
        const top = instances[topIndex];
        const el = top.element as any;
        const entry: RetainedEntry = {
            point, uri, chain: chain.slice(), instances: instances.slice(), top, topIndex, outlet,
            attached: false, hidden: false, pendingDetach: false, saved: null,
            scroll: isElement(el) ? saveScroll(el) : [],
        };
        if (this.retainAttached && isElement(el)) {
            entry.attached = true;
            if (!deferHide) this.hide(entry);
        } else if (deferHide) {
            entry.pendingDetach = true;
        } else {
            try { top.parent?.controls.silentDetach(top); } catch { }
        }
        const previous = this.entries.get(point.index);
        if (previous && previous !== entry) void this.disposeEntry(previous);
        this.entries.set(point.index, entry);
        this.evict();
        return entry;
    }

    public settle(entry: RetainedEntry): void {
        if (entry.top.isDisposed || this.entries.get(entry.point.index) !== entry) return;
        if (entry.attached) {
            this.hide(entry);
        } else if (entry.pendingDetach) {
            entry.pendingDetach = false;
            try { entry.top.parent?.controls.silentDetach(entry.top); } catch { }
        }
    }

    public hide(entry: RetainedEntry): void {
        if (!entry.attached || entry.hidden) return;
        const el = entry.top.element as any;
        if (!isElement(el)) return;
        entry.saved = {
            style: saveStyle(el),
            inert: el.hasAttribute('inert'),
            ariaHidden: el.getAttribute('aria-hidden'),
        };
        try {
            el.style.setProperty('display', 'none', 'important');
            el.setAttribute('inert', '');
            el.setAttribute('aria-hidden', 'true');
        } catch { }
        entry.hidden = true;
        try { notifyDeactivated(entry.top); } catch { }
    }

    public reveal(entry: RetainedEntry): void {
        const el = entry.top.element as any;
        if (entry.hidden && entry.saved && isElement(el)) {
            restoreStyle(el, entry.saved.style);
            try {
                if (!entry.saved.inert) el.removeAttribute('inert');
                if (entry.saved.ariaHidden === null) el.removeAttribute('aria-hidden');
                else el.setAttribute('aria-hidden', entry.saved.ariaHidden);
            } catch { }
        }
        entry.hidden = false;
        entry.saved = null;
    }

    public restoreScroll(entry: RetainedEntry): void {
        restoreScroll(entry.scroll);
    }

    public record(nav: StackNavigation, top: ComponentBase | null): void {
        if (nav.to && nav.to.session === this.session) {
            this.uris.set(nav.to.index, nav.uri);
            if (nav.direction === 'push') {
                for (const index of Array.from(this.uris.keys())) {
                    if (index > nav.to.index) this.uris.delete(index);
                }
            }
            this.current = nav.to;
        }
        this.currentTop = top;
        this.save();
    }

    public describe(): StackEntryInfo[] {
        const current = this.current?.index;
        return Array.from(this.uris.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([index, uri]) => ({ index, uri, current: index === current, retained: this.entries.has(index) }));
    }

    public get gestureCommitPending(): boolean {
        return this.gestureCommitted;
    }

    public consumeGestureCommit(): boolean {
        const committed = this.gestureCommitted;
        this.gestureCommitted = false;
        return committed;
    }

    public traversalSettled(cancelled: boolean): void {
        if (!this.awaitingGestureResult) return;
        this.awaitingGestureResult = false;
        const g = this.gesture;
        if (!cancelled) {
            this.gesture = null;
            this.gestureCommitted = false;
            return;
        }
        this.gestureCommitted = false;
        if (g) void this.settleGesture(g, false);
    }

    public async transition(direction: NavigationDirection, entering: ComponentBase | null, leaving: ComponentBase | null): Promise<void> {
        if (this.consumeGestureCommit()) return;
        if (this.animation === 'none' || !this.animation) return;
        if (direction !== 'push' && direction !== 'back' && direction !== 'forward') return;
        const enteringEl = entering?.element as any;
        const leavingEl = leaving?.element as any;
        if (!isElement(enteringEl) || !isElement(leavingEl) || !enteringEl.isConnected || !leavingEl.isConnected) return;
        if (prefersReducedMotion()) return;

        const backwards = direction === 'back';
        const enteringStyle = saveStyle(enteringEl);
        const leavingStyle = saveStyle(leavingEl);
        const running: Animation[] = [];
        try {
            overlay(leavingEl, enteringEl, backwards);
            if (typeof this.animation === 'function') {
                const context: StackTransitionContext = { direction, entering: enteringEl, leaving: leavingEl };
                await this.animation(context);
            } else {
                const d = this.duration;
                if (backwards) {
                    await Promise.all([
                        play(leavingEl, [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], d, running),
                        play(enteringEl, [{ transform: `translateX(-${SLIDE_OFFSET}%)` }, { transform: 'translateX(0)' }], d, running),
                    ]);
                } else {
                    await Promise.all([
                        play(enteringEl, [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], d, running),
                        play(leavingEl, [{ transform: 'translateX(0)' }, { transform: `translateX(-${SLIDE_OFFSET}%)` }], d, running),
                    ]);
                }
            }
        } catch (error) {
            reportError('MJX308', error);
        } finally {
            for (const a of running) { try { a.cancel(); } catch { } }
            restoreStyle(enteringEl, enteringStyle);
            restoreStyle(leavingEl, leavingStyle);
        }
    }

    public async disposeEntry(entry: RetainedEntry): Promise<void> {
        const top = entry.top;
        if (!top || top.isDisposed) return;
        try { await disposeNavigationTarget(top, { deep: true, skipLeaveTransition: true }); } catch (error) { reportError('MJX307', error); }
    }

    public async dispose(): Promise<void> {
        if (this.disposed) return;
        this.disposed = true;
        for (const off of this.offs.splice(0)) { try { off(); } catch { } }
        if (this.gesture) { this.endGestureListeners(this.gesture); this.gesture = null; }
        await this.disposeAllEntries();
        this.uris.clear();
        this.current = null;
        this.currentTop = null;
    }

    private async disposeAllEntries(): Promise<void> {
        const all = Array.from(this.entries.values());
        this.entries.clear();
        for (const entry of all) await this.disposeEntry(entry);
    }

    private truncate(fromIndex: number): void {
        for (const [index, entry] of Array.from(this.entries)) {
            if (index >= fromIndex) {
                this.entries.delete(index);
                void this.disposeEntry(entry);
            }
        }
    }

    private evict(): void {
        while (this.entries.size > this.depth) {
            let oldest = Infinity;
            for (const index of this.entries.keys()) if (index < oldest) oldest = index;
            const entry = this.entries.get(oldest);
            this.entries.delete(oldest);
            if (entry) void this.disposeEntry(entry);
        }
    }

    private load(): void {
        try {
            if (typeof sessionStorage === 'undefined') return;
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.session !== 'string' || !Array.isArray(parsed.uris)) return;
            const uris: Array<[number, string]> = [];
            for (const pair of parsed.uris) {
                if (Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'string') uris.push([pair[0], pair[1]]);
            }
            this.loaded = { session: parsed.session, uris };
        } catch { }
    }

    private save(): void {
        if (!this.persist || !this.session) return;
        try {
            if (typeof sessionStorage === 'undefined') return;
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ session: this.session, uris: Array.from(this.uris.entries()) }));
        } catch { }
    }

    private installSwipe(): void {
        if (typeof document === 'undefined') return;
        const onStart = (e: TouchEvent) => this.onTouchStart(e);
        try {
            document.addEventListener('touchstart', onStart as any, { passive: true });
            this.offs.push(() => { try { document.removeEventListener('touchstart', onStart as any); } catch { } });
        } catch { }
    }

    private onTouchStart(e: TouchEvent): void {
        if (this.disposed || this.gesture || this.awaitingGestureResult || !this.swipe) return;
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.touches[0];
        if (!t || t.clientX > this.swipe.edge) return;
        if (!this.current || this.current.index <= 0) return;
        const topEl = this.currentTop?.element as any;
        if (!isElement(topEl) || !topEl.isConnected) return;

        const g: Gesture = {
            startX: t.clientX, startY: t.clientY, lastX: t.clientX, samples: [[t.clientX, Date.now()]],
            dragging: false, width: 0, top: topEl, topSaved: null, under: null, underSaved: null, offs: [],
        };
        const onMove = (ev: TouchEvent) => this.onTouchMove(g, ev);
        const onEnd = () => this.onTouchEnd(g);
        try {
            document.addEventListener('touchmove', onMove as any, { passive: false });
            document.addEventListener('touchend', onEnd);
            document.addEventListener('touchcancel', onEnd);
            g.offs.push(() => {
                try { document.removeEventListener('touchmove', onMove as any); } catch { }
                try { document.removeEventListener('touchend', onEnd); } catch { }
                try { document.removeEventListener('touchcancel', onEnd); } catch { }
            });
        } catch { }
        this.gesture = g;
    }

    private endGestureListeners(g: Gesture): void {
        for (const off of g.offs.splice(0)) { try { off(); } catch { } }
    }

    private beginDrag(g: Gesture): void {
        g.dragging = true;
        g.width = g.top.getBoundingClientRect().width || (typeof window !== 'undefined' ? window.innerWidth : 0) || 1;
        g.topSaved = saveStyle(g.top);
        const current = this.current;
        const under = current ? this.entries.get(current.index - 1) ?? null : null;
        if (under && under.attached && isElement(under.top.element) && (under.top.element as any).isConnected) {
            const el = under.top.element as any as HTMLElement;
            g.under = under;
            g.underSaved = saveStyle(el);
            if (under.saved) restoreStyle(el, under.saved.style);
            overlay(el, g.top, false);
            el.style.transform = `translateX(-${SLIDE_OFFSET}%)`;
            restoreScroll(under.scroll);
        }
        g.top.style.willChange = 'transform';
    }

    private applyDrag(g: Gesture, dx: number): void {
        const progress = Math.min(1, Math.max(0, dx / g.width));
        g.top.style.transform = `translateX(${Math.max(0, dx)}px)`;
        if (g.under) {
            (g.under.top.element as any as HTMLElement).style.transform = `translateX(-${SLIDE_OFFSET * (1 - progress)}%)`;
        }
    }

    private onTouchMove(g: Gesture, e: TouchEvent): void {
        const t = e.touches && e.touches[0];
        if (!t) return;
        const dx = t.clientX - g.startX;
        const dy = t.clientY - g.startY;
        if (!g.dragging) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
                this.endGestureListeners(g);
                this.gesture = null;
                return;
            }
            this.beginDrag(g);
        }
        if (e.cancelable) { try { e.preventDefault(); } catch { } }
        const now = Date.now();
        g.lastX = t.clientX;
        g.samples.push([t.clientX, now]);
        while (g.samples.length > 2 && now - g.samples[0][1] > 100) g.samples.shift();
        this.applyDrag(g, dx);
    }

    private onTouchEnd(g: Gesture): void {
        this.endGestureListeners(g);
        if (!g.dragging) { this.gesture = null; return; }
        const dx = g.lastX - g.startX;
        const progress = dx / g.width;
        const first = g.samples[0];
        const last = g.samples[g.samples.length - 1];
        const span = last && first ? last[1] - first[1] : 0;
        const idle = last ? Date.now() - last[1] : Infinity;
        const velocity = span >= 16 && idle <= 50 ? (last[0] - first[0]) / span : 0;
        const commit = progress > this.swipe!.threshold || (velocity > 0.5 && dx > 0);
        void this.settleGesture(g, commit);
    }

    private async settleGesture(g: Gesture, commit: boolean): Promise<void> {
        const running: Animation[] = [];
        const topEl = g.top;
        const underEl = g.under ? g.under.top.element as any as HTMLElement : null;
        const duration = prefersReducedMotion() ? 0 : Math.max(0, Math.round(this.duration * 0.6));
        const currentTop = topEl.style.transform || 'translateX(0px)';
        const currentUnder = underEl?.style.transform || `translateX(-${SLIDE_OFFSET}%)`;
        if (commit) {
            await Promise.all([
                play(topEl, [{ transform: currentTop }, { transform: 'translateX(100%)' }], duration, running),
                underEl ? play(underEl, [{ transform: currentUnder }, { transform: 'translateX(0)' }], duration, running) : Promise.resolve(),
            ]);
            topEl.style.transform = 'translateX(100%)';
            if (underEl) underEl.style.transform = 'translateX(0px)';
            for (const a of running) { try { a.cancel(); } catch { } }
            this.gestureCommitted = true;
            this.awaitingGestureResult = true;
            try { window.history.back(); } catch { this.traversalSettled(true); }
            return;
        }
        await Promise.all([
            play(topEl, [{ transform: currentTop }, { transform: 'translateX(0)' }], duration, running),
            underEl ? play(underEl, [{ transform: currentUnder }, { transform: `translateX(-${SLIDE_OFFSET}%)` }], duration, running) : Promise.resolve(),
        ]);
        for (const a of running) { try { a.cancel(); } catch { } }
        restoreStyle(topEl, g.topSaved);
        if (underEl && g.under) {
            restoreStyle(underEl, g.underSaved);
        }
        if (this.gesture === g) this.gesture = null;
    }
}
