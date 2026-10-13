/**
 * @jest-environment jsdom
 */
import { Application, Component, RouteItem } from '@motifx/core';

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

class Theme { mode = 'dark'; }
class Unused { }
class Svc { items: string[] = []; }
class Temp { }
class Slow { ready = true; }

class Page extends Component {
    constructor(public svc: Svc) { super('section'); }
}

describe('devtools scopes', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let open: () => void;

    beforeEach(() => {
        window.history.replaceState({}, '', '/a');
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        open = release;
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Theme, Theme);
        builder.services.addSingleton(Unused, Unused);
        builder.services.addScoped(Svc, Svc);
        builder.services.addTransient(Temp, Temp);
        builder.services.addSingleton(Slow, { useFactory: async () => { await gate; return new Slow(); } } as any);
        builder.services.addTransient(Page, { useClass: Page, deps: [Svc] } as any);
        app = builder.build();
        app.useDevelopment(true);
        host = document.createElement('div');
        document.body.appendChild(host);
        const routes: RouteItem[] = [
            { path: '/a', control: Page },
            { path: '/b', control: Page },
            { path: '/k', control: Page, keepAlive: true },
        ];
        app.useRouter({ routes });
        app.run(host);
    });

    afterEach(async () => {
        open();
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    const scopes = () => hook().getScopes() as any[];
    const tokens = (scope: any) => scope.services.map((s: any) => s.token);

    test('the root scope lists the singletons created so far', async () => {
        await tick();
        app.provider.get(Theme);
        const root = scopes()[0];
        expect(root).toMatchObject({ kind: 'root', name: null, parent: null, pending: false });
        expect(root.services).toContainEqual({ token: 'Theme', lifetime: 'singleton', instance: { kind: 'object', type: 'Theme', keys: 1 } });
        expect(tokens(root)).not.toContain('Unused');
    });

    test('a navigation scope becomes current and the previous one leaves once released', async () => {
        await tick();
        const [root, first] = scopes();
        expect(root.current).toBe(false);
        expect(first).toMatchObject({ kind: 'navigation', name: 'navigation', parent: root.id, current: true, pending: false });
        expect(first.pins).toBe(0);
        expect(first.services).toContainEqual({ token: 'Svc', lifetime: 'scoped', instance: { kind: 'object', type: 'Svc', keys: 1 } });
        await app.router.navigate('/b');
        await tick();
        const after = scopes().filter(s => s.kind === 'navigation');
        expect(after).toHaveLength(1);
        expect(after[0].id).not.toBe(first.id);
        expect(after[0].current).toBe(true);
    });

    test('a scope kept by a kept-alive page stays listed with its pins after leaving', async () => {
        await tick();
        await app.router.navigate('/k');
        await tick();
        const kept = scopes().find(s => s.kind === 'navigation' && s.current);
        await app.router.navigate('/b');
        await tick();
        const after = scopes().find(s => s.id === kept.id);
        expect(after).toMatchObject({ current: false, pins: 1 });
        expect(tokens(after)).toEqual(['Svc']);
    });

    test('a scope created in code is listed with its name and parent until disposed', async () => {
        await tick();
        const own = app.provider.createScope('own');
        own.get(Svc);
        const inner = own.createScope('inner');
        const rootId = scopes()[0].id;
        const mine = scopes().find(s => s.name === 'own');
        expect(mine).toMatchObject({ kind: 'user', parent: rootId, current: false });
        expect(tokens(mine)).toEqual(['Svc']);
        expect(scopes().find(s => s.name === 'inner').parent).toBe(mine.id);
        await inner.dispose();
        await own.dispose();
        expect(scopes().some(s => s.name === 'inner' || s.name === 'own')).toBe(false);
    });

    test('a disposed scope is no longer listed', async () => {
        await tick();
        const own = app.provider.createScope('gone');
        await own.dispose();
        expect(scopes().some(s => s.name === 'gone')).toBe(false);
    });

    test('a scope created while devtools is off is not recorded', async () => {
        await tick();
        app.useDevelopment(false);
        const hidden = app.provider.createScope('hidden');
        app.useDevelopment(true);
        expect(scopes().some(s => s.name === 'hidden')).toBe(false);
        expect(hidden).toBeDefined();
    });

    test('scope changes publish one scopes:changed per turn and none while off', async () => {
        await tick();
        const events: string[] = [];
        const off = hook().on((ev: any) => { if (ev.type === 'scopes:changed') events.push(ev.type); });
        app.provider.createScope('x');
        app.provider.createScope('y');
        await tick(0);
        expect(events).toEqual(['scopes:changed']);
        await app.router.navigate('/b');
        await tick();
        expect(events.length).toBeGreaterThan(1);
        events.length = 0;
        app.useDevelopment(false);
        app.provider.createScope('z');
        await tick(0);
        app.useDevelopment(true);
        off();
        expect(events).toEqual([]);
    });

    test('a singleton still being created is marked creating', async () => {
        await tick();
        const pending = app.provider.getAsync(Slow);
        expect(scopes()[0].services).toContainEqual({ token: 'Slow', lifetime: 'singleton', instance: null, creating: true });
        open();
        await pending;
        expect(scopes()[0].services).toContainEqual({ token: 'Slow', lifetime: 'singleton', instance: { kind: 'object', type: 'Slow', keys: 1 } });
    });

    test('transients kept for disposal are listed', async () => {
        await tick();
        const own = app.provider.createScope('t').enableAutoDisposeTransients();
        own.get(Temp);
        expect(scopes().find(s => s.name === 't').transients).toEqual([{ kind: 'object', type: 'Temp', keys: 0 }]);
    });
});
