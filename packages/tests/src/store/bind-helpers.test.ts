import { toGetter, read } from '@motifx/core';
import type { Bind } from '@motifx/core';

describe('Bind helpers', () => {
    test('toGetter passes getters through and wraps plain values', () => {
        const g = () => 2;
        expect(toGetter(g)).toBe(g);
        expect(toGetter(1)()).toBe(1);
    });

    test('read resolves both forms', () => {
        const live: Bind<string> = () => 'x';
        const plain: Bind<string> = 'y';
        expect(read(live)).toBe('x');
        expect(read(plain)).toBe('y');
    });
});
