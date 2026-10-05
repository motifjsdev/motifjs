/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

afterEach(() => { document.body.innerHTML = ''; });

let seq = 0;
function makeStore(asyncDispose = false) {
    return class Store {
        id = ++seq;
        disposed = false;
        dispose(): any {
            if (!asyncDispose) { this.disposed = true; return; }
            return new Promise<void>(r => setTimeout(() => { this.disposed = true; r(); }, 50));
        }
    };
}

type Seen = { svc: any; ctx: any };

function makeApp(Store: any, options: { leaveMs?: number } = {}) {
    const seen: Record<string, Seen> = {};
    class Child extends Component {
        constructor() { super('p'); }
        onDisposing() { seen.childOnDisposing = { svc: this.getService(Store), ctx: (this.context as any)?.tag }; }
    }
    class Page extends Component {
        constructor() {
            super('section');
            if (options.leaveMs) {
                this.motif.options.transition.out({ keyframes: [{ opacity: 1 }, { opacity: 0 }], options: options.leaveMs } as any);
                (this.element as any).animate = () => {
                    const a: any = new EventTarget();
                    a.finished = new Promise<void>(r => setTimeout(() => { r(); a.dispatchEvent(new Event('finish')); }, options.leaveMs));
                    a.cancel = () => { };
                    return a;
                };
            }
        }
        onBuilt() { this.controls.add(new Child()); }
        onDisposing() { seen.pageOnDisposing = { svc: this.getService(Store), ctx: (this.context as any)?.tag }; }
        look(): Seen { return { svc: this.getService(Store), ctx: (this.context as any)?.tag }; }
    }
    const host = document.body.appendChild(document.createElement('div'));
    window.history.replaceState({}, '', '/');
    const builder: any = Application.CreateBuilder();
    builder.services.addSingleton(Store, Store);
    const app: any = builder.build();
    app.useRouter({ routes: [{ path: '/', control: Page }] });
    const page = () => {
        const walk = (c: any): any => { if (c instanceof Page) return c; for (const k of c.controls?.items ?? []) { const r = walk(k); if (r) return r; } };
        return walk(app.getAppShell());
    };
    return { app, seen, page, host };
}

describe('app.state', () => {
    test('moves through initializing, running, disposing and disposed', async () => {
        const { app, host } = makeApp(makeStore());
        expect(app.state).toBe('initializing');
        app.run(host);
        expect(app.state).toBe('running');
        const done = app.dispose();
        expect(app.state).toBe('disposing');
        expect(app.dispose()).toBe(done);
        await done;
        expect(app.state).toBe('disposed');
    });
});

describe('services live until the tree is gone', () => {
    test('during the leave animation and in every onDisposing the same live service and context are seen', async () => {
        const Store = makeStore();
        const { app, seen, page, host } = makeApp(Store, { leaveMs: 200 });
        app.tag = 'A';
        app.run(host);
        await tick(30);
        const p = page();
        const held = p.getService(Store);
        const done = app.dispose();
        await tick(50);
        const during = p.look();
        expect(during.svc).toBe(held);
        expect(during.svc.disposed).toBe(false);
        expect(during.ctx).toBe('A');
        await done;
        for (const s of [seen.pageOnDisposing, seen.childOnDisposing]) {
            expect(s.svc).toBe(held);
            expect(s.ctx).toBe('A');
        }
        expect(held.disposed).toBe(true);
        expect(p.getService(Store)).toBeNull();
    });

    test('the same without a leave animation', async () => {
        const Store = makeStore();
        const { app, seen, page, host } = makeApp(Store);
        app.run(host);
        await tick(30);
        const held = page().getService(Store);
        await app.dispose();
        expect(seen.childOnDisposing.svc).toBe(held);
        expect(held.disposed).toBe(true);
    });

    test('await app.dispose() waits for an async service dispose', async () => {
        const Store = makeStore(true);
        const { app, page, host } = makeApp(Store);
        app.run(host);
        await tick(30);
        const held = page().getService(Store);
        await app.dispose();
        expect(held.disposed).toBe(true);
    });

    test('Application.main stays set until the tree and the services are gone', async () => {
        const { app, host } = makeApp(makeStore(), { leaveMs: 100 });
        app.run(host);
        await tick(30);
        const done = app.dispose();
        expect(Application.main).toBe(app);
        await done;
        expect(Application.main).toBeNull();
    });
});

describe('a new app started while the previous one is disposing', () => {
    test('can be built, keeps Application.main, and the old page still sees its own app', async () => {
        const Store = makeStore();
        const a = makeApp(Store, { leaveMs: 200 });
        a.app.tag = 'A';
        a.app.run(a.host);
        await tick(30);
        const pageA = a.page();
        const heldA = pageA.getService(Store);
        const doneA = a.app.dispose();

        const b = makeApp(Store);
        b.app.tag = 'B';
        b.app.run(b.host);
        expect(Application.main).toBe(b.app);
        await tick(50);

        const during = pageA.look();
        expect(during.svc).toBe(heldA);
        expect(during.ctx).toBe('A');
        await doneA;
        expect(a.seen.childOnDisposing.svc).toBe(heldA);
        expect(Application.main).toBe(b.app);
        expect(b.app.state).toBe('running');

        const heldB = b.page().getService(Store);
        expect(heldB).not.toBe(heldA);
        expect(heldB.disposed).toBe(false);
        await b.app.dispose();
        expect(Application.main).toBeNull();
    });

    test('a second builder is still refused while an app is running', async () => {
        const { app, host } = makeApp(makeStore());
        app.run(host);
        expect(() => Application.CreateBuilder()).toThrow(/MJX405/);
        await app.dispose();
    });
});
