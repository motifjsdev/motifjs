import { Scanner } from '@motifx/core/internal';

const scan = (pattern: string, uri: string) => {
    const s = new (Scanner as any)(pattern);
    const ok = s.exist(uri);
    return { ok, params: s.parameters };
};

describe('Scanner ignores the #fragment', () => {
    test('a path parameter does not include the fragment', () => {
        expect(scan('/ara/{q}', '/ara/abc#frag')).toEqual({ ok: true, params: { q: 'abc' } });
    });

    test('a query value does not include the fragment', () => {
        expect(scan('/ara/{q}', '/ara/abc?x=1#h')).toEqual({ ok: true, params: { x: '1', q: 'abc' } });
    });

    test('a static route matches with a fragment', () => {
        expect(scan('/users', '/users#top')).toEqual({ ok: true, params: {} });
    });

    test('a fragment that looks like a query is not parsed as one', () => {
        expect(scan('/users', '/users#a?b=1')).toEqual({ ok: true, params: {} });
    });

    test('query parameters keep their existing behaviour', () => {
        expect(scan('/users/{id}', '/users/5?tab=a&n=2')).toEqual({ ok: true, params: { tab: 'a', n: '2', id: '5' } });
    });
});

