import { Application, Component, ComponentBase, MotifError, RouterView, RouteItem, effect, errorHandler, FromService } from '@motifx/core';

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

class Svc {
    static n = 0;
    static all: Svc[] = [];
    id = ++Svc.n;
    items: string[] = [];
    disposed = false;
    #secret = 'private';
    constructor() { Svc.all.push(this); }
    get secret() { return this.#secret; }
    dispose() { this.disposed = true; }
}
const byId = (id: number) => Svc.all.find(s => s.id === id)!;

class Single {
    static n = 0;
    id = ++Single.n;
}

class Tracker {
    constructor(public svc: Svc) { }
}

class Child extends Component {
    svc = this.getService(Svc)!;
    constructor() { super('span'); }
}

class Layout extends Component {
    constructor(public svc: Svc) {
        super('div');
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

class Page extends Component {
    child = new Child();
    constructor(public svc: Svc, public single: Single) {
        super('section');
        this.controls.add(this.child);
    }
}

class EarlyPage extends Component {
    constructor(public svc: Svc) {
        super('section');
        Promise.resolve().then(() => this.svc.items.push('early'));
    }
}

class KeptPage extends Component {
    constructor(public svc: Svc) { super('section'); }
}

class BrokenPage extends Component {
    constructor(public svc: Svc) {
        super('section');
        throw new Error('broken page');
    }
}

describe('scoped services: one scope per navigation', () => {
    let app: Application;
    let host: HTMLElement;
    let shown: Record<string, ComponentBase[]>;

    const record = (name: string) => (inst: ComponentBase) => { (shown[name] ??= []).push(inst); };
    const last = <T,>(name: string) => shown[name][shown[name].length - 1] as unknown as T;

    beforeEach(() => {
        Svc.n = 0;
        Svc.all = [];
        Single.n = 0;
        shown = {};
        window.history.replaceState({}, '', '/a');
        const builder = Application.CreateBuilder();
        builder.services.addScoped(Svc, Svc);
        builder.services.addSingleton(Single, Single);
        builder.services.addSingleton(Tracker, { useClass: Tracker, deps: [Svc] });
        builder.services.addTransient(Layout, { useClass: Layout, deps: [Svc] } as any);
        builder.services.addTransient(Page, { useClass: Page, deps: [Svc, Single] } as any);
        builder.services.addTransient(EarlyPage, { useClass: EarlyPage, deps: [Svc] } as any);
        builder.services.addTransient(KeptPage, { useClass: KeptPage, deps: [Svc] } as any);
        builder.services.addTransient(BrokenPage, { useClass: BrokenPage, deps: [Svc] } as any);
        app = builder.build();
        host = document.createElement('div');
        document.body.appendChild(host);
        const routes: RouteItem[] = [
            {
                path: '/', control: Layout, onShow: record('layout'), childs: [
                    { path: '/a', control: Page, onShow: record('a') },
                    { path: '/b', control: Page, onShow: record('b') },
                    { path: '/p/{id}', control: Page, onShow: record('p') },
                    { path: '/k', control: KeptPage, keepAlive: true, onShow: record('k') },
                    { path: '/early', control: EarlyPage, onShow: record('early') },
                    { path: '/broken', control: BrokenPage },
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

    test('the layout, the page and its child components see the same instance', async () => {
        await tick();
        const layout = last<Layout>('layout');
        const a = last<Page>('a');
        expect(a.svc.id).toBe(layout.svc.id);
        expect(a.getService(Svc)!.id).toBe(layout.svc.id);
        expect(a.child.svc.id).toBe(layout.svc.id);
        a.svc.items.push('from page');
        expect(layout.svc.items).toEqual(['from page']);
    });

    test('the handle behaves like the service', async () => {
        await tick();
        const a = last<Page>('a');
        expect(a.svc).toBeInstanceOf(Svc);
        expect(a.svc.secret).toBe('private');
        expect('items' in a.svc).toBe(true);
        (a.svc as any).extra = 42;
        expect((byId(a.svc.id) as any).extra).toBe(42);
        expect(a.svc.dispose).toBe(a.svc.dispose);
    });

    test('on navigation the layout moves to the new instance and the old one is disposed', async () => {
        await tick();
        const layout = last<Layout>('layout');
        const firstId = layout.svc.id;
        await app.router.navigate('/b');
        await tick();
        const b = last<Page>('b');
        expect(shown.layout.length).toBe(1);
        expect(b.svc.id).not.toBe(firstId);
        expect(layout.svc.id).toBe(b.svc.id);
        expect(byId(firstId).disposed).toBe(true);
        expect(b.svc.disposed).toBe(false);
    });

    test('a reactive read of the handle re-runs on navigation', async () => {
        await tick();
        const layout = last<Layout>('layout');
        const seen: number[] = [];
        const stop = effect(() => { seen.push(layout.svc.id); });
        await app.router.navigate('/b');
        await tick();
        expect(seen[seen.length - 1]).toBe(last<Page>('b').svc.id);
        expect(new Set(seen).size).toBeGreaterThan(1);
        (stop as any)?.dispose?.();
        (stop as any)?.stop?.();
    });

    test('late work of a page that left goes to its own instance', async () => {
        await tick();
        const a = last<Page>('a');
        const cart = a.svc;
        const childCart = a.child.svc;
        const oldId = cart.id;
        await app.router.navigate('/b');
        await tick();
        cart.items.push('late');
        childCart.items.push('late child');
        expect(cart.id).toBe(oldId);
        expect(byId(oldId).items).toEqual(['late', 'late child']);
        expect(last<Page>('b').svc.items).toEqual([]);
        expect(last<Layout>('layout').svc.items).toEqual([]);
    });

    test('a param change gives a new instance and the old page keeps its own', async () => {
        await app.router.navigate('/p/1');
        await tick();
        const p1 = last<Page>('p');
        const p1Cart = p1.svc;
        const p1Id = p1Cart.id;
        await app.router.navigate('/p/2');
        await tick();
        const p2 = last<Page>('p');
        expect(p2).not.toBe(p1);
        expect(p2.svc.id).not.toBe(p1Id);
        p1Cart.items.push('product 1 data');
        expect(p1Cart.id).toBe(p1Id);
        expect(p2.svc.items).toEqual([]);
        expect(byId(p1Id).items).toEqual(['product 1 data']);
        expect(byId(p1Id).disposed).toBe(true);
    });

    test('a keepAlive page keeps its instance while cached and follows the current navigation when shown again', async () => {
        await tick();
        await app.router.navigate('/k');
        await tick();
        const k = last<KeptPage>('k');
        const keptId = k.svc.id;
        const layout = last<Layout>('layout');
        expect(layout.svc.id).toBe(keptId);

        await app.router.navigate('/a');
        await tick();
        expect(k.svc.id).toBe(keptId);
        expect(byId(keptId).disposed).toBe(false);
        expect(layout.svc.id).not.toBe(keptId);

        await app.router.navigate('/k');
        await tick();
        expect(last<KeptPage>('k')).toBe(k);
        expect(k.svc.id).toBe(layout.svc.id);
        expect(k.svc.id).not.toBe(keptId);
        expect(byId(keptId).disposed).toBe(true);
    });

    test('evicting a cached keepAlive page releases the instance it kept', async () => {
        await tick();
        await app.router.navigate('/k');
        await tick();
        const k = last<KeptPage>('k');
        const keptId = k.svc.id;
        await app.router.navigate('/a');
        await tick();
        expect(byId(keptId).disposed).toBe(false);
        await app.router.evict();
        await tick();
        expect(k.isDisposed).toBe(true);
        expect(byId(keptId).disposed).toBe(true);
    });

    test('work started while the page is built lands in the new instance', async () => {
        await tick();
        const layout = last<Layout>('layout');
        const oldId = layout.svc.id;
        await app.router.navigate('/early');
        await tick();
        const early = last<EarlyPage>('early');
        expect(early.svc.items).toEqual(['early']);
        expect(layout.svc.id).toBe(early.svc.id);
        expect(byId(oldId).items).toEqual([]);
    });

    test('singletons and FromService follow the current navigation', async () => {
        await tick();
        const tracker = app.provider.get<Tracker>(Tracker);
        const single = last<Page>('a').single;
        expect(tracker.svc.id).toBe(last<Page>('a').svc.id);
        expect(FromService<Svc>(Svc).id).toBe(last<Page>('a').svc.id);
        await app.router.navigate('/b');
        await tick();
        expect(tracker.svc.id).toBe(last<Page>('b').svc.id);
        expect(FromService<Svc>(Svc).id).toBe(last<Page>('b').svc.id);
        expect(last<Page>('b').single).toBe(single);
        expect(Single.n).toBe(1);
    });

    test('a failed navigation releases the instance it opened', async () => {
        await tick();
        const layout = last<Layout>('layout');
        const currentId = layout.svc.id;
        const received: any[] = [];
        const unbind = errorHandler.addListener(e => received.push(e));
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
        try {
            await app.router.navigate('/broken');
            await tick();
        } finally {
            unbind();
            consoleError.mockRestore();
        }
        expect(received.some(e => e instanceof MotifError && e.code === 'MJX304')).toBe(true);
        const opened = Svc.all.filter(s => s.id > currentId);
        expect(opened.length).toBeGreaterThan(0);
        expect(opened.every(s => s.disposed)).toBe(true);
    });

    test('a scope created in code stays isolated', async () => {
        await tick();
        const own = app.provider.createScope('own');
        const mine = own.get<Svc>(Svc);
        expect(mine.id).not.toBe(last<Layout>('layout').svc.id);
        await app.router.navigate('/b');
        await tick();
        expect(own.get<Svc>(Svc)).toBe(mine);
        expect(mine.disposed).toBe(false);
    });
});

describe('scoped services in the navigation stack', () => {
    let app: Application;
    let host: HTMLElement;
    let popCount = 0;
    const onPop = () => { popCount++; };
    const pages: Record<string, StackPage[]> = {};

    class StackPage extends Component {
        svc = this.getService(Svc)!;
        constructor(public name: string) {
            super('section');
            (pages[name] ??= []).push(this);
        }
    }
    const lastOf = (name: string) => pages[name][pages[name].length - 1];

    beforeEach(async () => {
        Svc.n = 0;
        Svc.all = [];
        for (const k of Object.keys(pages)) delete pages[k];
        popCount = 0;
        sessionStorage.clear();
        window.history.replaceState(null, '', '/');
        window.addEventListener('popstate', onPop);
        const builder = Application.CreateBuilder();
        builder.services.addScoped(Svc, Svc);
        app = builder.build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({
            routes: [
                { path: '/', control: () => new StackPage('root') },
                { path: '/a', control: () => new StackPage('a') },
                { path: '/b', control: () => new StackPage('b') },
            ] as any,
            mode: 'history',
            stack: true,
        });
        app.run(host);
        await tick();
    });

    afterEach(() => {
        window.removeEventListener('popstate', onPop);
        try { app?.dispose(); } catch { }
        host.remove();
    });

    test('a retained page keeps its instance and follows the current navigation when it comes back', async () => {
        await app.navigate('/a');
        await tick();
        const a = lastOf('a');
        const keptId = a.svc.id;

        await app.navigate('/b');
        await tick();
        const b = lastOf('b');
        expect(a.isDisposed).toBe(false);
        expect(a.svc.id).toBe(keptId);
        expect(byId(keptId).disposed).toBe(false);
        expect(b.svc.id).not.toBe(keptId);

        const before = popCount;
        window.history.back();
        const start = Date.now();
        while (popCount === before && Date.now() - start < 2000) await tick(5);
        await tick();
        expect(lastOf('a')).toBe(a);
        expect(a.svc.id).not.toBe(keptId);
        expect(byId(keptId).disposed).toBe(true);
    });
});
