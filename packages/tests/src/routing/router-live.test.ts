import { Application, Component, ComponentBase, MotifError, RouterView, RouteItem, effect, useApplication, useNavigation } from '@motifx/core';

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

class Layout extends Component {
    nav = useNavigation();
    constructor() {
        super('div');
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

class Page extends Component {
    static leftWith: string[] = [];
    id = useNavigation().params.id;
    uriAtStart = Application.main.router.uri;
    constructor() { super('section'); }
    onDisposing() { Page.leftWith.push(Application.main.router.uri); }
}

describe('app.router and useNavigation() are live', () => {
    let app: Application;
    let host: HTMLElement;
    let shown: Record<string, ComponentBase[]>;
    let block = false;

    const record = (name: string) => (inst: ComponentBase) => { (shown[name] ??= []).push(inst); };
    const last = <T,>(name: string) => shown[name][shown[name].length - 1] as unknown as T;

    beforeEach(() => {
        shown = {};
        block = false;
        Page.leftWith = [];
        window.history.replaceState({}, '', '/a');
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        const routes: RouteItem[] = [
            {
                path: '/', control: () => new Layout(), onShow: record('layout'), childs: [
                    { path: '/a', control: () => new Page(), onShow: record('a') },
                    { path: '/b', control: () => new Page(), onShow: record('b') },
                    { path: '/p/{id}', control: () => new Page(), onShow: record('p') },
                ]
            }
        ];
        app.useGuard((_ctx, next) => next(block ? false : undefined));
        app.useRouter({ routes });
        app.run(host);
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
        host.remove();
    });

    test('app.router is one object for the lifetime of the application', async () => {
        const before = app.router;
        await tick();
        await app.router.navigate('/b');
        await tick();
        expect(app.router).toBe(before);
        expect(useApplication().router).toBe(before);
        expect(useNavigation()).toBe(before);
    });

    test('a router captured earlier reads the current route', async () => {
        const { router } = useApplication();
        await tick();
        await app.router.navigate('/p/7');
        await tick();
        expect(router.uri).toBe('/p/7');
        expect(router.params.id).toBe('7');
        expect(router.chain).toEqual(['/', '/p/7']);
    });

    test('a layout that stays mounted reads the new params', async () => {
        await tick();
        await app.router.navigate('/p/1');
        await tick();
        const layout = last<Layout>('layout');
        await app.router.navigate('/p/2');
        await tick();
        expect(shown.layout.length).toBe(1);
        expect(layout.nav.params.id).toBe('2');
        expect(layout.nav.uri).toBe('/p/2');
    });

    test('a reactive read re-runs on navigation', async () => {
        await tick();
        const seen: string[] = [];
        const stop = effect(() => { seen.push(app.router.uri); });
        await app.router.navigate('/b');
        await tick();
        await app.router.navigate('/p/3');
        await tick();
        expect(seen).toContain('/b');
        expect(seen[seen.length - 1]).toBe('/p/3');
        (stop as any)?.dispose?.();
        (stop as any)?.stop?.();
    });

    test('a page being constructed reads the navigation that creates it', async () => {
        await tick();
        await app.router.navigate('/p/5');
        await tick();
        const p = last<Page>('p');
        expect(p.id).toBe('5');
        expect(p.uriAtStart).toBe('/p/5');
    });

    test('the leaving page still reads its own route while it is removed', async () => {
        await tick();
        await app.router.navigate('/b');
        await tick();
        expect(Page.leftWith).toEqual(['/a']);
        expect(app.router.uri).toBe('/b');
    });

    test('a cancelled navigation keeps the current route', async () => {
        await tick();
        block = true;
        await app.router.navigate('/b');
        await tick();
        expect(app.router.uri).toBe('/a');
        expect(shown.b).toBeUndefined();
    });

    test('useNavigation().navigate returns a promise that settles after the navigation', async () => {
        await tick();
        const done = useNavigation().navigate('/b');
        expect(done).toBeInstanceOf(Promise);
        await done;
        expect(app.router.uri).toBe('/b');
    });
});

describe('app.router before useRouter()', () => {
    test('exists with empty route state and navigating throws MJX309', async () => {
        const app = Application.CreateBuilder().build();
        try {
            const router = app.router;
            expect(router).toBeDefined();
            expect(router.params).toEqual({});
            expect(router.uri).toBe('');
            expect(router.route).toBeNull();
            expect(router.chain).toEqual([]);
            await expect(router.navigate('/x')).rejects.toBeInstanceOf(MotifError);
            await expect(router.navigate('/x')).rejects.toMatchObject({ code: 'MJX309' });
        } finally {
            app.dispose();
        }
    });
});
