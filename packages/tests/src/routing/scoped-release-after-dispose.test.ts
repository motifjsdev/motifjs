import { Application, Component, RouterView } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const waitFor = async (cond: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

class Svc {
    static all: Svc[] = [];
    id = Svc.all.push(this);
    disposed = false;
    dispose() { this.disposed = true; }
}

const seen: string[] = [];
const describeSvc = (svc: Svc) => `#${svc.id}${svc.disposed ? ' disposed' : ''}`;

class Page extends Component {
    constructor(public svc: Svc) { super('section'); }
    onDisposing() { seen.push(`page sees ${describeSvc(this.svc)}`); }
}

class Widget extends Component {
    svc = this.getService(Svc)!;
    constructor() { super('aside'); }
    onDisposing() { seen.push(`widget sees ${describeSvc(this.svc)}`); }
    svcId = 0;
    onDisposed() { seen.push(`widget done, #${this.svcId} ${Svc.all[this.svcId - 1].disposed ? 'disposed' : 'alive'}`); }
}

class Layout extends Component {
    static last: Layout;
    widget = new Widget();
    constructor() {
        super('div');
        Layout.last = this;
        this.controls.add(this.widget, new RouterView({ name: 'default' }));
    }
}

describe('a scoped service outlives the component that still holds its navigation', () => {
    let app: Application;
    let host: HTMLElement;

    const start = (routes: any[], options: any = {}) => {
        const builder = Application.CreateBuilder();
        builder.services.addScoped(Svc, Svc);
        builder.services.addTransient(Page, { useClass: Page, deps: [Svc] } as any);
        app = builder.build();
        app.useRouter({ routes, mode: 'history', ...options });
        app.run(host);
    };

    const back = async () => {
        const done = new Promise<void>(r => window.addEventListener('popstate', () => r(), { once: true }));
        window.history.back();
        await done;
        await tick(80);
    };

    beforeEach(() => {
        Svc.all = [];
        seen.length = 0;
        sessionStorage.clear();
        window.history.replaceState(null, '', '/a');
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host.remove();
    });

    test('the page leaving a stack with an animation sees its own service alive while it is disposed', async () => {
        start([{ path: '/a', control: Page }, { path: '/b', control: Page }], { stack: { animation: 'slide', duration: 20 } });
        await tick();
        await app.router.navigate('/b');
        await tick();
        const leavingService = Svc.all[1];
        await back();
        await waitFor(() => leavingService.disposed);
        expect(seen).toEqual([`page sees #2`]);
    });

    test('an evicted keepAlive page sees its own service alive while it is disposed', async () => {
        start([{ path: '/a', control: Page, keepAlive: true }, { path: '/b', control: Page }]);
        await tick();
        await app.router.navigate('/b');
        await tick();
        const cachedService = Svc.all[0];
        await app.router.evict();
        await tick();
        expect(seen).toEqual([`page sees #1`]);
        expect(cachedService.disposed).toBe(true);
    });

    test('a detached component disposed after the navigation moved on sees its service alive until it is done', async () => {
        start([{ path: '/', control: () => new Layout(), childs: [{ path: '/a', control: Page }, { path: '/b', control: Page }] }]);
        await tick();
        const widget = Layout.last.widget;
        const id = widget.svcId = (widget.svc as any).id;
        await Layout.last.controls.detach(widget);
        await app.router.navigate('/b');
        await tick(150);
        expect(seen).toEqual([`page sees #${id}`]);
        expect(Svc.all[id - 1].disposed).toBe(false);
        seen.length = 0;
        await widget.dispose();
        await tick();
        expect(seen).toEqual([`widget sees #${id}`, `widget done, #${id} alive`]);
        expect(Svc.all[id - 1].disposed).toBe(true);
    });
});
