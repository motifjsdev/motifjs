import { reactive, effect, configureReactivityLeakMonitor } from '@motifx/core';
import { debugGetDeps, debugGetDepMap } from '@motifx/core/devtools';

const flush = () => new Promise((r) => setTimeout(r, 0));

const subscribers = (target: object, key: string) => debugGetDeps(target)?.get(key)?.size ?? 0;

describe('subscriptions kept as marks between runs', () => {
    test('a key read on every other run is released and taken again on alternate runs', async () => {
        const state = reactive({ tick: 0, a: 1 });
        let runs = 0;
        effect(() => { runs++; state.tick; if (state.tick % 2 === 0) { state.a; state.a; } });
        await flush();
        for (let i = 1; i <= 6; i++) {
            state.tick = i;
            await flush();
            expect(subscribers(state, 'a')).toBe(i % 2 === 0 ? 1 : 0);
            expect(subscribers(state, 'tick')).toBe(1);
        }
        expect(runs).toBe(7);
        state.a = 2;
        await flush();
        expect(runs).toBe(8);
    });

    test('a key shared by two effects goes back to one subscriber in subscription order', async () => {
        const state = reactive({ x: 0 });
        const order: string[] = [];
        const stopA = effect(() => { order.push('a'); state.x; });
        effect(() => { order.push('b'); state.x; });
        await flush();
        expect(subscribers(state, 'x')).toBe(2);
        order.length = 0;
        state.x++;
        await flush();
        expect(order).toEqual(['a', 'b']);
        stopA();
        expect(subscribers(state, 'x')).toBe(1);
        order.length = 0;
        state.x++;
        await flush();
        expect(order).toEqual(['b']);
        effect(() => { order.push('c'); state.x; });
        await flush();
        order.length = 0;
        state.x++;
        await flush();
        expect(order).toEqual(['b', 'c']);
        expect(subscribers(state, 'x')).toBe(2);
    });

    test('after going back to one subscriber the remaining effect still releases a key it stops reading', async () => {
        const state = reactive({ flag: true, x: 0, y: 0 });
        let runs = 0;
        const stopA = effect(() => { state.x; });
        effect(() => { runs++; if (state.flag) state.x; else state.y; });
        await flush();
        state.flag = false;
        await flush();
        state.flag = true;
        await flush();
        expect(runs).toBe(3);
        expect(subscribers(state, 'x')).toBe(2);
        stopA();
        expect(subscribers(state, 'x')).toBe(1);
        state.flag = false;
        await flush();
        expect(subscribers(state, 'x')).toBe(0);
        expect(subscribers(state, 'y')).toBe(1);
        state.x++;
        await flush();
        expect(runs).toBe(4);
    });

    test('an effect that joins a key between the runs of another keeps both subscriptions', async () => {
        const state = reactive({ x: 0, other: 0 });
        let runsA = 0;
        let runsB = 0;
        effect(() => { runsA++; state.x; state.other; });
        state.other++;
        await flush();
        effect(() => { runsB++; state.x; });
        state.other++;
        await flush();
        expect(runsA).toBe(3);
        expect(subscribers(state, 'x')).toBe(2);
        state.x++;
        await flush();
        expect(runsA).toBe(4);
        expect(runsB).toBe(2);
    });

    test('a found lookup keeps its prefix on even and odd runs', async () => {
        const state = reactive({ list: [{ id: 1 }, { id: 2 }, { id: 3 }], tick: 0 });
        let runs = 0;
        effect(() => { runs++; state.tick; state.list.find(x => x.id === 2); });
        await flush();
        for (let i = 1; i <= 3; i++) {
            state.tick = i;
            await flush();
            const before = runs;
            state.list.push({ id: 10 + i });
            await flush();
            expect(runs).toBe(before);
            state.list[0] = { id: 100 + i };
            await flush();
            expect(runs).toBe(before + 1);
        }
    });

    test('leak monitor cleanups are kept until each subscription is released', async () => {
        const state = reactive({ x: 0 });
        configureReactivityLeakMonitor({ enabled: true, threshold: 1, name: 'marks' });
        try {
            const stops = [effect(() => { state.x; }), effect(() => { state.x; }), effect(() => { state.x; })];
            await flush();
            expect(subscribers(state, 'x')).toBe(3);
            stops[0]();
            stops[1]();
            expect(subscribers(state, 'x')).toBe(1);
            state.x++;
            await flush();
            stops[2]();
            expect(debugGetDeps(state)).toBeUndefined();
        } finally {
            configureReactivityLeakMonitor({ enabled: false });
        }
    });

    test('debug views show every key as a map of effects to their run', async () => {
        const state = reactive({ one: 0, two: 0 });
        const stopA = effect(() => { state.one; state.two; });
        const stopB = effect(() => { state.two; });
        await flush();
        const deps = debugGetDeps(state)!;
        expect(deps.get('one')).toBeInstanceOf(Map);
        expect(deps.get('one')!.size).toBe(1);
        expect([...deps.get('one')!.values()]).toEqual([1]);
        expect(deps.get('two')!.size).toBe(2);
        const map = debugGetDepMap();
        expect(map).toBeInstanceOf(WeakMap);
        expect(map.has(state)).toBe(true);
        expect(map.get(state)!.get('two')!.size).toBe(2);
        state.one++;
        await flush();
        expect([...debugGetDeps(state)!.get('one')!.values()]).toEqual([2]);
        stopA();
        stopB();
        expect(map.has(state)).toBe(false);
        expect(map.get(state)).toBeUndefined();
    });
});
