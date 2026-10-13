import { Application, reactive, createSignal, effect } from '@motifx/core';

describe('devtools flush triggers name their store', () => {
    const g = globalThis as any;
    const hook = () => g.__MOTIF_DEVTOOLS__;
    let app: Application;
    let flushes: any[];
    let off: () => void;
    const stops: (() => void)[] = [];

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        flushes = [];
        off = hook().on((ev: any) => { if (ev.type === 'reactivity:flush') flushes.push(ev.payload); });
    });

    afterEach(() => {
        for (const stop of stops.splice(0)) stop();
        off();
        app.useDevelopment(false);
        app.dispose();
        delete g.__MOTIF_DEV__;
    });

    const watch = (fn: () => unknown) => { const e: any = effect(fn); stops.push(() => e?.stop?.() ?? e?.()); };
    const settle = () => new Promise(r => setTimeout(r, 0));
    const idOf = (value: unknown) => hook().getStores().find((s: any) => s.value === value).id;
    const triggers = () => flushes.flatMap(f => f.triggers);

    test('a change on the root of a store names the store with an empty path', async () => {
        const store = reactive({ n: 1 });
        watch(() => store.n);
        store.n = 2;
        await settle();
        expect(triggers()).toEqual([expect.objectContaining({ key: 'n', store: { id: idOf(store), path: [] } })]);
    });

    test('a nested change names the path inside the store', async () => {
        const store = reactive({ user: { name: 'ada' } });
        watch(() => store.user.name);
        store.user.name = 'grace';
        await settle();
        expect(triggers()).toEqual([expect.objectContaining({ key: 'name', store: { id: idOf(store), path: ['user'] } })]);
    });

    test('changes in an array and a Map inside a store name their paths', async () => {
        const store = reactive({ items: [1, 2], tags: new Map<string, number>() });
        watch(() => store.items.length);
        watch(() => store.tags.get('x'));
        store.items.push(3);
        store.tags.set('x', 1);
        await settle();
        const paths = triggers().map((t: any) => t.store);
        expect(paths).toContainEqual({ id: idOf(store), path: ['items'] });
        expect(paths).toContainEqual({ id: idOf(store), path: ['tags'] });
    });

    test('a signal change names the signal with the key value', async () => {
        const theme = createSignal('light');
        watch(() => theme.value);
        theme.value = 'dark';
        await settle();
        const id = hook().getStores().find((s: any) => s.type === 'signal' && s.value === 'dark').id;
        expect(triggers()).toEqual([expect.objectContaining({ key: 'value', store: { id, path: [] } })]);
    });

    test('an object moved to another store is reported in its new place', async () => {
        const a = reactive({ slot: { v: 1 } as any });
        const b = reactive({ other: null as any });
        const moved = a.slot;
        watch(() => moved.v);
        moved.v = 2;
        await settle();
        expect(triggers()[0].store).toEqual({ id: idOf(a), path: ['slot'] });
        b.other = moved;
        a.slot = null;
        flushes = [];
        moved.v = 3;
        await settle();
        expect(triggers().find((t: any) => t.key === 'v').store).toEqual({ id: idOf(b), path: ['other'] });
    });

    test('a store kept inside another store is reported as itself', async () => {
        const inner = reactive({ n: 1 });
        const outer = reactive({ inner });
        watch(() => outer.inner.n);
        outer.inner.n = 2;
        await settle();
        expect(triggers()).toEqual([expect.objectContaining({ key: 'n', store: { id: idOf(inner), path: [] } })]);
    });

    test('a reactive object outside the registry has no store', async () => {
        app.useDevelopment(false);
        const loose = reactive({ n: 1 });
        app.useDevelopment(true);
        off();
        off = hook().on((ev: any) => { if (ev.type === 'reactivity:flush') flushes.push(ev.payload); });
        watch(() => loose.n);
        loose.n = 2;
        await settle();
        expect(triggers()).toHaveLength(1);
        expect(triggers()[0].store).toBeUndefined();
    });
});
