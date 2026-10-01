import { Application, Component, RouterView, RouterLink, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class Page extends Component {
    constructor() { super('section'); }
}

class Shell extends Component {
    static links: Record<string, Component> = {};
    static events: string[] = [];
    constructor() {
        super('div');
        const make = (to: string) => {
            const link = new RouterLink({
                to, el: 'a', activeClass: 'is-active', exactClass: 'is-exact',
                onActive: () => Shell.events.push(`active:${to}`),
                offActive: () => Shell.events.push(`offActive:${to}`),
                onExact: () => Shell.events.push(`exact:${to}`),
                offExact: () => Shell.events.push(`offExact:${to}`),
            });
            Shell.links[to] = link;
            return link;
        };
        this.controls.add(make('/'), make('/users'), make('/users/5'), new RouterView({ name: 'default' }));
    }
}

const classesOf = (to: string) => {
    const el = Shell.links[to].element as HTMLElement;
    return { active: el.classList.contains('is-active'), exact: el.classList.contains('is-exact') };
};

describe('RouterLink activeClass / exactClass (Vue semantics)', () => {
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        Shell.links = {};
        Shell.events = [];
        window.history.replaceState({}, '', '/users/5');
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

    afterEach(() => {
        try { app?.dispose(); } catch { }
        host.remove();
    });

    test('on /users/5: the prefix link is active only, the exact link is active and exact', async () => {
        await tick();
        expect(classesOf('/users')).toEqual({ active: true, exact: false });
        expect(classesOf('/users/5')).toEqual({ active: true, exact: true });
        expect(classesOf('/')).toEqual({ active: false, exact: false });
    });

    test('on /users: the deeper link is neither active nor exact', async () => {
        await tick();
        await app.router.navigate('/users');
        await tick();
        expect(classesOf('/users')).toEqual({ active: true, exact: true });
        expect(classesOf('/users/5')).toEqual({ active: false, exact: false });
    });

    test('the root link is active and exact only on the root path', async () => {
        await tick();
        await app.router.navigate('/');
        await tick();
        expect(classesOf('/')).toEqual({ active: true, exact: true });
        expect(classesOf('/users')).toEqual({ active: false, exact: false });
    });

    test('an exact match with a query string is also active', async () => {
        await tick();
        await app.router.navigate('/users?tab=1');
        await tick();
        expect(classesOf('/users')).toEqual({ active: true, exact: true });
    });

    test('callbacks follow the same rules', async () => {
        await tick();
        expect(Shell.events).toContain('active:/users');
        expect(Shell.events).toContain('offExact:/users');
        expect(Shell.events).toContain('active:/users/5');
        expect(Shell.events).toContain('exact:/users/5');
        expect(Shell.events).toContain('offActive:/');
    });
});
