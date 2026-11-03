import { reactive, effect, createLazyComputed } from '@motifx/core';
import { debugGetDeps } from '@motifx/core/devtools';

const flush = () => new Promise((r) => setTimeout(r, 0));

const subscribers = (target: object, key: string) => debugGetDeps(target)?.get(key)?.size ?? 0;

describe('keys left unread after a run are released around nested runs', () => {
    test('an effect that reads every key again and a new one keeps them all', async () => {
        const state = reactive({ more: false, a: 0, b: 0, c: 0 });
        let runs = 0;
        effect(() => { runs++; state.more; state.a; state.b; if (state.more) state.c; });
        await flush();
        state.more = true;
        await flush();
        expect(['more', 'a', 'b', 'c'].map((k) => subscribers(state, k))).toEqual([1, 1, 1, 1]);
        state.a++;
        await flush();
        state.c++;
        await flush();
        expect(runs).toBe(4);
    });

    test('a computed refreshed inside an effect does not hide the key the effect stopped reading', async () => {
        const state = reactive({ flag: true, a: 0, b: 0, c: 0, d: 0 });
        const sum = createLazyComputed(() => state.c + state.d);
        let runs = 0;
        effect(() => { runs++; if (state.flag) state.a; else state.b; sum.value; });
        await flush();
        state.c++;
        state.flag = false;
        await flush();
        expect(subscribers(state, 'a')).toBe(0);
        expect(subscribers(state, 'b')).toBe(1);
        const before = runs;
        state.a++;
        await flush();
        expect(runs).toBe(before);
    });

    test('an effect created inside a run does not hide the key the outer effect stopped reading', async () => {
        const state = reactive({ flag: true, a: 0, b: 0, c: 0 });
        let stopInner: (() => void) | undefined;
        effect(() => {
            if (state.flag) state.a; else state.b;
            stopInner?.();
            stopInner = effect(() => { state.c; });
        });
        await flush();
        state.flag = false;
        await flush();
        expect(subscribers(state, 'a')).toBe(0);
        expect(subscribers(state, 'b')).toBe(1);
        expect(subscribers(state, 'c')).toBe(1);
    });

    test('a computed refreshed inside an effect releases the key it stopped reading', async () => {
        const state = reactive({ p: true, x: 0, y: 0, z: 0 });
        const pick = createLazyComputed(() => (state.p ? state.x : state.y));
        effect(() => { state.z; pick.value; });
        await flush();
        state.p = false;
        await flush();
        expect(subscribers(state, 'x')).toBe(0);
        expect(subscribers(state, 'y')).toBe(1);
        expect(subscribers(state, 'z')).toBe(1);
    });
});
