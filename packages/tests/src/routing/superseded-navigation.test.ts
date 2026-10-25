import { Application, Component } from '@motifx/core';

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const waitFor = async (cond: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

class Page extends Component {
    static all: Page[] = [];
    route: string;
    constructor(public name: string) {
        super('section');
        this.route = Application.main.router.uri;
        (this.element as HTMLElement).dataset.page = name;
        Page.all.push(this);
    }
}

class Animated extends Page {
    constructor() {
        super('anim');
        this.motif.options.transition.classes = { name: 'pg', duration: 80 } as any;
    }
}

const page = (name: string) => () => new Page(name);
const shown = (host: HTMLElement) => Array.from(host.querySelectorAll('[data-page]')).map(e => (e as HTMLElement).dataset.page);

describe('a navigation overtaken by a newer one leaves nothing behind', () => {
    let app: Application;
    let host: HTMLElement;

    const start = async (at: string, routes: any[]) => {
        window.history.replaceState(null, '', at);
        app = Application.CreateBuilder().build();
        app.useRouter({ routes, mode: 'history' });
        app.run(host);
        await tick();
    };

    beforeEach(() => {
        Page.all = [];
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host.remove();
    });

    test('a page built for an overtaken navigation is not shown on a later visit', async () => {
        await start('/a', [{ path: '/a', control: page('a') }, { path: '/b', control: page('b') }, { path: '/c', control: page('c') }]);
        await Promise.all([app.router.navigate('/b'), app.router.navigate('/c')]);
        await tick();
        const stale = Page.all.filter(p => p.name === 'b');
        await app.router.navigate('/b');
        await tick();
        const current = Page.all.filter(p => p.name === 'b' && !p.isDisposed);
        expect(current.length).toBe(1);
        expect(stale.every(p => !current.includes(p))).toBe(true);
        expect(shown(host)).toEqual(['b']);
    });

    test('a parameter route shows the page built for the address in the bar', async () => {
        const pageFor = () => new Page('p' + Application.main.router.params.id);
        await start('/a', [{ path: '/a', control: page('a') }, { path: '/c', control: page('c') }, { path: '/p/{id}', control: pageFor }]);
        await Promise.all([app.router.navigate('/p/1'), app.router.navigate('/c')]);
        await tick();
        await app.router.navigate('/p/2');
        await tick();
        expect(app.router.uri).toBe('/p/2');
        expect(shown(host)).toEqual(['p2']);
    });

    test('the page built for an overtaken navigation is disposed', async () => {
        await start('/a', [{ path: '/a', control: page('a') }, { path: '/b', control: page('b') }, { path: '/c', control: page('c') }]);
        await Promise.all([app.router.navigate('/b'), app.router.navigate('/c')]);
        const stale = Page.all.find(p => p.name === 'b');
        expect(stale).toBeDefined();
        await waitFor(() => stale!.isDisposed);
        expect(shown(host)).toEqual(['c']);
    });

    test('a click while the leaving page plays its leave transition leaves no stale page', async () => {
        await start('/anim', [{ path: '/anim', control: () => new Animated() }, { path: '/b', control: page('b') }, { path: '/c', control: page('c') }]);
        const first = app.router.navigate('/b');
        await tick(20);
        const second = app.router.navigate('/c');
        await Promise.all([first, second]);
        await tick(200);
        expect(shown(host)).toEqual(['c']);
        const stale = Page.all.filter(p => p.name === 'b');
        await app.router.navigate('/b');
        await tick();
        const live = Page.all.filter(p => p.name === 'b' && !p.isDisposed);
        expect(live.length).toBe(1);
        expect(stale.includes(live[0])).toBe(false);
        expect(shown(host)).toEqual(['b']);
    });

    test('a keepAlive page built for an overtaken navigation is kept and shown later', async () => {
        await start('/a', [{ path: '/a', control: page('a') }, { path: '/k', control: page('k'), keepAlive: true }, { path: '/c', control: page('c') }]);
        await Promise.all([app.router.navigate('/k'), app.router.navigate('/c')]);
        await tick();
        await app.router.navigate('/k');
        await tick();
        expect(Page.all.filter(p => p.name === 'k').length).toBe(1);
        expect(shown(host)).toEqual(['k']);
    });
});
