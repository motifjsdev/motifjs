import { reactive, effect } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

describe('array mutators inside effects do not subscribe the effect', () => {
    test('an effect that pushes into a reactive array is not re-triggered by its own push', async () => {
        const state = reactive({ items: [] as number[], tick: 0 });
        let runs = 0;
        effect(() => {
            void state.tick;
            runs++;
            state.items.push(runs);
        });
        await nextTick();
        expect(runs).toBe(1);
        expect(state.items.length).toBe(1);

        state.tick++;
        await nextTick();
        expect(runs).toBe(2);
        expect(state.items.length).toBe(2);
    });

    test('reads outside a mutator are still tracked', async () => {
        const state = reactive({ items: [1, 2] });
        let seen = 0;
        effect(() => { seen = state.items.length; });
        await nextTick();
        state.items.push(3);
        await nextTick();
        expect(seen).toBe(3);
    });
});
