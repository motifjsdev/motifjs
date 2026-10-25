/**
 * @jest-environment-options {"url": "file:///C:/app/index.html"}
 */
import { Application, Component, ComponentBase, errorHandler } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

const page = (cls: string) => () => new Component('div', { onConfig: (s: ComponentBase) => { (s.element as HTMLElement).className = cls; } } as any);

describe('history mode on a file: address', () => {
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        await app.dispose();
        host.remove();
        errorHandler.setDevelopmentMode(false);
    });

    test('an explicit history mode works as hash mode', async () => {
        app.useRouter({ mode: 'history', routes: [{ path: '/', control: page('home') }, { path: '/notes', control: page('notes') }] });
        app.run(host);
        await tick();
        expect(app.router.ok).toBe(true);
        expect(app.router.uri).toBe('/');
        expect(host.querySelector('.home')).not.toBeNull();

        await app.navigate('/notes');
        await tick();
        expect(location.hash).toBe('#/notes');
        expect(location.pathname).toBe('/C:/app/index.html');
        expect(host.querySelector('.notes')).not.toBeNull();
    });

    test('development mode warns MJX321 once', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        try {
            app.useDevelopment(true);
            app.useRouter({ mode: 'history', routes: [{ path: '/', control: page('home') }] });
            app.run(host);
            await tick();
            const codes = warn.mock.calls.map(c => String(c[0])).filter(t => t.includes('MJX321'));
            expect(codes.length).toBe(1);
        } finally {
            warn.mockRestore();
        }
    });
});
