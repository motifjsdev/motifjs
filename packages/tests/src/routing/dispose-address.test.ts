/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
const routes = () => [{ path: '/', control: () => new Component('div') }, { path: '/notes', control: () => new Component('div') }];

function setAddress(url: string) {
    window.history.replaceState({}, '', url);
}

async function runApp(mode: 'history' | 'hash' | 'shell' | 'none') {
    const host = document.body.appendChild(document.createElement('div'));
    const app = Application.CreateBuilder().build();
    if (mode !== 'none') app.useRouter({ routes: routes(), mode } as any);
    app.run(host, mode === 'none' ? new Component('div') : undefined);
    await tick();
    if (mode !== 'none') { await app.router.navigate('/notes'); await tick(); }
    return { app, host };
}

describe('app.dispose() and the page address', () => {
    afterEach(() => { document.body.innerHTML = ''; setAddress('/'); });

    test('history mode: the address goes back to / without a new history entry', async () => {
        setAddress('/start?x=1');
        const { app } = await runApp('history');
        expect(window.location.pathname).toBe('/notes');
        const len = window.history.length;
        await app.dispose();
        expect(window.location.pathname + window.location.search + window.location.hash).toBe('/');
        expect(window.history.length).toBe(len);
    });

    test('hash mode: only the hash is cleared, the document path and query stay', async () => {
        setAddress('/app/index.html?x=1#/start');
        const { app } = await runApp('hash');
        expect(window.location.hash).toBe('#/notes');
        const len = window.history.length;
        await app.dispose();
        expect(window.location.pathname).toBe('/app/index.html');
        expect(window.location.search).toBe('?x=1');
        expect(window.location.hash).toBe('');
        expect(window.history.length).toBe(len);
    });

    test('shell mode: the address of the hosting page is not touched', async () => {
        setAddress('/host/page?x=1#sec');
        const { app } = await runApp('shell');
        expect(app.router.uri).toBe('/notes');
        expect(window.location.href).toBe('http://localhost/host/page?x=1#sec');
        await app.dispose();
        expect(window.location.href).toBe('http://localhost/host/page?x=1#sec');
    });

    test('no router: the address is not touched', async () => {
        setAddress('/host/page?x=1');
        const { app } = await runApp('none');
        await app.dispose();
        expect(window.location.href).toBe('http://localhost/host/page?x=1');
    });

    test('a router configured but never run does not touch the address', async () => {
        setAddress('/host/page?x=1');
        const app = Application.CreateBuilder().build();
        app.useRouter({ routes: routes(), mode: 'history' } as any);
        await app.dispose();
        expect(window.location.href).toBe('http://localhost/host/page?x=1');
    });
});
