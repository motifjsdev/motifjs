import { effect, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

async function watch<T>(read: () => T) {
    const seen: T[] = [];
    effect(() => { seen.push(read()); });
    await tick();
    return seen;
}

describe('data keys that look like internal reactive flags', () => {
    it('writes to an object carrying [__isReadonly__]', async () => {
        const s: any = reactive({ '[__isReadonly__]': true, a: 1 });
        const seen = await watch(() => s.a);
        s.a = 2;
        await tick();
        expect(s.a).toBe(2);
        expect(seen).toEqual([1, 2]);
    });

    it('writes to a nested object carrying [__isReadonly__]', async () => {
        const s: any = reactive({ user: { '[__isReadonly__]': 1, name: 'a' } });
        const seen = await watch(() => s.user.name);
        s.user.name = 'b';
        await tick();
        expect(seen).toEqual(['a', 'b']);
    });

    it.each([['a string', 'x'], ['an object', {}], ['a number', 7]])('tracks an object whose [__raw__] is %s', async (_label, raw) => {
        const s: any = reactive({ '[__raw__]': raw, a: 1 });
        const seen = await watch(() => s.a);
        s.a = 2;
        await tick();
        expect(seen).toEqual([1, 2]);
    });

    it('reads flag-like data keys as plain data', () => {
        const s: any = reactive({ '[__isReactive__]': 'data', '[__get_setup__]': 'v', '[__raw__]': 'r', '[__isReadonly__]': 0 });
        expect(s['[__isReactive__]']).toBe('data');
        expect(s['[__get_setup__]']).toBe('v');
        expect(s['[__raw__]']).toBe('r');
        expect(s['[__isReadonly__]']).toBe(0);
        expect(Object.keys(s)).toEqual(['[__isReactive__]', '[__get_setup__]', '[__raw__]', '[__isReadonly__]']);
    });

    it('keeps list items with a [__raw__] key reactive', async () => {
        const s: any = reactive({ items: [{ id: 1, '[__raw__]': 'r' }, { id: 2 }] });
        const seen = await watch(() => s.items.map((it: any) => it.id).join(','));
        s.items[0].id = 10;
        await tick();
        s.items.push({ id: 3 });
        await tick();
        expect(seen).toEqual(['1,2', '10,2', '10,2,3']);
    });
});
