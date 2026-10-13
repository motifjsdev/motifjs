/**
 * @jest-environment jsdom
 */
import { Application, Component, RouteItem } from '@motifx/core';

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

let getterCalls = 0;

class Cart {
    items = [{ name: 'tea', qty: 2 }];
    total = 24;
    #secret = 'hidden';
    get count() { getterCalls++; return this.items.length + this.#secret.length; }
}
class Svc { label = 'page'; }
class Never { built = true; }

class Page extends Component {
    constructor(public svc: Svc) { super('section'); }
}

describe('devtools readService', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let neverBuilt: number;

    beforeEach(async () => {
        window.history.replaceState({}, '', '/a');
        getterCalls = 0;
        neverBuilt = 0;
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Cart, Cart);
        builder.services.addScoped(Svc, Svc);
        builder.services.addSingleton(Never, { useFactory: () => { neverBuilt++; return new Never(); } } as any);
        builder.services.addTransient(Page, { useClass: Page, deps: [Svc] } as any);
        app = builder.build();
        app.useDevelopment(true);
        host = document.createElement('div');
        document.body.appendChild(host);
        const routes: RouteItem[] = [{ path: '/a', control: Page }];
        app.useRouter({ routes });
        app.run(host);
        await tick();
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
    });

    const scopes = () => hook().getScopes() as any[];

    test('reads the fields of a singleton and opens a nested value', () => {
        app.provider.get(Cart);
        const root = scopes()[0].id;
        expect(hook().readService(root, 'Cart', [])).toEqual({
            ok: true,
            value: {
                value: { kind: 'object', type: 'Cart', keys: 2 },
                entries: [{ key: 'items', value: { kind: 'array', length: 1 } }, { key: 'total', value: 24 }],
                total: 2,
            },
        });
        expect(hook().readService(root, 'Cart', ['items', '0']).value.entries).toEqual([{ key: 'name', value: 'tea' }, { key: 'qty', value: 2 }]);
        expect(getterCalls).toBe(0);
    });

    test('reads a scoped service from its navigation scope', () => {
        const nav = scopes().find(s => s.kind === 'navigation' && s.current).id;
        expect(hook().readService(nav, 'Svc', []).value.entries).toEqual([{ key: 'label', value: 'page' }]);
        expect(hook().readService(scopes()[0].id, 'Svc', [])).toEqual({ ok: false, error: 'no service' });
    });

    test('reads a service from a scope created in code', () => {
        const own = app.provider.createScope('own');
        own.get(Svc).label = 'own';
        const id = scopes().find(s => s.name === 'own').id;
        expect(hook().readService(id, 'Svc', ['label']).value.value).toBe('own');
    });

    test('a service that was not created yet is not created by reading', () => {
        expect(hook().readService(scopes()[0].id, 'Never', [])).toEqual({ ok: false, error: 'no service' });
        expect(neverBuilt).toBe(0);
    });

    test('an unknown scope or a blocked key is refused', () => {
        app.provider.get(Cart);
        expect(hook().readService(9999, 'Cart', [])).toEqual({ ok: false, error: 'no scope' });
        expect(hook().readService(scopes()[0].id, 'Cart', ['__proto__'])).toEqual({ ok: false, error: 'invalid key' });
    });
});
