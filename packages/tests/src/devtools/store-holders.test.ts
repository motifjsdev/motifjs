/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive } from '@motifx/core';

class CartService {
    items = reactive({ count: 0 });
}

class Session {
    user = 'ada';
}

class Panel extends Component {
    state = reactive({ open: false });
    constructor() { super('section'); }
}

class Reader extends Component {
    constructor(public shared: object) { super('div'); }
}

describe('devtools store holders', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(CartService, CartService);
        builder.services.addSingleton(Session, { useFactory: () => reactive(new Session()) });
        app = builder.build();
        app.useDevelopment(true);
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    function run(...children: Component[]) {
        const root = new Component('main');
        root.controls.add(...children);
        app.run(host, root);
        return root;
    }

    const storeOf = (value: unknown) => hook().getStores().find((s: any) => s.value === value);
    const pathOf = (c: Component) => hook().pathOfElement(c.element);

    test('a store in a component field is held by that component', () => {
        const panel = new Panel();
        run(panel);
        expect(storeOf(panel.state).holders).toEqual([{ kind: 'component', path: pathOf(panel), type: 'Panel', field: 'state' }]);
    });

    test('a store held by two components lists both', () => {
        const shared = reactive({ n: 1 });
        const a = new Reader(shared);
        const b = new Reader(shared);
        run(a, b);
        expect(storeOf(shared).holders).toEqual([
            { kind: 'component', path: pathOf(a), type: 'Reader', field: 'shared' },
            { kind: 'component', path: pathOf(b), type: 'Reader', field: 'shared' },
        ]);
    });

    test('a store in a service field is held by that service', () => {
        const c = new Component('div');
        run(c);
        const cart = c.getService(CartService);
        expect(storeOf(cart.items).holders).toEqual([{ kind: 'service', token: 'CartService', lifetime: 'singleton', field: 'items' }]);
    });

    test('a service that is a store itself is listed with no field', () => {
        const c = new Component('div');
        run(c);
        const session = c.getService(Session);
        expect(storeOf(session).holders).toEqual([{ kind: 'service', token: 'Session', lifetime: 'singleton', field: null }]);
    });

    test('a store no component or service holds has no holders', () => {
        const loose = reactive({ loose: true });
        run(new Component('div'));
        expect(storeOf(loose).holders).toEqual([]);
    });

    test('getters on a component are not called while scanning', () => {
        let calls = 0;
        const panel = new Panel();
        Object.defineProperty(panel, 'computedState', { enumerable: true, get() { calls++; return panel.state; } });
        run(panel);
        expect(storeOf(panel.state).holders.map((h: any) => h.field)).toEqual(['state']);
        expect(calls).toBe(0);
    });

    test('a component removed from the tree no longer holds the store', async () => {
        const shared = reactive({ n: 1 });
        const a = new Reader(shared);
        const b = new Reader(shared);
        const root = run(a, b);
        root.controls.remove(a);
        await new Promise(r => setTimeout(r, 0));
        expect(storeOf(shared).holders).toEqual([{ kind: 'component', path: pathOf(b), type: 'Reader', field: 'shared' }]);
    });
});
