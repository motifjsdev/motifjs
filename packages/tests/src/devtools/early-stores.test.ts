/**
 * @jest-environment jsdom
 */
import { Application, Component, Virtualization, reactive, createSignal } from '@motifx/core';

const earlyCart = reactive({ count: 1 });
const earlyTheme = createSignal('light');
const earlyProps = reactive({ title: 'x' });

class ThemeService {
    theme = earlyTheme;
}

class CartView extends Component {
    cart = earlyCart;
    constructor() { super('section'); }
}

describe('devtools stores created before devtools was enabled', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(ThemeService, ThemeService);
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

    const pathOf = (c: Component) => hook().pathOfElement(c.element);

    test('a store held by a component field is picked up with its holder and can be read and written', () => {
        const view = new CartView();
        run(view);
        const entry = hook().getStores().find((s: any) => s.value === earlyCart);
        expect(entry).toMatchObject({ type: 'reactive', name: 'reactive', holders: [{ kind: 'component', path: pathOf(view), type: 'CartView', field: 'cart' }] });
        expect(hook().readStore(entry.id, []).value.entries).toEqual([{ key: 'count', value: 1 }]);
        expect(hook().setStoreValue(entry.id, ['count'], 2)).toEqual({ ok: true });
        expect(earlyCart.count).toBe(2);
        expect(hook().getStores().filter((s: any) => s.value === earlyCart)).toHaveLength(1);
    });

    test('a signal held by a service field is picked up', () => {
        const c = new Component('div');
        run(c);
        c.getService(ThemeService);
        const entry = hook().getStores().find((s: any) => s.type === 'signal' && s.holders.some((h: any) => h.kind === 'service'));
        expect(entry).toMatchObject({ value: 'light', holders: [{ kind: 'service', token: 'ThemeService', lifetime: 'singleton', field: 'theme' }] });
    });

    test('reactive props and the state of Virtualization are not picked up', () => {
        app.useDevelopment(false);
        const plain = new Component('div', earlyProps as any);
        const virt = new Virtualization<any>({ itemHeight: 20, pageSize: 2, autoRefresh: false, dataRequest: async () => ({ items: [], totalCount: 0, hasMore: false }) } as any);
        app.useDevelopment(true);
        run(plain, virt);
        const values = hook().getStores().map((s: any) => s.value);
        expect(values).not.toContain(earlyProps);
        expect(values).not.toContain((virt as any)._state);
    });
});
