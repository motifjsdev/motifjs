import { Application, Component, RouterView, RouteItem, errorHandler } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const waitFor = async (cond: () => boolean, ms = 1500) => {
    const end = Date.now() + ms;
    while (!cond()) {
        if (Date.now() > end) throw new Error('waitFor timed out');
        await tick(10);
    }
};

class Page extends Component {
    static built: string[] = [];
    static all: Page[] = [];
    activated = 0;
    deactivated = 0;
    constructor(public name: string) {
        super('section');
        Page.all.push(this);
        (this.element as HTMLElement).id = `page-${name}`;
    }
    onBuilt() { Page.built.push(this.name); }
    onActivated() { this.activated++; }
    onDeactivated() { this.deactivated++; }
}

class Layout extends Component {
    constructor() {
        super('div');
        (this.element as HTMLElement).id = 'layout';
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

describe('route control given as a ready instance', () => {
    let app: Application;
    let host: HTMLElement;
    let reported: any[];
    let unbind: () => void;

    function start(routes: RouteItem[], url: string, extra: any = {}) {
        window.history.replaceState({}, '', url);
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes, mode: 'history', ...extra });
        app.run(host);
    }

    beforeEach(() => {
        Page.built = [];
        Page.all = [];
        reported = [];
        unbind = errorHandler.addListener(e => reported.push(e));
    });
    afterEach(async () => {
        unbind();
        try { await app?.dispose(); } catch { }
        host?.remove();
        window.history.replaceState({}, '', '/');
    });

    const shown = (id: string) => host.querySelector(`#${id}`) as HTMLElement | null;
    const codes = () => reported.map(e => `${e.code}${e.cause?.code ? '<' + e.cause.code : ''}`);

    test('the instance returns on the second entry without being rebuilt', async () => {
        const a = new Page('a');
        start([
            { path: '/a', control: a },
            { path: '/b', control: () => new Page('b') },
        ], '/a');
        await tick();
        expect(shown('page-a')).toBe(a.element);
        await app.router.navigate('/b');
        await tick();
        expect(shown('page-b')).not.toBeNull();
        expect(shown('page-a')).toBeNull();
        expect(a.isDisposed).toBe(false);
        expect(a.deactivated).toBe(1);
        await app.router.navigate('/a');
        await tick();
        expect(shown('page-a')).toBe(a.element);
        expect(a.activated).toBe(1);
        expect(Page.built.filter(n => n === 'a')).toEqual(['a']);
        expect(codes()).toEqual([]);
    });

    test('a parameter change keeps the instance and runs onUpdate', async () => {
        const item = new Page('item');
        let updates = 0;
        start([
            { path: '/items/{id}', control: item, onUpdate: () => { updates++; } },
        ], '/items/1');
        await tick();
        await app.router.navigate('/items/2');
        await tick();
        expect(shown('page-item')).toBe(item.element);
        expect(item.isDisposed).toBe(false);
        expect(updates).toBe(1);
        expect(app.router.params.id).toBe('2');
        expect(Page.built).toEqual(['item']);
    });

    test('the instance works as fallbacks.notFound on every miss', async () => {
        const nf = new Page('nf');
        start([
            { path: '/a', control: () => new Page('a') },
        ], '/nope', { fallbacks: { notFound: nf } });
        await tick();
        expect(shown('page-nf')).toBe(nf.element);
        await app.router.navigate('/a');
        await tick();
        await app.router.navigate('/nope2');
        await tick();
        expect(shown('page-nf')).toBe(nf.element);
        expect(nf.isDisposed).toBe(false);
    });

    test('a layout instance and a child instance both return', async () => {
        const layout = new Layout();
        const list = new Page('list');
        start([
            { path: '/users', control: layout, childs: [
                { path: '/', control: list },
                { path: '/{id}', control: () => new Page('detail') },
            ] },
            { path: '/home', control: () => new Page('home') },
        ], '/users');
        await tick();
        expect(shown('page-list')).toBe(list.element);
        await app.router.navigate('/users/5');
        await tick();
        expect(shown('page-detail')).not.toBeNull();
        expect(shown('page-list')).toBeNull();
        await app.router.navigate('/users');
        await tick();
        expect(shown('page-list')).toBe(list.element);
        await app.router.navigate('/home');
        await tick();
        expect(shown('layout')).toBeNull();
        expect(layout.isDisposed).toBe(false);
        await app.router.navigate('/users');
        await tick();
        expect(shown('layout')).toBe(layout.element);
        expect(shown('page-list')).toBe(list.element);
        expect(codes()).toEqual([]);
    });

    test('keepAlive: true with a factory is unchanged: cached on leave, disposed by evict()', async () => {
        start([
            { path: '/k', control: () => new Page('k'), keepAlive: true },
            { path: '/b', control: () => new Page('b') },
        ], '/k');
        await tick();
        const k = Page.all.find(p => p.name === 'k')!;
        await app.router.navigate('/b');
        await tick();
        expect(k.isDisposed).toBe(false);
        await app.router.evict();
        expect(k.isDisposed).toBe(true);
        await app.router.navigate('/k');
        await tick();
        expect(Page.built.filter(n => n === 'k')).toEqual(['k', 'k']);
    });

    test('evict() leaves a given instance alone, app.dispose() disposes it', async () => {
        const a = new Page('a');
        const routeA: RouteItem = { path: '/a', name: 'a', control: a };
        start([
            routeA,
            { path: '/b', control: () => new Page('b') },
        ], '/a');
        await tick();
        await app.router.navigate('/b');
        await tick();
        await app.router.evict();
        expect(a.isDisposed).toBe(false);
        await app.router.evict('a');
        expect(a.isDisposed).toBe(false);
        await app.router.evict(routeA);
        expect(a.isDisposed).toBe(false);
        await app.router.navigate('/a');
        await tick();
        expect(shown('page-a')).toBe(a.element);
        await app.dispose();
        expect(a.isDisposed).toBe(true);
    });

    test('entering a route whose given instance is disposed reports MJX318 and shows the error fallback', async () => {
        const a = new Page('a');
        start([
            { path: '/a', control: a },
            { path: '/b', control: () => new Page('b') },
        ], '/b', { fallbacks: { error: () => new Page('err') } });
        await tick();
        await a.dispose();
        await app.router.navigate('/a');
        await tick();
        expect(codes()).toEqual(['MJX304<MJX318']);
        expect(shown('page-err')).not.toBeNull();
        expect(shown('page-a')).toBeNull();
    });

    test('a Promise that resolves to an instance is kept the same way', async () => {
        const a = new Page('a');
        start([
            { path: '/a', control: Promise.resolve(a) },
            { path: '/b', control: () => new Page('b') },
        ], '/a');
        await tick();
        expect(shown('page-a')).toBe(a.element);
        await app.router.navigate('/b');
        await tick();
        expect(a.isDisposed).toBe(false);
        await app.router.navigate('/a');
        await tick();
        expect(shown('page-a')).toBe(a.element);
        expect(codes()).toEqual([]);
    });

    test('a factory that hands back a disposed instance reports MJX318 instead of a blank page', async () => {
        const shared = new Page('s');
        start([
            { path: '/s', control: () => shared },
            { path: '/b', control: () => new Page('b') },
        ], '/s', { fallbacks: { error: () => new Page('err') } });
        await tick();
        expect(shown('page-s')).toBe(shared.element);
        await app.router.navigate('/b');
        await waitFor(() => shared.isDisposed);
        await app.router.navigate('/s');
        await tick();
        expect(codes()).toEqual(['MJX304<MJX318']);
        expect(shown('page-err')).not.toBeNull();
    });

    test('stack navigation: a given instance comes back on history back', async () => {
        let popCount = 0;
        const onPop = () => { popCount++; };
        window.addEventListener('popstate', onPop);
        try {
            const a = new Page('a');
            start([
                { path: '/', control: () => new Page('root') },
                { path: '/a', control: a },
                { path: '/b', control: () => new Page('b') },
            ], '/', { stack: true });
            await tick();
            await app.router.navigate('/a');
            await tick();
            expect(shown('page-a')).toBe(a.element);
            await app.router.navigate('/b');
            await tick();
            expect(a.isDisposed).toBe(false);
            const before = popCount;
            window.history.back();
            await waitFor(() => popCount > before);
            await tick();
            expect(shown('page-a')).toBe(a.element);
            expect(Page.built.filter(n => n === 'a')).toEqual(['a']);
            expect(codes()).toEqual([]);
        } finally {
            window.removeEventListener('popstate', onPop);
        }
    });

    test('the same instance given to two routes is shown by each', async () => {
        const shared = new Page('shared');
        start([
            { path: '/x', control: shared },
            { path: '/y', control: shared },
            { path: '/b', control: () => new Page('b') },
        ], '/x');
        await tick();
        expect(shown('page-shared')).toBe(shared.element);
        await app.router.navigate('/y');
        await tick();
        expect(shown('page-shared')).toBe(shared.element);
        await app.router.navigate('/b');
        await tick();
        expect(shown('page-shared')).toBeNull();
        expect(shared.isDisposed).toBe(false);
        await app.router.navigate('/x');
        await tick();
        expect(shown('page-shared')).toBe(shared.element);
        expect(codes()).toEqual([]);
    });
});
