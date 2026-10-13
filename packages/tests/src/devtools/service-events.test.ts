/**
 * @jest-environment jsdom
 */
import { Application, Component, RouteItem } from '@motifx/core';

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

class Theme { mode = 'dark'; }
class Svc { items: string[] = []; }
class Temp { }
class Slow { ready = true; }
const CONFIG = 'config';

class Page extends Component {
    constructor(public svc: Svc) { super('section'); }
}

describe('devtools service events', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let events: { type: string; payload: any }[];
    let off: () => void;

    beforeEach(async () => {
        window.history.replaceState({}, '', '/a');
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Theme, Theme);
        builder.services.addScoped(Svc, Svc);
        builder.services.addTransient(Temp, Temp);
        builder.services.addSingleton(Slow, { useFactory: async () => { await tick(5); return new Slow(); } } as any);
        builder.services.addSingleton(CONFIG, { useValue: { debug: true } } as any);
        builder.services.addTransient(Page, { useClass: Page, deps: [Svc] } as any);
        app = builder.build();
        app.useDevelopment(true);
        host = document.createElement('div');
        document.body.appendChild(host);
        const routes: RouteItem[] = [
            { path: '/a', control: Page },
            { path: '/b', control: Page },
        ];
        app.useRouter({ routes });
        app.run(host);
        await tick();
        events = [];
        off = hook().on((ev: any) => { if (ev.type.startsWith('service:')) events.push(ev); });
    });

    afterEach(async () => {
        off();
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
    });

    const scopeId = (name: string | null, kind?: string) => hook().getScopes().find((s: any) => s.name === name && (kind === undefined || s.kind === kind)).id;
    const of = (type: string, token: string) => events.filter(e => e.type === type && e.payload.token === token);

    test('a singleton publishes service:created once, on first request', () => {
        app.provider.get(Theme);
        app.provider.get(Theme);
        expect(of('service:created', 'Theme').map(e => e.payload)).toEqual([
            { scope: scopeId(null, 'root'), token: 'Theme', lifetime: 'singleton', source: 'class', instance: { kind: 'object', type: 'Theme', keys: 1 } },
        ]);
    });

    test('a scoped service names the scope it was created in', () => {
        const own = app.provider.createScope('own');
        own.get(Svc);
        own.get(Svc);
        const created = of('service:created', 'Svc');
        expect(created).toHaveLength(1);
        expect(created[0].payload).toMatchObject({ scope: scopeId('own'), lifetime: 'scoped', source: 'class' });
    });

    test('a transient publishes service:created on every resolution', () => {
        app.provider.get(Temp);
        app.provider.get(Temp);
        expect(of('service:created', 'Temp')).toHaveLength(2);
        expect(of('service:created', 'Temp')[0].payload).toMatchObject({ lifetime: 'transient', source: 'class' });
    });

    test('an async singleton publishes once it is created', async () => {
        const pending = app.provider.getAsync(Slow);
        app.provider.getAsync(Slow);
        expect(of('service:created', 'Slow')).toHaveLength(0);
        await pending;
        expect(of('service:created', 'Slow').map(e => e.payload)).toEqual([
            { scope: scopeId(null, 'root'), token: 'Slow', lifetime: 'singleton', source: 'factory', instance: { kind: 'object', type: 'Slow', keys: 1 } },
        ]);
    });

    test('a value service is marked with source value', () => {
        app.provider.get(CONFIG);
        expect(of('service:created', 'config')[0].payload).toMatchObject({ lifetime: 'singleton', source: 'value', instance: { kind: 'object', type: 'Object', keys: 1 } });
    });

    test('disposing a scope publishes service:disposed for its scoped and transient instances', async () => {
        const own = app.provider.createScope('own').enableAutoDisposeTransients();
        own.get(Svc);
        own.get(Temp);
        const id = scopeId('own');
        await own.dispose();
        expect(events.filter(e => e.type === 'service:disposed').map(e => e.payload)).toEqual([
            { scope: id, token: 'Svc', lifetime: 'scoped', instance: { kind: 'object', type: 'Svc', keys: 1 } },
            { scope: id, token: 'Temp', lifetime: 'transient', instance: { kind: 'object', type: 'Temp', keys: 0 } },
        ]);
    });

    test('leaving a page disposes the services of its navigation scope', async () => {
        const first = scopeId('navigation', 'navigation');
        await app.router.navigate('/b');
        await tick();
        const disposed = of('service:disposed', 'Svc');
        expect(disposed.map(e => e.payload.scope)).toEqual([first]);
        const created = of('service:created', 'Svc');
        expect(created).toHaveLength(1);
        expect(created[0].payload.scope).not.toBe(first);
    });

    test('nothing is published while devtools is off', async () => {
        app.useDevelopment(false);
        app.provider.get(Theme);
        app.provider.get(Temp);
        const own = app.provider.createScope('own');
        own.get(Svc);
        await own.dispose();
        app.useDevelopment(true);
        expect(events).toEqual([]);
    });
});
