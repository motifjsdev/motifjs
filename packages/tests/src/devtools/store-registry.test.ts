import { Application, reactive, useModel, createSignal, createComputed, createLazyComputed } from '@motifx/core';

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

    test('with devtools on, created stores are listed by getStores', () => {
        app.useDevelopment(true);
        const before = hook().getStores().length;
        class Cart { items: number[] = []; }
        const r = reactive(new Cart());
        useModel({ a: 1 });
        const s = createSignal(5);
        createComputed(() => s.value * 2);
        createLazyComputed(() => 1);
        const list = hook().getStores().slice(before);
        expect(list.map((x: any) => x.type)).toEqual(['reactive', 'reactive', 'signal', 'computed', 'computed']);
        expect(list[0].name).toBe('Cart');
        expect(list[0].value).toBe(r);
        expect(list[1].name).toBe('Object');
        expect(list[2].name).toMatch(/^signal_\d+$/);
        expect(list[2].value).toBe(5);
        expect(list[3].name).toMatch(/^computed_\d+$/);
        expect(list[3].value).toBe(10);
        expect(list[4].name).toMatch(/^lazyComputed_\d+$/);
        expect(list[4].value).toBeUndefined();
    });

    test('no __MOTIF_STORE_REGISTRY__ global is created', () => {
        app.useDevelopment(true);
        reactive({ a: 1 });
        expect(g.__MOTIF_STORE_REGISTRY__).toBeUndefined();
    });

    test('with devtools off nothing is recorded, even when __MOTIF_DEV__ is set by hand', () => {
        app.useDevelopment(true);
        const before = hook().getStores().length;
        app.useDevelopment(false);
        g.__MOTIF_DEV__ = true;
        reactive({ a: 1 });
        createSignal(1);
        app.useDevelopment(true);
        expect(hook().getStores().length).toBe(before);
    });

    test('the list keeps the last 200 stores', () => {
        app.useDevelopment(true);
        for (let i = 0; i < 250; i++) reactive({ i });
        const list = hook().getStores();
        expect(list.length).toBe(200);
        expect(list[199].value.i).toBe(249);
    });
});
