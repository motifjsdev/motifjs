import { Application, Component, FromService, RouteItem } from '@motifx/core';

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

class Svc {
    static n = 0;
    static all: Svc[] = [];
    id = ++Svc.n;
    disposed = false;
    constructor() { Svc.all.push(this); }
    dispose() { this.disposed = true; }
}

class ClassPage extends Component {
    static last: ClassPage | null = null;
    svc = FromService(Svc)!;
    own = this.getService(Svc)!;
    seenInSetup = this.svc.id;
    ownInSetup = this.own.id;
    constructor() {
        super('section');
        ClassPage.last = this;
    }
}

const fnSeen: number[] = [];
function FnPage() {
    fnSeen.push(FromService<Svc>(Svc)!.id);
    return new Component('article');
}

describe('FromService while a page is set up', () => {
    let app: Application;
    let host: HTMLElement;

    beforeEach(async () => {
        Svc.n = 0;
        Svc.all = [];
        ClassPage.last = null;
        fnSeen.length = 0;
        window.history.replaceState({}, '', '/a');
        const builder = Application.CreateBuilder();
        builder.services.addScoped(Svc, Svc);
        app = builder.build();
        host = document.createElement('div');
        document.body.appendChild(host);
        const routes: RouteItem[] = [
            { path: '/a', control: ClassPage },
            { path: '/b', control: ClassPage },
            { path: '/f', control: FnPage },
            { path: '/g', control: FnPage },
        ];
        app.useRouter({ routes });
        app.run(host);
        await tick();
    });

    afterEach(async () => {
        await app.dispose();
        host.remove();
    });

    test('the first page sees its own navigation instance during setup', () => {
        const page = ClassPage.last!;
        expect(page.seenInSetup).toBe(page.ownInSetup);
        expect(page.svc.id).toBe(page.own.id);
    });

    test('a later page sees its own navigation instance during setup, not the previous one', async () => {
        const first = ClassPage.last!;
        const firstId = first.ownInSetup;
        await app.router.navigate('/b');
        await tick();
        const page = ClassPage.last!;
        expect(page).not.toBe(first);
        expect(page.seenInSetup).toBe(page.ownInSetup);
        expect(page.seenInSetup).not.toBe(firstId);
    });

    test('no instance is left in the root after leaving the first page', async () => {
        await app.router.navigate('/b');
        await tick();
        await app.router.navigate('/a');
        await tick();
        const live = Svc.all.filter(s => !s.disposed).map(s => s.id);
        expect(live).toEqual([ClassPage.last!.own.id]);
    });

    test('a function component page sees its own navigation instance during setup', async () => {
        await app.router.navigate('/f');
        await tick();
        expect(fnSeen).toEqual([FromService<Svc>(Svc)!.id]);
        await app.router.navigate('/g');
        await tick();
        expect(fnSeen[1]).toBe(FromService<Svc>(Svc)!.id);
        expect(fnSeen[1]).not.toBe(fnSeen[0]);
    });
});
