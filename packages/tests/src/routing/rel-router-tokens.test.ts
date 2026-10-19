import { Application, Component, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

describe('rel="router" link interception matches the token, not the whole attribute', () => {
    let app: Application;
    let host: HTMLElement;

    const routes: RouteItem[] = [
        { path: '/a', control: () => new Component('div') },
        { path: '/b', control: () => new Component('div') },
    ];

    beforeEach(async () => {
        window.history.replaceState({}, '', '/a');
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes, mode: 'history' });
        app.run(host);
        await tick();
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host?.remove();
        window.history.replaceState({}, '', '/');
    });

    async function click(rel: string): Promise<boolean> {
        const a = document.createElement('a');
        a.setAttribute('rel', rel);
        a.setAttribute('href', '/b');
        host.appendChild(a);
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        a.dispatchEvent(ev);
        await tick();
        a.remove();
        return ev.defaultPrevented;
    }

    test.each([
        ['router'],
        ['router nofollow'],
        ['nofollow router'],
        ['noopener  Router  noreferrer'],
    ])('rel="%s" is intercepted and navigates', async (rel) => {
        expect(await click(rel)).toBe(true);
        expect(app.router.uri).toBe('/b');
        expect(window.location.pathname).toBe('/b');
    });

    test.each([
        ['nofollow'],
        ['routers'],
        ['router-link'],
    ])('rel="%s" is left to the browser', async (rel) => {
        expect(await click(rel)).toBe(false);
        expect(app.router.uri).toBe('/a');
    });
});
