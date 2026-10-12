import { Application, Component, RouterLink, RouterNavigatedEventArgs } from '@motifx/core';

type Mode = 'history' | 'hash' | 'file' | 'shell';

describe('RouterLink href follows the router address mode', () => {
    let app: Application;

    const navigated = () => new Promise<RouterNavigatedEventArgs | undefined>(resolve => {
        const handler = (e?: RouterNavigatedEventArgs) => {
            app.off('motifjs-router-navigated', handler);
            resolve(e);
        };
        app.onRouterChanged(handler);
    });

    const start = async (mode: Mode) => {
        window.history.replaceState(null, '', '/');
        app = Application.CreateBuilder().build();
        const done = navigated();
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/a', control: () => new Component('div') }], mode });
        app.run(document.createElement('div'));
        await done;
    };

    afterEach(() => {
        try { app.dispose(); } catch { }
        document.body.innerHTML = '';
        window.history.replaceState(null, '', '/');
    });

    const mount = (link: RouterLink) => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        root.controls.add(link);
        return link.element as HTMLAnchorElement;
    };

    const click = (el: HTMLElement, init: MouseEventInit = {}) => {
        const e = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
        el.dispatchEvent(e);
        return e;
    };

    test('history mode writes the path as it is', async () => {
        await start('history');
        expect(mount(new RouterLink({ to: '/a' })).getAttribute('href')).toBe('/a');
    });

    test('shell mode writes the path as it is', async () => {
        await start('shell');
        expect(mount(new RouterLink({ to: '/a' })).getAttribute('href')).toBe('/a');
    });

    test('hash mode writes the path after a hash', async () => {
        await start('hash');
        expect(mount(new RouterLink({ to: '/a' })).getAttribute('href')).toBe('#/a');
    });

    test('file mode writes the path after a hash', async () => {
        await start('file');
        expect(mount(new RouterLink({ to: '/a?x=1' })).getAttribute('href')).toBe('#/a?x=1');
    });

    test('a target that already starts with a hash is kept', async () => {
        await start('hash');
        expect(mount(new RouterLink({ to: '#/a' })).getAttribute('href')).toBe('#/a');
    });

    test('showHref false leaves href out in hash mode', async () => {
        await start('hash');
        expect(mount(new RouterLink({ to: '/a', showHref: false })).hasAttribute('href')).toBe(false);
    });

    test('a link made without an application writes the path as it is', () => {
        const link = new RouterLink({ to: '/a' });
        link.build();
        expect((link.element as HTMLAnchorElement).getAttribute('href')).toBe('/a');
        link.dispose();
    });

    test('in hash mode a plain click still navigates to the path and a modified click is left to the browser', async () => {
        await start('hash');
        const a = mount(new RouterLink({ to: '/a' }));
        const modified = click(a, { ctrlKey: true });
        expect(modified.defaultPrevented).toBe(false);
        expect(a.getAttribute('href')).toBe('#/a');
        const done = navigated();
        const plain = click(a);
        await done;
        expect(plain.defaultPrevented).toBe(true);
        expect(app.router.uri).toBe('/a');
        expect(window.location.hash).toBe('#/a');
    });
});
