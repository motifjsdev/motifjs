export type TransitionMode = 'concurrent' | 'out-in' | 'in-out';

export const transitionSettings: { mode: TransitionMode } = { mode: 'concurrent' };

type Entry = { node: Node; via: Node | null; done: Promise<void> };

export type TrackedRun = { done: () => void; release: () => void; finished?: Promise<void> };

const noop = () => { };

function createTracker() {
    const running = new WeakMap<Node, Set<Entry>>();

    function track(node: Node | null | undefined, resolve: () => void, via?: Node | null): TrackedRun {
        const host = node?.parentNode ?? via?.parentNode;
        if (!host) return { done: resolve, release: noop };
        let set = running.get(host);
        if (!set) running.set(host, (set = new Set()));
        let finish: () => void = noop;
        const entry: Entry = { node: node!, via: via ?? null, done: new Promise<void>(r => { finish = r; }) };
        set.add(entry);
        let settled = false;
        const release = () => {
            if (settled) return;
            settled = true;
            set!.delete(entry);
            finish();
        };
        return {
            done: () => {
                const first = !settled;
                release();
                if (first && resolve) resolve();
            },
            release,
            finished: entry.done,
        };
    }

    function pending(host: Node | null | undefined, except?: Node | null): Promise<void> | null {
        if (!host) return null;
        const set = running.get(host);
        if (!set || set.size === 0) return null;
        let waits: Promise<void>[] | null = null;
        for (const entry of set) {
            if (entry.node === except) continue;
            if (entry.node.parentNode !== host && entry.via?.parentNode !== host) {
                set.delete(entry);
                continue;
            }
            (waits ??= []).push(entry.done);
        }
        return waits ? Promise.all(waits).then(noop) : null;
    }

    return { track, pending };
}

const leaves = createTracker();
const enters = createTracker();

export const trackLeave = leaves.track;
export const pendingLeaves = leaves.pending;
export const trackEnter = enters.track;
export const pendingEnters = enters.pending;

export function deferUntilEntered(node: Node, run: TrackedRun, play: () => unknown): Animation {
    const host = node.parentNode;
    const handle: any = {
        finished: run.finished ?? Promise.resolve(),
        playState: 'pending',
        addEventListener: noop,
        removeEventListener: noop,
        cancel: noop,
    };
    queueMicrotask(() => {
        const wait = pendingEnters(host, node);
        if (wait) wait.then(() => { play(); });
        else play();
    });
    return handle as Animation;
}

export function isTransitionMode(value: any): value is TransitionMode {
    return value === 'concurrent' || value === 'out-in' || value === 'in-out';
}
