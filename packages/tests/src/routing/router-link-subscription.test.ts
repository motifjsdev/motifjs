import { Application, Component, RouterView, RouterLink, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Page extends Component {
    constructor() { super('section'); }
}

class Shell extends Component {
    static current: Shell;
    constructor() {
        super('div');
        Shell.current = this;
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

describe('RouterLink and the router change subscription', () => {
    let app: Application;
    let host: HTMLElement;
    const handlers = () => ((app as any).events.get('motifjs-router-navigated')?.size ?? 0) as number;

    beforeEach(() => {
        window.history.replaceState({}, '', '/a');
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        const routes: RouteItem[] = [
            {
                path: '/', control: Shell, childs: [
                    { path: '/a', control: () => new Page() },
                    { path: '/b', control: () => new Page() },
                ]
            }
        ];
        app.useRouter({ routes });
        app.run(host);
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
        host.remove();
    });

    test('a link subscribes once, follows navigation and lets go when disposed', async () => {
        await tick();
        const before = handlers();
        const link = new RouterLink({ to: '/b', el: 'a', activeClass: 'on' });
        Shell.current.controls.add(link);
        await tick();
        expect(handlers()).toBe(before + 1);
        const el = link.element as HTMLElement;
        expect(el.classList.contains('on')).toBe(false);
        await app.router.navigate('/b');
        await tick();
        expect(el.classList.contains('on')).toBe(true);
        await link.dispose();
        await tick();
        expect(handlers()).toBe(before);
        await app.router.navigate('/a');
        await tick();
        expect(el.classList.contains('on')).toBe(true);
    });

    test('many links each add one subscription and remove it again', async () => {
        await tick();
        const before = handlers();
        const links = Array.from({ length: 5 }, (_, i) => new RouterLink({ to: '/x' + i, el: 'a', activeClass: 'on' }));
        links.forEach(l => Shell.current.controls.add(l));
        await tick();
        expect(handlers()).toBe(before + 5);
        await Promise.all(links.map(l => l.dispose()));
        await tick();
        expect(handlers()).toBe(before);
    });

    test('a link that is never built does not subscribe', async () => {
        await tick();
        const before = handlers();
        const link = new RouterLink({ to: '/b', el: 'a', activeClass: 'on' });
        await link.dispose();
        await tick();
        expect(handlers()).toBe(before);
    });

    test('a link still reaches the router through context when it reads it itself', async () => {
        await tick();
        const link = new RouterLink({ to: '/b', el: 'a', activeClass: 'on' });
        Shell.current.controls.add(link);
        await tick();
        expect((link.context as any).router).toBe(app.router);
        await link.dispose();
    });
});
