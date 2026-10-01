import { Application, Component, RouterLink, RouterNavigatedEventArgs } from '@motifx/core';

describe('RouterLink props', () => {
    let app: Application;

    const navigated = () => new Promise<RouterNavigatedEventArgs | undefined>(resolve => {
        const handler = (e?: RouterNavigatedEventArgs) => {
            app.off('motifjs-router-navigated', handler);
            resolve(e);
        };
        app.onRouterChanged(handler);
    });

    beforeEach(async () => {
        app = Application.CreateBuilder().build();
        const done = navigated();
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/a', control: () => new Component('div') }], mode: 'shell' });
        app.run(document.createElement('div'));
        await done;
    });

    afterEach(() => {
        try { app.dispose(); } catch { }
        document.body.innerHTML = '';
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

    test('renders an anchor when el is not given', () => {
        const a = mount(new RouterLink({ to: '/a', text: 'Go' }));
        expect(a.tagName).toBe('A');
        expect(a.getAttribute('href')).toBe('/a');
        expect(a.textContent).toBe('Go');
    });

    test('bypass leaves the click to the browser', () => {
        const a = mount(new RouterLink({ to: '/a', bypass: true }));
        const e = click(a);
        expect(e.defaultPrevented).toBe(false);
        expect(app.router.uri).toBe('/');
    });

    test('text fills an empty link', () => {
        const a = mount(new RouterLink({ el: 'a', to: '/a', text: 'Go' }));
        expect(a.textContent).toBe('Go');
        expect(a.getAttribute('href')).toBe('/a');
    });

    test('children win over text', () => {
        const child = new Component('b');
        const a = mount(new RouterLink({ el: 'a', to: '/a', text: 'Go', childs: [child] } as any));
        expect(a.querySelector('b')).not.toBeNull();
        expect(a.textContent).toBe('');
    });

    test('showHref false leaves href out and still navigates', async () => {
        const a = mount(new RouterLink({ el: 'a', to: '/a', showHref: false }));
        expect(a.hasAttribute('href')).toBe(false);
        const done = navigated();
        const e = click(a);
        await done;
        expect(e.defaultPrevented).toBe(true);
        expect(app.router.uri).toBe('/a');
    });

    test('a target other than _self is left to the browser', () => {
        const a = mount(new RouterLink({ el: 'a', to: '/a', target: '_blank' }));
        expect(a.getAttribute('target')).toBe('_blank');
        const e = click(a);
        expect(e.defaultPrevented).toBe(false);
        expect(app.router.uri).toBe('/');
    });

    test('target _self is handled by the router', async () => {
        const a = mount(new RouterLink({ el: 'a', to: '/a', target: '_self' }));
        const done = navigated();
        click(a);
        await done;
        expect(app.router.uri).toBe('/a');
    });

    test('a click with a modifier key is left to the browser', () => {
        const a = mount(new RouterLink({ el: 'a', to: '/a' }));
        for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
            const e = click(a, { [key]: true });
            expect(e.defaultPrevented).toBe(false);
        }
        expect(app.router.uri).toBe('/');
    });
});
