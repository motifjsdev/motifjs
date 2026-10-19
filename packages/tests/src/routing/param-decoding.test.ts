/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

function makeApp(mode: 'history' | 'hash') {
    const host = document.body.appendChild(document.createElement('div'));
    const app = Application.CreateBuilder().build();
    app.useRouter({
        mode,
        routes: [
            { path: '/', control: () => new Component('div') },
            { path: '/tags/{name}', name: 'tag', control: () => new Component('div') },
            { path: '/settings/{tab?:general}', name: 'settings', control: () => new Component('div') },
            { path: '/find/{q}', redirect: (to: any) => '/tags/' + encodeURIComponent(to.params.q) },
            { path: '/old/{name}', redirect: '/tags/{name}' },
        ],
    } as any);
    app.run(host);
    return app;
}

describe('path parameters are decoded like query values', () => {
    let app: Application;
    beforeEach(async () => { app = makeApp('history'); await tick(); });
    afterEach(async () => { await app.dispose(); document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); });

    test('a percent-encoded segment arrives decoded; the address keeps the encoded form', async () => {
        const r = await app.navigate('/tags/%C3%A7ay');
        expect(r.ok).toBe(true);
        expect(app.router.params.name).toBe('çay');
        expect(window.location.pathname).toBe('/tags/%C3%A7ay');
    });

    test('a raw segment with non-ascii letters matches the same route', async () => {
        const r = await app.navigate('/tags/çay');
        expect(r.ok).toBe(true);
        expect(app.router.params.name).toBe('çay');
        expect(window.location.pathname).toBe('/tags/%C3%A7ay');
    });

    test('space and encoded slash inside one segment', async () => {
        await app.navigate('/tags/a%20b');
        expect(app.router.params.name).toBe('a b');
        await app.navigate('/tags/a%2Fb');
        expect(app.router.params.name).toBe('a/b');
    });

    test('a malformed escape is kept as written instead of throwing', async () => {
        const r = await app.navigate('/tags/100%');
        expect(r.ok).toBe(true);
        expect(app.router.params.name).toBe('100%');
    });

    test('href, navigateByName and a redirect string encode the values they write', async () => {
        expect(app.router.href('tag', { name: 'çay' })).toBe('/tags/%C3%A7ay');
        expect(app.router.href('tag', { name: 'a/b' })).toBe('/tags/a%2Fb');
        const r = await app.navigateByName('tag', { name: 'çay' });
        expect(r.ok).toBe(true);
        expect(app.router.params.name).toBe('çay');
        expect(window.location.pathname).toBe('/tags/%C3%A7ay');
        await app.navigate('/old/%C3%A7ay');
        await tick();
        expect(app.router.uri).toBe('/tags/%C3%A7ay');
        expect(app.router.params.name).toBe('çay');
    });

    test('a redirect function sees the decoded value and encodes once', async () => {
        await app.navigate('/find/%C3%A7ay');
        await tick();
        expect(app.router.uri).toBe('/tags/%C3%A7ay');
        expect(app.router.params.name).toBe('çay');
    });

    test('resolve() decodes too and matches a raw segment', () => {
        expect(app.router.resolve('/tags/%C3%A7ay').result.params.name).toBe('çay');
        expect(app.router.resolve('/tags/çay').result.params.name).toBe('çay');
    });

    test('optional parameter with a default is unaffected and is decoded when present', async () => {
        await app.navigate('/settings');
        expect(app.router.params.tab).toBe('general');
        await app.navigate('/settings/g%C3%BCvenlik');
        expect(app.router.params.tab).toBe('güvenlik');
    });

    test('query values stay decoded as before', async () => {
        await app.navigate('/tags/x?q=%C3%A7ay&t=a+b');
        expect(app.router.params.q).toBe('çay');
        expect(app.router.params.t).toBe('a b');
        expect(app.router.params.name).toBe('x');
    });
});

describe('path parameters in hash mode', () => {
    afterEach(() => { document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); });

    test('raw and encoded segments both match and the hash is written encoded', async () => {
        const app = makeApp('hash');
        await tick();
        await app.navigate('/tags/çay');
        await tick();
        expect(app.router.params.name).toBe('çay');
        expect(window.location.hash).toBe('#/tags/%C3%A7ay');
        await app.navigate('/tags/%C3%B6z');
        await tick();
        expect(app.router.params.name).toBe('öz');
        await app.dispose();
    });
});
