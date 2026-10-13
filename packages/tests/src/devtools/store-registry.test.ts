import { Application, Virtualization, reactive, useModel, createSignal, createComputed, createLazyComputed } from '@motifx/core';

describe('devtools store registry', () => {
    const g = globalThis as any;
    const hook = () => g.__MOTIF_DEVTOOLS__;
    let app: Application;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        app.useDevelopment(false);
        app.dispose();
        delete g.__MOTIF_DEV__;
        delete g.__MOTIF_STORE_REGISTRY__;
    });

    const created = (before: number[]) => hook().getStores().filter((s: any) => !before.includes(s.id));
    const ids = () => hook().getStores().map((s: any) => s.id);

    test('with devtools on, created stores are listed by getStores', () => {
        app.useDevelopment(true);
        const before = ids();
        class Cart { items: number[] = []; }
        const r = reactive(new Cart());
        reactive({ a: 1 });
        useModel({ a: 1 });
        const s = createSignal(5);
        const c = createComputed(() => s.value * 2);
        c.value;
        createLazyComputed(() => 1);
        const list = created(before);
        expect(list.map((x: any) => x.type)).toEqual(['reactive', 'reactive', 'reactive', 'signal', 'computed', 'computed']);
        expect(list.map((x: any) => x.name)).toEqual(['Cart', 'reactive', 'useModel', 'signal', 'computed', 'lazyComputed']);
        expect(list[0].value).toBe(r);
        expect(list[3].value).toBe(5);
        expect(list[4].value).toBe(10);
        expect(list[4].stale).toBeUndefined();
        expect(list[5].value).toBeUndefined();
        expect(list[5].stale).toBe(true);
    });

    test('every store has its own id that does not change', () => {
        app.useDevelopment(true);
        const before = ids();
        reactive({ a: 1 });
        createSignal(1);
        const first = created(before).map((x: any) => x.id);
        expect(new Set(first).size).toBe(2);
        for (let i = 0; i < 10; i++) reactive({ i });
        expect(created(before).slice(0, 2).map((x: any) => x.id)).toEqual(first);
    });

    test('a signal is listed with its current value', () => {
        app.useDevelopment(true);
        const before = ids();
        const s = createSignal('light');
        s.value = 'dark';
        expect(created(before)[0].value).toBe('dark');
    });

    test('a computed is read without running its getter', () => {
        app.useDevelopment(true);
        const before = ids();
        let runs = 0;
        createComputed(() => ++runs);
        let lazyRuns = 0;
        createLazyComputed(() => ++lazyRuns);
        const ranAtCreation = runs;
        const [computed, lazy] = created(before);
        expect(computed.value).toBe(ranAtCreation);
        expect(lazy.stale).toBe(true);
        hook().getStores();
        expect(runs).toBe(ranAtCreation);
        expect(lazyRuns).toBe(0);
    });

    test('no __MOTIF_STORE_REGISTRY__ global is created', () => {
        app.useDevelopment(true);
        reactive({ a: 1 });
        expect(g.__MOTIF_STORE_REGISTRY__).toBeUndefined();
    });

    test('with devtools off and no __MOTIF_DEV__ flag nothing is recorded', () => {
        app.useDevelopment(true);
        const before = hook().getStores().length;
        app.useDevelopment(false);
        const kept = [reactive({ a: 1 }), createSignal(1)];
        app.useDevelopment(true);
        expect(hook().getStores().length).toBe(before);
        expect(kept).toHaveLength(2);
    });

    test('with __MOTIF_DEV__ set before the core loads, stores are recorded before devtools is enabled', () => {
        g.__MOTIF_DEV__ = true;
        jest.isolateModules(() => {
            const core = require('@motifx/core');
            const early = core.reactive({ early: true });
            const flag = core.createSignal('on');
            const isolated = core.Application.CreateBuilder().build();
            isolated.useDevelopment(true);
            const values = g.__MOTIF_DEVTOOLS__.getStores().map((s: any) => s.value);
            expect(values).toContain(early);
            expect(values).toContain('on');
            expect(flag.peek()).toBe('on');
            isolated.useDevelopment(false);
            isolated.dispose();
        });
    });

    test('the first stores stay listed after many others are created', () => {
        app.useDevelopment(true);
        const keep = reactive({ keep: true });
        const kept = createSignal('kept');
        const others = [];
        for (let i = 0; i < 300; i++) others.push(reactive({ i }));
        const values = hook().getStores().map((s: any) => s.value);
        expect(values).toContain(keep);
        expect(values).toContain('kept');
        expect(values).toContain(others[299]);
        expect(kept.peek()).toBe('kept');
    });

    test('a store that was garbage collected leaves the list', () => {
        const Real = g.WeakRef;
        const refs: { target: object | undefined }[] = [];
        g.WeakRef = class {
            target: object | undefined;
            constructor(target: object) { this.target = target; refs.push(this); }
            deref() { return this.target; }
        };
        try {
            app.useDevelopment(true);
            const before = ids();
            reactive({ gone: true });
            const stay = reactive({ stay: true });
            refs[refs.length - 2].target = undefined;
            expect(created(before).map((x: any) => x.value)).toEqual([stay]);
        } finally {
            g.WeakRef = Real;
        }
    });

    test('the state of the Virtualization component is not listed', () => {
        app.useDevelopment(true);
        const before = hook().getStores().length;
        const virt = new Virtualization<any>({ itemHeight: 20, pageSize: 2, autoRefresh: false, dataRequest: async () => ({ items: [], totalCount: 0, hasMore: false }) } as any);
        expect(hook().getStores().length).toBe(before);
        virt.dispose();
    });
});
