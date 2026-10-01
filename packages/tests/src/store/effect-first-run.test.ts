import { reactive, effect } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

describe('effect first run error isolation', () => {
    test('a throwing first run does not propagate to the caller and the effect stays subscribed', async () => {
        const state = reactive({ n: 0 });
        let runs = 0;
        let stop: (() => void) | undefined;
        expect(() => {
            stop = effect(() => {
                runs++;
                void state.n;
                if (runs === 1) throw new Error('boom');
            });
        }).not.toThrow();
        expect(runs).toBe(1);

        state.n = 1;
        await nextTick();
        expect(runs).toBe(2);
        stop!();
    });
});
