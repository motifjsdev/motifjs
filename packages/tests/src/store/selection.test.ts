/**
 * @jest-environment jsdom
 */
import { Component, createSelection, effect, errorHandler, reactive } from '@motifx/core';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createSelection', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a change of the source wakes only the effects of the previous and the new key', async () => {
        const state = reactive({ selected: 1 });
        const isSelected = createSelection(() => state.selected);
        const runs = [0, 0, 0, 0, 0];
        const seen = [false, false, false, false, false];
        const stops = runs.map((_, id) => effect(() => { runs[id]++; seen[id] = isSelected(id); }));
        expect(seen).toEqual([false, true, false, false, false]);
        runs.fill(0);
        state.selected = 3;
        await flush();
        expect(runs).toEqual([0, 1, 0, 1, 0]);
        expect(seen).toEqual([false, false, false, true, false]);
        runs.fill(0);
        state.selected = 3;
        await flush();
        expect(runs).toEqual([0, 0, 0, 0, 0]);
        stops.forEach((stop) => stop());
        isSelected.dispose();
    });

    test('outside an effect it compares without subscribing', () => {
        const state = reactive({ selected: 'b' });
        const isSelected = createSelection(() => state.selected);
        expect(isSelected('a')).toBe(false);
        expect(isSelected('b')).toBe(true);
        isSelected.dispose();
    });

    test('object keys are compared by identity', async () => {
        const items = [{ id: 1 }, { id: 2 }];
        const state = reactive({ current: null as object | null });
        const isSelected = createSelection(() => state.current);
        const seen: boolean[] = [];
        const stops = items.map((item, i) => effect(() => { seen[i] = isSelected(item); }));
        state.current = items[1];
        await flush();
        expect(seen).toEqual([false, true]);
        state.current = { id: 2 };
        await flush();
        expect(seen).toEqual([false, false]);
        stops.forEach((stop) => stop());
        isSelected.dispose();
    });

    test('rows read from reactive state match the selected row whether it was set raw or reactive', async () => {
        const state = reactive({ rows: [{ id: 1 }, { id: 2 }, { id: 3 }], current: null as object | null });
        const isSelected = createSelection(() => state.current);
        const rows = state.rows;
        const seen: boolean[] = [];
        const stops = [0, 1, 2].map((i) => effect(() => { seen[i] = isSelected(rows[i]); }));
        state.current = state.rows[2];
        await flush();
        expect(seen).toEqual([false, false, true]);
        state.current = (state as any).rows[0];
        await flush();
        expect(seen).toEqual([true, false, false]);
        stops.forEach((stop) => stop());
        isSelected.dispose();
    });

    test('a source that throws on its first run still wakes the subscriber once it yields a value', async () => {
        const reported: string[] = [];
        const unbind = errorHandler.addListener((e: any) => { reported.push(e.code); });
        const log = jest.spyOn(console, 'error').mockImplementation(() => { });
        try {
            const state = reactive({ ready: false, selected: 0 });
            const isSelected = createSelection(() => { if (!state.ready) throw new Error('not ready'); return state.selected; });
            let seen = false;
            const stop = effect(() => { seen = isSelected(3); });
            expect(seen).toBe(false);
            state.ready = true;
            state.selected = 3;
            await flush();
            expect(seen).toBe(true);
            expect(reported).toEqual(['MJX208']);
            stop();
            isSelected.dispose();
        } finally {
            unbind();
            log.mockRestore();
        }
    });

    test('dispose can be called twice', () => {
        const state = reactive({ selected: 0 });
        const isSelected = createSelection(() => state.selected);
        isSelected.dispose();
        expect(() => isSelected.dispose()).not.toThrow();
    });

    test('after dispose the source is no longer followed', async () => {
        const state = reactive({ selected: 0 });
        const isSelected = createSelection(() => state.selected);
        let runs = 0;
        const stop = effect(() => { runs++; isSelected(1); });
        isSelected.dispose();
        state.selected = 1;
        await flush();
        expect(runs).toBe(1);
        expect(isSelected(1)).toBe(false);
        stop();
    });

    test('a keyed class follows the selection on the rows that change', async () => {
        const host = document.body.appendChild(document.createElement('table'));
        const root = new Component(host as any);
        root.build();
        const state = reactive({ selected: 0 });
        const isSelected = createSelection(() => state.selected);
        const rows = [1, 2, 3].map((id) => {
            const row = new Component('tr');
            row.class.add([{ danger: () => isSelected(id) }] as any);
            return row;
        });
        root.controls.add(...rows);
        const dangers = () => rows.map((row) => (row.element as unknown as HTMLElement).classList.contains('danger'));
        expect(dangers()).toEqual([false, false, false]);
        state.selected = 2;
        await flush();
        expect(dangers()).toEqual([false, true, false]);
        state.selected = 3;
        await flush();
        expect(dangers()).toEqual([false, false, true]);
        await rows[2].dispose();
        state.selected = 1;
        await flush();
        expect(rows.slice(0, 2).map((row) => (row.element as unknown as HTMLElement).classList.contains('danger'))).toEqual([true, false]);
        isSelected.dispose();
        root.dispose();
    });

    test('a released row is not woken by a later selection', async () => {
        const state = reactive({ selected: 0 });
        const isSelected = createSelection(() => state.selected);
        let runs = 0;
        const stop = effect(() => { runs++; isSelected(5); });
        stop();
        state.selected = 5;
        await flush();
        state.selected = 0;
        await flush();
        expect(runs).toBe(1);
        isSelected.dispose();
    });
});
