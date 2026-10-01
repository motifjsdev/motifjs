import { reactive, effect } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

describe('direct index writes on reactive arrays', () => {
    test('appending with arr[arr.length] = x notifies length readers', async () => {
        const state = reactive({ items: ['a'] });
        let seen = 0;
        effect(() => { seen = state.items.length; });
        await nextTick();
        state.items[state.items.length] = 'b';
        await nextTick();
        expect(seen).toBe(2);
    });

    test('appending with an index notifies readers that iterate the array', async () => {
        const state = reactive({ items: ['a', 'b'] });
        let joined = '';
        effect(() => { joined = state.items.join(','); });
        await nextTick();
        state.items[2] = 'c';
        await nextTick();
        expect(joined).toBe('a,b,c');
    });

    test('appending with a gap (sparse) still notifies length readers', async () => {
        const state = reactive({ items: [1] });
        let len = 0;
        effect(() => { len = state.items.length; });
        await nextTick();
        state.items[3] = 4;
        await nextTick();
        expect(len).toBe(4);
    });

    test('overwriting an existing index notifies its reader', async () => {
        const state = reactive({ items: ['a', 'b'] });
        let first = '';
        effect(() => { first = state.items[0]; });
        await nextTick();
        state.items[0] = 'z';
        await nextTick();
        expect(first).toBe('z');
    });

    test('truncating with length = n notifies readers of the dropped indices', async () => {
        const state = reactive({ items: ['a', 'b', 'c'] });
        let last: string | undefined = '';
        effect(() => { last = state.items[2]; });
        await nextTick();
        state.items.length = 1;
        await nextTick();
        expect(last).toBeUndefined();
    });

    test('index append and push behave the same for a list-like reader', async () => {
        const viaIndex = reactive({ items: [] as number[] });
        const viaPush = reactive({ items: [] as number[] });
        let a = -1; let b = -1;
        effect(() => { a = viaIndex.items.length; });
        effect(() => { b = viaPush.items.length; });
        await nextTick();
        viaIndex.items[viaIndex.items.length] = 1;
        viaPush.items.push(1);
        await nextTick();
        expect(a).toBe(1);
        expect(b).toBe(1);
    });
});
