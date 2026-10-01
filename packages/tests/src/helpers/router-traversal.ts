import type { Application } from '@motifx/core';

export function trackRouter(app: Application) {
    return trackModule((app as any).urlRoutingModule);
}

export function trackModule(router: any) {
    const navigations: Promise<unknown>[] = [];
    const navigate = router.navigate;
    router.navigate = function (this: any, ...args: any[]) {
        const done = navigate.apply(this, args);
        navigations.push(done);
        return done;
    };

    let echoes = 0;
    const applyUrl = router._applyUrl;
    router._applyUrl = function (this: any, uri: string, options?: { replace?: boolean }) {
        const before = window.location.href;
        const result = applyUrl.call(this, uri, options);
        const mode = this._routerOptions.mode;
        if ((mode === 'hash' || mode === 'file') && !options?.replace && window.location.href !== before) echoes++;
        return result;
    };

    const traversals: Promise<unknown>[] = [];
    let wake: (() => void) | null = null;
    const traverseEntry = router._onHistoryTraversal;
    router._onHistoryTraversal = function (this: any) {
        const done = traverseEntry.call(this);
        traversals.push(done);
        const w = wake;
        wake = null;
        w?.();
        return done;
    };

    const nextTraversal = async () => {
        while (!traversals.length) {
            await new Promise<void>(r => { wake = r; });
        }
        await traversals.shift();
    };

    const idle = async () => {
        while (navigations.length || echoes) {
            await Promise.all(navigations.splice(0));
            while (echoes) {
                echoes--;
                await nextTraversal();
            }
        }
    };

    return {
        idle,
        async traverse(fn: () => void) {
            await idle();
            const go = jest.spyOn(window.history, 'go');
            try {
                fn();
                let calls = go.mock.calls.length;
                for (;;) {
                    await nextTraversal();
                    if (go.mock.calls.length === calls) break;
                    calls = go.mock.calls.length;
                }
            } finally {
                go.mockRestore();
            }
            await idle();
        },
    };
}
