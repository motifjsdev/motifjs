import { Application, Component, RouterView, RouteItem, errorHandler } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Home extends Component {
    constructor() { super('p'); (this.element as HTMLElement).id = 'home'; }
}

class Layout extends Component {
    constructor() {
        super('div');
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

function pageClass() {
    return class Page extends Component {
        static made: Page[] = [];
        activated = 0;
        deactivated = 0;
        constructor() {
            super('section');
            Page.made.push(this);
            (this.element as HTMLElement).id = 'page';
        }
        onActivated() { this.activated++; }
        onDeactivated() { this.deactivated++; }
    };
}

describe('a route control registered in DI', () => {
    let app: Application;
    let host: HTMLElement;
    let reported: any[];
    let unbind: () => void;

    function start(Page: any, register: (services: any) => void, item: Partial<RouteItem> = {}) {
        window.history.replaceState({}, '', '/');
        const builder = Application.CreateBuilder();
        register(builder.services);
        app = builder.build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({
            routes: [{ path: '/', control: Layout, childs: [{ path: '/', control: Home }, { path: '/p/{id}', control: Page, ...item }] }],
            mode: 'history',
        });
        app.run(host);
    }

    const shown = () => host.querySelector('#page');

    beforeEach(() => {
        reported = [];
        unbind = errorHandler.addListener(e => reported.push(e));
    });
    afterEach(async () => {
        unbind();
        try { await app?.dispose(); } catch { }
        host?.remove();
        window.history.replaceState({}, '', '/');
    });

    test('singleton: one page for the life of the app, kept when left and shown again on return', async () => {
        const Page = pageClass();
        start(Page, s => s.addSingleton(Page, { useClass: Page }));
        await tick();
        await app.navigate('/p/1'); await tick();
        const page = Page.made[0];
        expect(shown()).toBe(page.element);
        await app.navigate('/'); await tick();
        expect(page.isDisposed).toBe(false);
        expect(page.deactivated).toBe(1);
        await app.navigate('/p/2'); await tick();
        expect(Page.made.length).toBe(1);
        expect(shown()).toBe(page.element);
        expect(page.activated).toBe(1);
        expect(reported.map(e => e?.code)).toEqual([]);
        await app.dispose();
        expect(page.isDisposed).toBe(true);
    });

    test('scoped: one real page per navigation, never a stand-in for another scope', async () => {
        const Page = pageClass();
        start(Page, s => s.addScoped(Page, { useClass: Page }));
        await tick();
        await app.navigate('/p/1'); await tick();
        expect(Page.made.length).toBe(1);
        const first = Page.made[0];
        expect(shown()).toBe(first.element);
        expect(Object.getPrototypeOf(first)).toBe(Page.prototype);
        await app.navigate('/'); await tick(150);
        expect(first.isDisposed).toBe(true);
        await app.navigate('/p/2'); await tick();
        expect(Page.made.length).toBe(2);
        expect(shown()).toBe(Page.made[1].element);
        expect(reported.map(e => e?.code)).toEqual([]);
    });

    test('scoped with keepAlive: the cached page outlives its navigation scope', async () => {
        const Page = pageClass();
        start(Page, s => s.addScoped(Page, { useClass: Page }), { keepAlive: true });
        await tick();
        await app.navigate('/p/1'); await tick();
        const page = Page.made[0];
        await app.navigate('/'); await tick();
        await app.navigate('/p/1'); await tick();
        expect(page.isDisposed).toBe(false);
        expect(Page.made.length).toBe(1);
        expect(shown()).toBe(page.element);
        expect(reported.map(e => e?.code)).toEqual([]);
    });

    test('transient: a fresh page on every visit', async () => {
        const Page = pageClass();
        start(Page, s => s.addTransient(Page, { useClass: Page }));
        await tick();
        await app.navigate('/p/1'); await tick();
        await app.navigate('/'); await tick();
        await app.navigate('/p/2'); await tick();
        expect(Page.made.length).toBe(2);
        await tick(150);
        expect(Page.made[0].isDisposed).toBe(true);
        expect(shown()).toBe(Page.made[1].element);
    });
});
