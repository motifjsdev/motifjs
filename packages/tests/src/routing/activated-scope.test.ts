import { Application, Component } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Session {
    static all: Session[] = [];
    id = Session.all.push(this);
    disposed = false;
    note: string | null = null;
    dispose() { this.disposed = true; }
}

class Kept extends Component {
    static last: Kept;
    seenInActivated: number[] = [];
    constructor(public session: Session) {
        super('section');
        Kept.last = this;
    }
    onActivated() {
        this.seenInActivated.push(this.session.id);
        this.session.note = 'written in onActivated';
    }
}

class Other extends Component {
    constructor() { super('section'); }
}

describe('a page shown again works with the current navigation in onActivated', () => {
    let app: Application;
    let host: HTMLElement;

    const start = async (routes: any[], options: any = {}) => {
        window.history.replaceState(null, '', '/kept');
        const builder = Application.CreateBuilder();
        builder.services.addScoped(Session, Session);
        builder.services.addTransient(Kept, { useClass: Kept, deps: [Session] } as any);
        app = builder.build();
        app.useRouter({ routes, mode: 'history', ...options });
        app.run(host);
        await tick();
    };

    const back = async () => {
        const done = new Promise<void>(r => window.addEventListener('popstate', () => r(), { once: true }));
        window.history.back();
        await done;
        await tick(120);
    };

    beforeEach(() => {
        Session.all = [];
        sessionStorage.clear();
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host.remove();
    });

    test('a keepAlive page writes into the instance it keeps using', async () => {
        await start([{ path: '/kept', control: Kept, keepAlive: true }, { path: '/other', control: () => new Other() }]);
        await app.router.navigate('/other');
        await tick();
        await app.router.navigate('/kept');
        await tick(80);
        const page = Kept.last;
        const current = page.session.id;
        expect(page.seenInActivated).toEqual([current]);
        expect(page.session.note).toBe('written in onActivated');
        expect(page.session.disposed).toBe(false);
    });

    test('a page kept detached in the stack writes into the instance it keeps using', async () => {
        await start([{ path: '/kept', control: Kept }, { path: '/other', control: () => new Other() }], { stack: { retain: false } });
        await app.router.navigate('/other');
        await tick();
        await back();
        const page = Kept.last;
        const current = page.session.id;
        expect(page.seenInActivated).toEqual([current]);
        expect(page.session.note).toBe('written in onActivated');
        expect(page.session.disposed).toBe(false);
    });
});
