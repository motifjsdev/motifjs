import { Application, Component, RouterView, Transport, TransportTo, motifComponent } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const waitFor = async (cond: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

const events: string[] = [];
const connected = (id: string) => !!document.getElementById(id)?.isConnected;

class Svc {
    static all: Svc[] = [];
    id = Svc.all.push(this);
    disposed = false;
    dispose() { this.disposed = true; events.push(`svc#${this.id} disposed`); }
}

class Page extends Component {
    static all: Page[] = [];
    constructor(public name: string) {
        super('section');
        (this.element as HTMLElement).id = `page-${name}`;
        Page.all.push(this);
    }
    onDisposing() { events.push(`${this.name} disposing, b on screen: ${connected('page-b')}`); }
    onDisposed() { events.push(`${this.name} disposed`); }
}

class ParamPage extends Page {
    runs: string[] = [];
    constructor() {
        super(`p${Application.main.router.params.id}`);
        const title = new Component('h2');
        title.bindings.method(() => {
            const id = Application.main.router.params.id;
            this.runs.push(String(id));
            return String(id);
        });
        this.controls.add(title);
        this.context.onRouterChanged(({ uri }: any) => { events.push(`${this.name} heard ${uri}`); });
    }
}

class AnimatedPage extends Page {
    constructor() {
        super('anim');
        this.motif.options.transition.classes = { name: 'pg', duration: 40 } as any;
    }
}

class ChildAnimatedPage extends Page {
    constructor() {
        super('child-anim');
        const toast = new Component('div');
        toast.motif.options.transition.classes = { name: 'x', duration: 300 } as any;
        this.controls.add(toast);
    }
}

class ActionsPage extends Page {
    constructor() {
        super('actions');
        const pin = new Component('button');
        (pin.element as HTMLElement).id = 'action-pin';
        this.controls.add(motifComponent(TransportTo, { name: 'page-actions', childs: [pin] }));
    }
}

class ScopedPage extends Page {
    constructor(public svc: Svc) { super('scoped'); }
    onDisposed() { events.push(`scoped disposed, svc#${this.svc.id} ${this.svc.disposed ? 'disposed' : 'alive'}`); }
}

class Layout extends Component {
    constructor() {
        super('div');
        const header = new Component('header');
        header.controls.add(new Transport({ name: 'page-actions' }));
        this.controls.add(header, new RouterView({ name: 'default' }));
    }
}

class ListPage extends Page {
    static rowsDisposing = 0;
    constructor() {
        super('list');
        const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));
        this.bindings.list(() => items, () => {
            const row = new Component('div');
            row.motif.on('x:disposing' as any, () => { ListPage.rowsDisposing++; });
            return row;
        });
    }
}

const page = (name: string) => () => new Page(name);

describe('a route change does not wait for the leaving page to be disposed', () => {
    let app: Application;
    let host: HTMLElement;

    const start = async (at: string, childs: any[], options: any = {}) => {
        window.history.replaceState(null, '', at);
        const builder = Application.CreateBuilder();
        builder.services.addScoped(Svc, Svc);
        builder.services.addTransient(ScopedPage, { useClass: ScopedPage, deps: [Svc] } as any);
        app = builder.build();
        app.useRouter({ routes: [{ path: '/', control: () => new Layout(), childs }], mode: 'history', ...options });
        app.run(host);
        await tick();
    };

    const back = async () => {
        const done = new Promise<void>(r => window.addEventListener('popstate', () => r(), { once: true }));
        window.history.back();
        await done;
    };

    beforeEach(() => {
        events.length = 0;
        Page.all = [];
        Svc.all = [];
        sessionStorage.clear();
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host.remove();
    });

    test('the new page is on screen before the leaving page is disposed', async () => {
        await start('/a', [{ path: '/a', control: page('a') }, { path: '/b', control: page('b') }]);
        const a = Page.all.find(p => p.name === 'a')!;
        await app.router.navigate('/b');
        expect(connected('page-b')).toBe(true);
        expect(connected('page-a')).toBe(false);
        expect(a.isDisposed).toBe(false);
        await waitFor(() => a.isDisposed);
        expect(events).toEqual(['a disposing, b on screen: true', 'a disposed']);
    });

    test('the rows of a list on the leaving page are disposed with the page, after the new page arrives', async () => {
        ListPage.rowsDisposing = 0;
        await start('/list', [{ path: '/list', control: () => new ListPage() }, { path: '/b', control: page('b') }]);
        const list = Page.all.find(p => p.name === 'list')!;
        await app.router.navigate('/b');
        expect(connected('page-b')).toBe(true);
        expect(ListPage.rowsDisposing).toBe(0);
        await waitFor(() => list.isDisposed);
        expect(ListPage.rowsDisposing).toBe(50);
    });

    test('a page with its own leave transition plays it first and is disposed after the new page arrives', async () => {
        await start('/anim', [{ path: '/anim', control: () => new AnimatedPage() }, { path: '/b', control: page('b') }]);
        const anim = Page.all.find(p => p.name === 'anim')!;
        const done = app.router.navigate('/b');
        await tick(20);
        expect(connected('page-anim')).toBe(true);
        expect(connected('page-b')).toBe(false);
        await done;
        expect(connected('page-anim')).toBe(false);
        expect(connected('page-b')).toBe(true);
        expect(anim.isDisposed).toBe(false);
        await waitFor(() => anim.isDisposed);
    });

    test('a child with a leave transition does not hold the outlet empty', async () => {
        await start('/child-anim', [{ path: '/child-anim', control: () => new ChildAnimatedPage() }, { path: '/b', control: page('b') }]);
        const started = Date.now();
        await app.router.navigate('/b');
        expect(Date.now() - started).toBeLessThan(150);
        expect(connected('page-child-anim')).toBe(false);
        expect(connected('page-b')).toBe(true);
    });

    test('a parameter change shows the new page before the old one is disposed', async () => {
        await start('/p/1', [{ path: '/p/{id}', control: () => new ParamPage() }]);
        const first = Page.all.find(p => p.name === 'p1')!;
        await app.router.navigate('/p/2');
        expect(Page.all.some(p => p.name === 'p2' && !p.isDisposed)).toBe(true);
        expect(first.isDisposed).toBe(false);
        expect(first.element && (first.element as HTMLElement).isConnected).toBe(false);
        await waitFor(() => first.isDisposed);
    });

    test('the leaving page stops reacting to the route at once', async () => {
        await start('/p/1', [{ path: '/p/{id}', control: () => new ParamPage() }, { path: '/b', control: page('b') }]);
        const first = Page.all.find(p => p.name === 'p1') as ParamPage;
        const runs = first.runs;
        await app.router.navigate('/b');
        await waitFor(() => first.isDisposed);
        expect(runs.every(id => id === '1')).toBe(true);
        expect(events.filter(e => e.startsWith('p1 heard /b'))).toEqual([]);
    });

    test('content sent to a Transport slot leaves with the page', async () => {
        await start('/actions', [{ path: '/actions', control: () => new ActionsPage() }, { path: '/b', control: page('b') }]);
        expect(connected('action-pin')).toBe(true);
        const actions = Page.all.find(p => p.name === 'actions')!;
        await app.router.navigate('/b');
        expect(connected('action-pin')).toBe(false);
        expect(actions.isDisposed).toBe(false);
        await waitFor(() => actions.isDisposed);
        expect(connected('action-pin')).toBe(false);
    });

    test('the leaving page keeps its scoped service until it is disposed', async () => {
        await start('/scoped', [{ path: '/scoped', control: ScopedPage }, { path: '/b', control: page('b') }]);
        const scoped = Page.all.find(p => p.name === 'scoped') as ScopedPage;
        const svc = Svc.all[0];
        await app.router.navigate('/b');
        expect(svc.disposed).toBe(false);
        await waitFor(() => scoped.isDisposed);
        await waitFor(() => svc.disposed);
        expect(events.indexOf(`scoped disposed, svc#1 alive`)).toBeGreaterThanOrEqual(0);
        expect(events.indexOf(`scoped disposed, svc#1 alive`)).toBeLessThan(events.indexOf('svc#1 disposed'));
    });

    test('a keepAlive page is detached and kept, not disposed', async () => {
        await start('/a', [{ path: '/a', control: page('a'), keepAlive: true }, { path: '/b', control: page('b') }]);
        const a = Page.all.find(p => p.name === 'a')!;
        await app.router.navigate('/b');
        await tick(80);
        expect(a.isDisposed).toBe(false);
        await app.router.navigate('/a');
        expect(connected('page-a')).toBe(true);
        expect(Page.all.filter(p => p.name === 'a').length).toBe(1);
    });

    test('quick successive navigations end on the last page and dispose the page that was left', async () => {
        await start('/a', [{ path: '/a', control: page('a') }, { path: '/b', control: page('b') }, { path: '/c', control: page('c') }]);
        const a = Page.all.find(p => p.name === 'a')!;
        const first = app.router.navigate('/b');
        const second = app.router.navigate('/c');
        await Promise.all([first, second]);
        await waitFor(() => a.isDisposed);
        expect(connected('page-c')).toBe(true);
        expect(connected('page-a')).toBe(false);
        expect(connected('page-b')).toBe(false);
        expect(Page.all.filter(p => p.name === 'c' && !p.isDisposed).length).toBe(1);
    });

    test('going back in a stack shows the kept page before the leaving page is disposed', async () => {
        await start('/a', [{ path: '/a', control: page('a') }, { path: '/b', control: page('b') }], { stack: true });
        await app.router.navigate('/b');
        await tick();
        const b = Page.all.find(p => p.name === 'b')!;
        await back();
        await waitFor(() => connected('page-a'));
        expect(connected('page-b')).toBe(false);
        expect(b.isDisposed).toBe(false);
        await waitFor(() => b.isDisposed);
    });

    test('disposing the application disposes a page that is still waiting to be disposed', async () => {
        await start('/a', [{ path: '/a', control: page('a') }, { path: '/b', control: page('b') }]);
        const a = Page.all.find(p => p.name === 'a')!;
        await app.router.navigate('/b');
        await app.dispose();
        expect(a.isDisposed).toBe(true);
    });
});
