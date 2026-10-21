/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Page extends Component {
    constructor(public tag: string) {
        super('section');
        (this.element as HTMLElement).id = 'page-' + tag;
    }
}
const page = (tag: string) => () => new Page(tag);
const shown = () => Array.from(document.querySelectorAll('section[id^="page-"]')).map(e => e.id.slice(5));

function makeApp() {
    const host = document.body.appendChild(document.createElement('div'));
    const app = Application.CreateBuilder().build();
    app.useRouter({
        routes: [
            { path: '/', control: page('home') },
            { path: '/f/{rest+}', name: 'rest', control: page('rest') },
            { path: '/f/{a}/{b}', name: 'pair', control: page('pair') },
            { path: '/{a}/{b}', name: 'any-pair', control: page('any-pair') },
            { path: '/docs/{rest+}', name: 'docs', control: page('docs') },
            { path: '/files/{path*}', name: 'files', control: page('files') },
            { path: '/u/{id(\\d+)}', name: 'user', control: page('user') },
            { path: '/old/{id(\\d+)}', redirect: '/u/{id}' },
        ],
    } as any);
    app.run(host);
    return app;
}

describe('rest parameters and parameter patterns through the router', () => {
    let app: Application;
    beforeEach(async () => { app = makeApp(); await tick(); });
    afterEach(async () => { await app.dispose(); document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); });

    test('a route with two parameters comes before a rest route at the same depth', async () => {
        await app.navigate('/f/x/y');
        await tick();
        expect(shown()).toEqual(['pair']);
        expect(app.router.params.a).toBe('x');
        expect(app.router.params.b).toBe('y');
    });

    test('the rest route takes what no other route matches, as plain text', async () => {
        await app.navigate('/f/x/y/z');
        await tick();
        expect(shown()).toEqual(['rest']);
        expect(app.router.params.rest).toBe('x/y/z');
    });

    test('a static segment still wins over two bare parameters', async () => {
        await app.navigate('/docs/x');
        await tick();
        expect(shown()).toEqual(['docs']);
        expect(app.router.params.rest).toBe('x');
    });

    test('{path*} matches with no segment and with several', async () => {
        await app.navigate('/files');
        await tick();
        expect(shown()).toEqual(['files']);
        expect(app.router.params.path).toBeUndefined();
        await app.navigate('/files/a/b');
        await tick();
        expect(app.router.params.path).toBe('a/b');
    });

    test('a pattern decides whether the route matches at all', async () => {
        await app.navigate('/u/5');
        await tick();
        expect(shown()).toEqual(['user']);
        expect(app.router.params.id).toBe('5');
        await app.navigate('/u/abc');
        await tick();
        expect(shown()).not.toContain('user');
    });

    test('href writes rest values segment by segment, from text or from an array', () => {
        expect(app.router.href('rest', { rest: 'a b/c' })).toBe('/f/a%20b/c');
        expect(app.router.href('rest', { rest: ['a', 'b'] })).toBe('/f/a/b');
        expect(app.router.href('files', {})).toBe('/files');
        expect(app.router.href('user', { id: 5 })).toBe('/u/5');
    });

    test('a redirect string fills a parameter that carries a pattern', async () => {
        await app.navigate('/old/7');
        await tick();
        expect(shown()).toEqual(['user']);
        expect(app.router.params.id).toBe('7');
        expect(window.location.pathname).toBe('/u/7');
    });
});

describe('route linter: parameter patterns', () => {
    let warn: jest.SpyInstance;
    let app: Application;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        app = Application.CreateBuilder().build();
        app.useDevelopment();
    });

    afterEach(() => {
        warn.mockRestore();
        app.useDevelopment(false);
        try { app.dispose(); } catch { }
    });

    const codes = () => warn.mock.calls.map(c => String(c[0])).filter(s => s.includes('MJX320'));

    test('a pattern that does not compile warns MJX320', () => {
        app.useRouter({ routes: [{ path: '/u/{id(*)}', control: () => new Component('div') }] });
        expect(codes().length).toBe(1);
    });

    test("an unclosed '(' warns MJX320", () => {
        app.useRouter({ routes: [{ path: '/u/{id(\\d+}', control: () => new Component('div') }] });
        expect(codes().length).toBe(1);
        expect(codes()[0]).toContain('never closed');
    });

    test("a '/' inside a pattern warns MJX320, on an alias too", () => {
        app.useRouter({ routes: [{ path: '/u/{id}', control: () => new Component('div'), alias: '/users/{id(a/b)}' }] });
        expect(codes().length).toBe(1);
        expect(codes()[0]).toContain("'/'");
    });

    test('a valid pattern on a path and on an alias is silent', () => {
        app.useRouter({ routes: [{ path: '/u/{id(\\d+)}', control: () => new Component('div'), alias: '/users/{id(\\d{1,3})}' }] });
        expect(codes()).toEqual([]);
    });
});
