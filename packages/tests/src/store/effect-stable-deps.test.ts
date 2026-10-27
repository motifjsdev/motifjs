import { reactive, effect } from '@motifx/core';
import { debugGetDeps } from '@motifx/core/devtools';

const flush = () => new Promise((r) => setTimeout(r, 0));

const subscribers = (target: object, key: string) => debugGetDeps(target)?.get(key)?.size ?? 0;

describe('dependencies across effect runs', () => {
    test('a dependency the effect stops reading is released after the run', async () => {
        const state = reactive({ flag: true, a: 1, b: 2 });
        let seen = 0;
        effect(() => { seen = state.flag ? state.a : state.b; });
        await flush();
        expect(seen).toBe(1);
        expect(subscribers(state, 'a')).toBe(1);
        expect(subscribers(state, 'b')).toBe(0);
        state.flag = false;
        await flush();
        expect(seen).toBe(2);
        expect(subscribers(state, 'a')).toBe(0);
        expect(subscribers(state, 'b')).toBe(1);
        state.a = 10;
        await flush();
        expect(seen).toBe(2);
    });

    test('rerunning keeps one subscription per key and leaves nothing behind', async () => {
        const state = reactive({ x: 0, y: 0 });
        let runs = 0;
        const stop = effect(() => { runs++; state.x; state.y; });
        await flush();
        for (let i = 0; i < 5; i++) {
            state.x++;
            await flush();
        }
        expect(runs).toBe(6);
        expect(subscribers(state, 'x')).toBe(1);
        expect(subscribers(state, 'y')).toBe(1);
        stop();
        expect(debugGetDeps(state)).toBeUndefined();
    });

    test('effects keep their first subscription order even when only one of them reran', async () => {
        const state = reactive({ x: 0, y: 0 });
        const order: string[] = [];
        effect(() => { order.push('first'); state.x; state.y; });
        effect(() => { order.push('second'); state.x; });
        await flush();
        order.length = 0;
        state.y++;
        await flush();
        expect(order).toEqual(['first']);
        order.length = 0;
        state.x++;
        await flush();
        expect(order).toEqual(['first', 'second']);
    });

    test('a dependency tracked after an await is dropped by the next run that does not read it', async () => {
        const state = reactive({ flag: true, late: 0, early: 0 });
        let runs = 0;
        effect(() => { runs++; state.early; state.flag; });
        await flush();
        expect(subscribers(state, 'early')).toBe(1);
        state.flag = false;
        await flush();
        expect(runs).toBe(2);
        expect(subscribers(state, 'early')).toBe(1);
        expect(subscribers(state, 'late')).toBe(0);
    });
});
