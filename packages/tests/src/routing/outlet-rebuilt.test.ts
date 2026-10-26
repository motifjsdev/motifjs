import { Application, Component, ComponentBase, Frame, RouterView, errorHandler, motifComponent, reactive } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const waitFor = async (cond: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

class Page extends Component {
    static all: Page[] = [];
    activated = 0;
    deactivated = 0;
    heard: string[] = [];
    constructor(public name: string) {
        super('section');
        (this.element as HTMLElement).dataset.page = name;
        Page.all.push(this);
    }
    onBuilt() {
        this.context.onRouterChanged(({ uri }: any) => this.heard.push(uri));
    }
    onActivated() { this.activated++; }
    onDeactivated() { this.deactivated++; }
}

class SingletonPage extends Page { constructor() { super('singleton'); } }
class ScopedPage extends Page { constructor() { super('scoped'); } }

const made = (name: string) => Page.all.filter(p => p.name === name);
const live = (name: string) => made(name).filter(p => !p.isDisposed);

const outlet = (id: string, opts: { name?: string; leave?: number } = {}) => motifComponent('div', (d: ComponentBase) => {
    (d.element as HTMLElement).id = id;
    if (opts.leave) d.motif.options.transition.classes = { name: 'out', duration: opts.leave } as any;
    d.controls.add(new RouterView((opts.name ? { name: opts.name } : {}) as any));
});

const empty = (id: string) => motifComponent('div', (d: ComponentBase) => { (d.element as HTMLElement).id = id; });

class Shell extends Component {
    static last: Shell;
    static first: () => ComponentBase = () => outlet('first');
    frame = new Frame();
    constructor() {
        super('div');
        (this.element as HTMLElement).id = 'shell';
        this.controls.add(this.frame);
        Shell.last = this;
    }
    onBuilt() { this.frame.navigate(Shell.first()); }
    show(content: ComponentBase) { return this.frame.navigate(content); }
}

class Mid extends Component {
    static last: Mid;
    frame = new Frame();
    constructor() {
        super('div');
        (this.element as HTMLElement).id = 'mid';
        this.controls.add(this.frame);
        Mid.last = this;
    }
    onBuilt() { this.frame.navigate(outlet('mid-first')); }
    show(content: ComponentBase) { return this.frame.navigate(content); }
}

describe('a RouterView built after the navigation finished', () => {
    let app: Application;
    let host: HTMLElement;
    let reported: any[];
    let warned: string[];
    let unbind: () => void;
    let warnSpy: jest.SpyInstance;
    let hooks: { enter: number; entering: number; guard: number; navigated: number; shown: Map<string, number> };

    const track = (name: string) => (_c: any) => { hooks.shown.set(name, (hooks.shown.get(name) ?? 0) + 1); };

    const start = async (routes: any[], options: { setup?: (builder: any) => void; router?: any; root?: () => ComponentBase; url?: string } = {}) => {
        window.history.replaceState(null, '', options.url ?? '/');
        const builder = Application.CreateBuilder();
        options.setup?.(builder);
        app = builder.build();
        app.useDevelopment(true);
        app.useRouter({ mode: 'history', routes, ...(options.router ?? {}) });
        app.useGuard((_ctx: any, next: any) => { hooks.guard++; next(); });
        app.on('motifjs-router-navigated', () => { hooks.navigated++; });
        app.run(host, options.root?.() as any);
        await tick(60);
    };

    const counts = () => ({ enter: hooks.enter, entering: hooks.entering, guard: hooks.guard, navigated: hooks.navigated });

    beforeEach(() => {
        Page.all = [];
        Shell.first = () => outlet('first');
        reported = [];
        warned = [];
        hooks = { enter: 0, entering: 0, guard: 0, navigated: 0, shown: new Map() };
        unbind = errorHandler.addListener((e: any) => reported.push(e?.code ?? e));
        warnSpy = jest.spyOn(console, 'warn').mockImplementation((...args: any[]) => { warned.push(String(args[0])); });
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        unbind();
        try { await app?.dispose(); } catch { }
        warnSpy.mockRestore();
        host.remove();
        window.history.replaceState(null, '', '/');
    });

    const child = (path: string, control: any, extra: any = {}) => ({
        path, control,
        onEnter: () => { hooks.enter++; },
        onEntering: () => { hooks.entering++; },
        ...extra,
    });

    test('the current page is built into the new outlet without a navigation', async () => {
        await start([{ path: '/', control: Shell, childs: [child('/', () => new Page('home'), { onShow: track('home') })] }]);
        const first = made('home')[0];
        expect(host.querySelector('#first [data-page="home"]')).not.toBeNull();
        const before = counts();
        first.heard.length = 0;

        await Shell.last.show(outlet('second'));
        await tick();

        expect(first.isDisposed).toBe(true);
        expect(live('home').length).toBe(1);
        expect(live('home')[0]).not.toBe(first);
        expect(host.querySelectorAll('[data-page="home"]').length).toBe(1);
        expect(host.querySelector('#second [data-page="home"]')).not.toBeNull();
        expect(hooks.shown.get('home')).toBe(2);
        expect(counts()).toEqual(before);
        expect(live('home')[0].heard).toEqual([]);
        expect(reported).toEqual([]);
        expect(warned).toEqual([]);
    });

    test('a forced navigation after the outlet came back does not build the page again', async () => {
        await start([{ path: '/', control: Shell, childs: [child('/', () => new Page('home'))] }]);
        await Shell.last.show(outlet('second'));
        await tick();
        const rebuilt = live('home')[0];
        await app.navigate('/', { replace: true, force: true });
        await tick();
        expect(live('home')).toEqual([rebuilt]);
        expect(host.querySelectorAll('[data-page="home"]').length).toBe(1);
    });

    test('an outlet switched off and on by a condition gets the page again', async () => {
        const state = reactive({ open: true });
        class Toggle extends Component {
            constructor() {
                super('div');
                (this.element as HTMLElement).id = 'toggle';
                this.bindings.when(() => state.open, () => new RouterView({} as any) as any);
            }
        }
        await start([{ path: '/', control: Toggle, childs: [child('/', () => new Page('home'))] }]);
        expect(host.querySelector('#toggle [data-page="home"]')).not.toBeNull();
        state.open = false;
        await tick();
        expect(host.querySelector('[data-page="home"]')).toBeNull();
        expect(live('home').length).toBe(0);
        state.open = true;
        await tick();
        expect(host.querySelectorAll('#toggle [data-page="home"]').length).toBe(1);
        expect(live('home').length).toBe(1);
        expect(warned.filter(w => w.includes('MJX301'))).toEqual([]);
    });

    test('the outlet of a root component given to run is filled again', async () => {
        await start([child('/', () => new Page('home'))], { root: () => new Shell() });
        expect(host.querySelector('#first [data-page="home"]')).not.toBeNull();
        await Shell.last.show(outlet('second'));
        await tick();
        expect(host.querySelectorAll('#second [data-page="home"]').length).toBe(1);
        expect(live('home').length).toBe(1);
    });

    test('rebuilding the outer outlet rebuilds the layout and its page, rebuilding the inner one only the page', async () => {
        await start([{ path: '/', control: Shell, childs: [{ path: '/', control: Mid, childs: [child('/', () => new Page('leaf'))] }] }]);
        const mid = Mid.last;
        const leaf = made('leaf')[0];
        expect(host.querySelector('#first #mid #mid-first [data-page="leaf"]')).not.toBeNull();

        await mid.show(outlet('mid-second'));
        await tick();
        expect(Mid.last).toBe(mid);
        expect(leaf.isDisposed).toBe(true);
        expect(host.querySelectorAll('#mid #mid-second [data-page="leaf"]').length).toBe(1);

        await Shell.last.show(outlet('second'));
        await tick();
        expect(mid.isDisposed).toBe(true);
        expect(Mid.last).not.toBe(mid);
        expect(host.querySelectorAll('#second #mid #mid-first [data-page="leaf"]').length).toBe(1);
        expect(live('leaf').length).toBe(1);
    });

    test('a route that targets a named outlet is placed in the rebuilt named outlet', async () => {
        Shell.first = () => outlet('first', { name: 'side' });
        await start([{ path: '/', control: Shell, childs: [child('/', () => new Page('side'), { extend: { targetOutlet: 'side' } })] }]);
        expect(host.querySelector('#first [data-page="side"]')).not.toBeNull();
        await Shell.last.show(outlet('second', { name: 'side' }));
        await tick();
        expect(host.querySelectorAll('#second [data-page="side"]').length).toBe(1);
        expect(live('side').length).toBe(1);
    });

    describe.each([
        ['keepAlive', (): any => ({ control: () => new Page('kept'), keepAlive: true }), undefined, 'kept'],
        ['given instance', (): any => ({ control: new Page('kept') }), undefined, 'kept'],
        ['singleton', (): any => ({ control: SingletonPage }), (b: any) => b.services.addSingleton(SingletonPage, { useClass: SingletonPage }), 'singleton'],
        ['scoped', (): any => ({ control: ScopedPage }), (b: any) => b.services.addScoped(ScopedPage, { useClass: ScopedPage }), 'scoped'],
    ] as const)('a %s page', (_label, item, setup, name) => {
        const routes = () => [{
            path: '/', control: Shell, childs: [
                child('/', undefined, { ...item(), onShow: track(name) }),
                child('/b', () => new Page('b')),
            ]
        }];

        test('comes back into the new outlet as the same instance, deactivated and activated once', async () => {
            await start(routes(), { setup });
            const page = live(name)[0];
            expect(page).toBeDefined();
            await Shell.last.show(outlet('second'));
            await tick();
            expect(page.isDisposed).toBe(false);
            expect(live(name)).toEqual([page]);
            expect(host.querySelectorAll(`#second [data-page="${name}"]`).length).toBe(1);
            expect(page.deactivated).toBe(1);
            expect(page.activated).toBe(1);
            expect(hooks.shown.get(name)).toBe(2);
            expect(reported).toEqual([]);
        });

        test('survives an outlet removed without a replacement and is shown again after leaving and coming back', async () => {
            await start(routes(), { setup });
            const page = live(name)[0];
            await Shell.last.show(empty('none'));
            await tick();
            expect(page.isDisposed).toBe(false);
            expect(page.deactivated).toBe(1);
            await Shell.last.show(outlet('second'));
            await tick();
            await app.navigate('/b');
            await tick();
            await app.navigate('/');
            await tick();
            expect(host.querySelectorAll(`#second [data-page="${name}"]`).length).toBe(1);
            if (name !== 'scoped') expect(live(name)).toEqual([page]);
            expect(reported).toEqual([]);
        });
    });

    test('a keepAlive page inside a plain layout survives when the outer outlet is rebuilt', async () => {
        await start([{ path: '/', control: Shell, childs: [{ path: '/', control: Mid, childs: [child('/', () => new Page('kept'), { keepAlive: true })] }] }]);
        const mid = Mid.last;
        const kept = made('kept')[0];
        await Shell.last.show(outlet('second'));
        await tick();
        expect(mid.isDisposed).toBe(true);
        expect(kept.isDisposed).toBe(false);
        expect(live('kept')).toEqual([kept]);
        expect(host.querySelectorAll('#second #mid [data-page="kept"]').length).toBe(1);
    });

    test('while the old outlet plays its leave transition a plain page is built at once and the old one leaves with its outlet', async () => {
        Shell.first = () => outlet('first', { leave: 150 });
        await start([{ path: '/', control: Shell, childs: [child('/', () => new Page('home'))] }]);
        const old = made('home')[0];
        old.heard.length = 0;
        void Shell.last.show(outlet('second'));
        await tick(40);
        expect(host.querySelector('#first')).not.toBeNull();
        expect(host.querySelector('#first [data-page="home"]')).not.toBeNull();
        expect(host.querySelectorAll('#second [data-page="home"]').length).toBe(1);
        const fresh = live('home').find(p => p !== old)!;
        expect(fresh).toBeDefined();
        await app.navigate('/', { replace: true, force: true });
        expect(old.heard).toEqual([]);
        await waitFor(() => old.isDisposed);
        expect(host.querySelector('#first')).toBeNull();
        expect(live('home')).toEqual([fresh]);
        expect(host.querySelectorAll('[data-page="home"]').length).toBe(1);
    });

    test('while the old outlet plays its leave transition a keepAlive page moves to the new outlet at once', async () => {
        Shell.first = () => outlet('first', { leave: 150 });
        await start([{ path: '/', control: Shell, childs: [child('/', () => new Page('kept'), { keepAlive: true })] }]);
        const kept = made('kept')[0];
        void Shell.last.show(outlet('second'));
        await tick(40);
        expect(host.querySelector('#first')).not.toBeNull();
        expect(host.querySelector('#first [data-page="kept"]')).toBeNull();
        expect(host.querySelectorAll('#second [data-page="kept"]').length).toBe(1);
        await waitFor(() => !host.querySelector('#first'));
        expect(kept.isDisposed).toBe(false);
        expect(live('kept')).toEqual([kept]);
        expect(kept.deactivated).toBe(1);
        expect(kept.activated).toBe(1);
    });

    test('a second outlet with the same name next to the one in use gets no second page', async () => {
        await start([{ path: '/', control: Shell, childs: [child('/', () => new Page('home'))] }]);
        const page = made('home')[0];
        Shell.last.controls.add(new RouterView({} as any));
        await tick();
        expect(made('home')).toEqual([page]);
        expect(host.querySelectorAll('[data-page="home"]').length).toBe(1);
        expect(host.querySelector('#first [data-page="home"]')).not.toBeNull();
    });

    test('a page kept by the navigation stack is not lost with its outlet and comes back on back', async () => {
        let pops = 0;
        const onPop = () => { pops++; };
        window.addEventListener('popstate', onPop);
        try {
            await start([{ path: '/', control: Shell, childs: [child('/x', () => new Page('x')), child('/y', () => new Page('y'))] }], { router: { stack: { retain: true } }, url: '/x' });
            const x = made('x')[0];
            await app.navigate('/y');
            await tick();
            await Shell.last.show(outlet('second'));
            await tick();
            expect(x.isDisposed).toBe(false);
            const before = pops;
            window.history.back();
            await waitFor(() => pops > before);
            await waitFor(() => !!host.querySelector('#second [data-page="x"]'));
            expect(made('x')).toEqual([x]);
            expect((x.element as HTMLElement).style.display).not.toBe('none');
            expect(host.querySelectorAll('[data-page="x"]').length).toBe(1);
        } finally {
            window.removeEventListener('popstate', onPop);
        }
    });

    test.each([true, false])('with retain: %s a page kept by the stack outlives its layout leaving and comes back on back', async (retain) => {
        let pops = 0;
        const onPop = () => { pops++; };
        window.addEventListener('popstate', onPop);
        try {
            await start([
                { path: '/app', control: Mid, childs: [child('/x', () => new Page('x')), child('/y', () => new Page('y'))] },
                child('/other', () => new Page('other')),
            ], { router: { stack: { retain } }, url: '/app/x' });
            const x = made('x')[0];
            const layout = Mid.last;
            await app.navigate('/app/y');
            await tick();
            await app.navigate('/other', { replace: true });
            await waitFor(() => layout.isDisposed);
            expect(x.isDisposed).toBe(false);
            const before = pops;
            window.history.back();
            await waitFor(() => pops > before);
            await waitFor(() => !!host.querySelector('#mid [data-page="x"]'));
            expect(Mid.last).not.toBe(layout);
            expect(made('x')).toEqual([x]);
            expect((x.element as HTMLElement).style.display).not.toBe('none');
            expect(host.querySelectorAll('[data-page="x"]').length).toBe(1);
        } finally {
            window.removeEventListener('popstate', onPop);
        }
    });

    test('a navigation that starts while the page is being rebuilt wins and the late page is released', async () => {
        class Slow extends Page { constructor() { super('slow'); } }
        let delay = 0;
        await start([{
            path: '/', control: Shell, childs: [
                child('/', () => new Promise(r => setTimeout(() => r(Slow), delay))),
                child('/b', () => new Page('b')),
            ]
        }]);
        delay = 120;
        await Shell.last.show(outlet('second'));
        const done = app.navigate('/b');
        await done;
        await tick(250);
        expect(host.querySelectorAll('[data-page="b"]').length).toBe(1);
        expect(host.querySelector('[data-page="slow"]')).toBeNull();
        expect(live('slow')).toEqual([]);
    });

    test('a page that cannot be built again shows the error route in the layout and reports MJX304', async () => {
        let builds = 0;
        await start([{
            path: '/', control: Shell, childs: [child('/', () => {
                if (++builds > 1) throw new Error('second build fails');
                return new Page('home');
            })]
        }], { router: { fallbacks: { error: () => new Page('error') } } });
        await Shell.last.show(outlet('second'));
        await tick(60);
        expect(reported).toContain('MJX304');
        expect(host.querySelectorAll('#second [data-page="error"]').length).toBe(1);
        expect(app.router.ok).toBe(false);
        expect(app.router.uri).toBe('/');
    });

    test('an outlet removed without a replacement warns nothing and app.dispose releases every page', async () => {
        await start([{
            path: '/', control: Shell, childs: [
                child('/', () => new Page('home')),
                child('/k', () => new Page('kept'), { keepAlive: true }),
            ]
        }]);
        await app.navigate('/k');
        await tick();
        await Shell.last.show(empty('none'));
        await tick(3300);
        expect(warned.filter(w => w.includes('MJX301'))).toEqual([]);
        expect(live('kept').length).toBe(1);
        await app.dispose();
        expect(Page.all.filter(p => !p.isDisposed)).toEqual([]);
    }, 10000);

    test('after restartRouter the new router fills a rebuilt outlet and the old one does not', async () => {
        await start([{ path: '/', control: Shell, childs: [child('/', () => new Page('home'))] }]);
        await app.restartRouter();
        await tick(60);
        expect(live('home').length).toBe(1);
        await Shell.last.show(outlet('second'));
        await tick();
        expect(live('home').length).toBe(1);
        expect(host.querySelectorAll('#second [data-page="home"]').length).toBe(1);
    });

    test('a layout that never builds its outlet still warns MJX301 during the navigation', async () => {
        class Bare extends Component { constructor() { super('div'); } }
        await start([{ path: '/', control: Bare, childs: [child('/', () => new Page('home'))] }]);
        await tick(3300);
        expect(warned.filter(w => w.includes('MJX301')).length).toBe(1);
    }, 10000);
});
