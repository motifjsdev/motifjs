import { Application, Component, ComponentBase, RouterView, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Layout extends Component {
    constructor() {
        super('div');
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

class Page extends Component {
    constructor(public name: string) { super('section'); }
}

describe('RouteItem.onShow', () => {
    let app: Application;
    let host: HTMLElement;
    let shown: Array<{ route: string; inst: ComponentBase }>;

    const record = (route: string) => (inst: ComponentBase) => { shown.push({ route, inst }); };
    const countOf = (route: string) => shown.filter(s => s.route === route).length;

    beforeEach(() => {
        shown = [];
        window.history.replaceState({}, '', '/a');
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        const routes: RouteItem[] = [
            {
                path: '/', control: Layout, onShow: record('layout'), childs: [
                    { path: '/a', control: () => new Page('a'), onShow: record('a') },
                    { path: '/b/{id}', control: () => new Page('b'), onShow: record('b') },
                    { path: '/k', control: () => new Page('k'), keepAlive: true, onShow: record('k') },
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

    test('is called with the mounted instance on the initial navigation, layouts included', async () => {
        await tick();
        expect(countOf('layout')).toBe(1);
        expect(countOf('a')).toBe(1);
        const a = shown.find(s => s.route === 'a')!.inst as Page;
        expect(a).toBeInstanceOf(Page);
        expect(a.name).toBe('a');
        expect(host.contains(a.element as Node)).toBe(true);
    });

    test('an unchanged layout is not shown again', async () => {
        await tick();
        await app.router.navigate('/b/1');
        await tick();
        await app.router.navigate('/a');
        await tick();
        expect(countOf('layout')).toBe(1);
        expect(countOf('a')).toBe(2);
        expect(countOf('b')).toBe(1);
    });

    test('a param change that recreates the component shows the new instance', async () => {
        await tick();
        await app.router.navigate('/b/1');
        await tick();
        await app.router.navigate('/b/2');
        await tick();
        const bs = shown.filter(s => s.route === 'b');
        expect(bs.length).toBe(2);
        expect(bs[0].inst).not.toBe(bs[1].inst);
    });

    test('a keepAlive component is shown again when it comes back', async () => {
        await tick();
        await app.router.navigate('/k');
        await tick();
        await app.router.navigate('/a');
        await tick();
        await app.router.navigate('/k');
        await tick();
        const ks = shown.filter(s => s.route === 'k');
        expect(ks.length).toBe(2);
        expect(ks[0].inst).toBe(ks[1].inst);
    });

});

describe('RouteItem.onShow errors', () => {
    test('a throwing onShow is logged and navigation completes', async () => {
        window.history.replaceState({}, '', '/x');
        const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({
            routes: [
                { path: '/x', control: () => new Page('x'), onShow: () => { throw new Error('boom'); } },
                { path: '/y', control: () => new Page('y') },
            ]
        });
        app.run(host);
        await tick();
        expect(spy).toHaveBeenCalledWith('[motifjs] MJX306: The onShow hook threw.', expect.any(Error));
        await app.router.navigate('/y');
        await tick();
        expect(app.router.ok).toBe(true);
        expect(app.router.uri).toBe('/y');
        spy.mockRestore();
        try { app.dispose(); } catch { }
        host.remove();
    });
});
