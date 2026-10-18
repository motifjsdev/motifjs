/**
 * @jest-environment jsdom
 */
import { Application, Component, RouterView, RouterLink, RouteItem, errorHandler } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Page extends Component {
    constructor() { super('section'); }
}

class Shell extends Component {
    static link: RouterLink;
    static plain: Component;
    static events: string[] = [];
    constructor() {
        super('div');
        Shell.link = new RouterLink({
            to: '/users', el: 'a', activeClass: 'is-active', exactClass: 'is-exact',
            onActive: () => { Shell.events.push('active'); throw new Error('onActive patladi'); },
            offActive: () => Shell.events.push('offActive'),
            onExact: () => Shell.events.push('exact'),
            offExact: () => { Shell.events.push('offExact'); throw new Error('offExact patladi'); },
        });
        Shell.plain = new Component('span');
        Shell.plain.motif.options.enableRouterClassing = {
            path: '/users', to: 'all', activeClass: 'p-active', exactClass: 'p-exact',
            onActive: async () => { Shell.events.push('p-active'); throw new Error('async onActive patladi'); },
            onExact: () => Shell.events.push('p-exact'),
        } as any;
        this.controls.add(Shell.link, Shell.plain, new RouterView({ name: 'default' }));
    }
}

let app: Application;
let host: HTMLElement;
let reported: any[];
let unbind: () => void;

beforeEach(() => {
    Shell.events = [];
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    window.history.replaceState({}, '', '/');
    app = Application.CreateBuilder().build();
    host = document.createElement('div');
    document.body.appendChild(host);
    const routes: RouteItem[] = [
        {
            path: '/', control: Shell, childs: [
                { path: '/', control: () => new Page() },
                { path: '/users', control: () => new Page() },
                { path: '/users/{id}', control: () => new Page() },
            ]
        }
    ];
    app.useRouter({ routes });
    app.run(host);
});

afterEach(async () => {
    unbind();
    try { await app?.dispose(); } catch { }
    host.remove();
});

const codes = () => reported.map(e => e.code);
const causes = () => reported.map(e => e.cause && e.cause.message);

describe('a router classing callback that throws is reported and the rest of the evaluation still runs', () => {
    test('onActive throws on an exact match: is-exact is written, onExact runs, MJX105 is reported once', async () => {
        await tick();
        reported.length = 0;
        Shell.events = [];

        await app.navigate('/users');
        await tick();

        const el = Shell.link.element as HTMLElement;
        expect(el.classList.contains('is-active')).toBe(true);
        expect(el.classList.contains('is-exact')).toBe(true);
        expect(Shell.events).toContain('active');
        expect(Shell.events).toContain('exact');
        const linkReports = reported.filter(e => e.cause && e.cause.message === 'onActive patladi');
        expect(linkReports.length).toBe(1);
        expect(linkReports[0].code).toBe('MJX105');
    });

    test('offExact throws on a partial match: the class state is still correct and the error is reported', async () => {
        await tick();
        reported.length = 0;

        await app.navigate('/users/5');
        await tick();

        const el = Shell.link.element as HTMLElement;
        expect(el.classList.contains('is-active')).toBe(true);
        expect(el.classList.contains('is-exact')).toBe(false);
        expect(causes()).toContain('offExact patladi');
        expect(codes().every(c => c === 'MJX105')).toBe(true);
    });

    test('an async onActive that rejects is reported and onExact still runs on a plain component', async () => {
        await tick();
        reported.length = 0;
        Shell.events = [];

        await app.navigate('/users');
        await tick();

        const el = Shell.plain.element as HTMLElement;
        expect(el.classList.contains('p-active')).toBe(true);
        expect(el.classList.contains('p-exact')).toBe(true);
        expect(Shell.events).toContain('p-exact');
        expect(causes()).toContain('async onActive patladi');
    });

    test('a navigation with no matching callback error reports nothing', async () => {
        await tick();
        await app.navigate('/users');
        await tick();
        reported.length = 0;

        await app.navigate('/');
        await tick();

        expect(reported.filter(e => e.code === 'MJX105').map(e => e.cause.message)).toEqual(['offExact patladi']);
    });
});
