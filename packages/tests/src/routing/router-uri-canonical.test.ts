/**
 * @jest-environment jsdom
 */
import { Application, Component, ComponentBase, RouterLink, motifComponent } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

function makeApp() {
    const links: Record<string, ComponentBase> = {};
    const app = Application.CreateBuilder().build();
    app.useRouter({
        mode: 'history',
        routes: [
            { path: '/', control: () => new Component('div') },
            { path: '/tags/{name}', name: 'tag', control: () => new Component('div') },
            { path: '/tags/{name}/edit', name: 'tag-edit', control: () => new Component('div') },
        ],
    } as any);
    const nav = motifComponent('nav', (n: ComponentBase) => {
        for (const [k, to] of [['raw', '/tags/çay'], ['enc', '/tags/%C3%A7ay'], ['href', app.router.href('tag', { name: 'çay' })]] as const) {
            links[k] = motifComponent(RouterLink, { to, activeClass: 'act', exactClass: 'ex', childs: [motifComponent('text', (t: any) => t.setText(k))] } as any);
            n.controls.add(links[k]);
        }
    });
    app.run(document.body.appendChild(document.createElement('div')), nav);
    const has = (k: string, cls: string) => (links[k].element as HTMLElement).classList.contains(cls);
    return { app, has };
}

describe('router.uri is the address form and links match it in either spelling', () => {
    let app: Application;
    let has: (k: string, cls: string) => boolean;
    beforeEach(async () => { ({ app, has } = makeApp()); await tick(); });
    afterEach(async () => { await app.dispose(); document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); });

    test('a raw navigate yields the same router.uri as the encoded one', async () => {
        await app.navigate('/tags/çay');
        expect(app.router.uri).toBe('/tags/%C3%A7ay');
        expect(window.location.pathname).toBe('/tags/%C3%A7ay');
        expect(app.router.params.name).toBe('çay');
    });

    test('raw, encoded and href links are all exact after a raw navigate', async () => {
        await app.navigate('/tags/çay');
        await tick();
        expect([has('raw', 'ex'), has('enc', 'ex'), has('href', 'ex')]).toEqual([true, true, true]);
    });

    test('raw, encoded and href links are all exact after navigateByName and after a restart at the address', async () => {
        await app.navigateByName('tag', { name: 'çay' });
        await tick();
        expect([has('raw', 'ex'), has('enc', 'ex'), has('href', 'ex')]).toEqual([true, true, true]);
        await app.navigate('/');
        await tick();
        expect([has('raw', 'ex'), has('enc', 'ex')]).toEqual([false, false]);
        app.restartRouter('/tags/%C3%A7ay');
        await tick(40);
        expect([has('raw', 'ex'), has('enc', 'ex'), has('href', 'ex')]).toEqual([true, true, true]);
    });

    test('active (prefix) matching works across spellings too', async () => {
        await app.navigate('/tags/%C3%A7ay/edit');
        await tick();
        expect([has('raw', 'act'), has('enc', 'act'), has('raw', 'ex')]).toEqual([true, true, false]);
    });

    test('navigating to the same page in the other spelling is a skipped navigation', async () => {
        await app.navigate('/tags/çay');
        const r = await app.navigate('/tags/%C3%A7ay');
        expect(r.skipped).toBe(true);
    });

    test('the query is kept in the address form and decoded in params', async () => {
        await app.navigate('/tags/x?q=çay');
        expect(app.router.uri).toBe('/tags/x?q=%C3%A7ay');
        expect(app.router.params.q).toBe('çay');
    });
});
