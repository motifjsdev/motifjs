/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive, createSignal, createComputed } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0));

class Tag extends Component {
    constructor(props: any) { super('span', props); }
}

describe('devtools writes', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
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

    const el = (c: Component) => c.element as HTMLElement;

    test('setClass adds and removes a class', () => {
        const c = new Component('div');
        run(c);
        expect(hook().setClass([0, 0], 'hot', true)).toEqual({ ok: true, value: true });
        expect(el(c).classList.contains('hot')).toBe(true);
        expect(hook().setClass([0, 0], 'hot', false)).toEqual({ ok: true, value: false });
        expect(el(c).classList.contains('hot')).toBe(false);
    });

    test('setAttribute writes and removes an attribute and refuses event attributes', () => {
        const c = new Component('div');
        run(c);
        expect(hook().setAttribute([0, 0], 'title', 'hello')).toEqual({ ok: true });
        expect(el(c).getAttribute('title')).toBe('hello');
        expect(hook().setAttribute([0, 0], 'title', null)).toEqual({ ok: true });
        expect(el(c).hasAttribute('title')).toBe(false);
        expect(hook().setAttribute([0, 0], 'onclick', 'alert(1)').ok).toBe(false);
        expect(el(c).hasAttribute('onclick')).toBe(false);
    });

    test('setVisible hides and shows a component', async () => {
        const c = new Component('div');
        run(c);
        expect(await hook().setVisible([0, 0], false)).toEqual({ ok: true, value: false });
        expect(el(c).isConnected).toBe(false);
        expect(await hook().setVisible([0, 0], true)).toEqual({ ok: true, value: true });
        expect(el(c).isConnected).toBe(true);
    });

    test('writeModel writes through a model binding and leaves components without one untouched', () => {
        const state = reactive({ name: 'a' });
        const input = new Component('input');
        input.bindings.model(state, 'name');
        const bare = new Component('div');
        run(input, bare);
        expect(hook().writeModel([0, 0], 'b')).toEqual({ ok: true });
        expect(state.name).toBe('b');
        expect(hook().writeModel([0, 1], 'x').ok).toBe(false);
        expect((bare as any)._bindings).toBeUndefined();
    });

    test('setProp on plain props reruns the bindings through setState', async () => {
        const t = new Tag({ label: 'a' });
        t.bindings.text(() => String((t.props as any).label));
        run(t);
        expect(el(t).textContent).toBe('a');
        expect(hook().setProp([0, 0], ['label'], 'b').ok).toBe(true);
        await settle();
        expect(el(t).textContent).toBe('b');
    });

    test('setProp writes a nested key of reactive props and refuses blocked keys', async () => {
        const t = new Tag(reactive({ data: { label: 'a' } }));
        t.bindings.text(() => String((t.props as any).data.label));
        run(t);
        expect(hook().setProp([0, 0], ['data', 'label'], 'z').ok).toBe(true);
        await settle();
        expect(el(t).textContent).toBe('z');
        expect(hook().setProp([0, 0], ['__proto__', 'x'], 1).ok).toBe(false);
    });

    test('navigate changes the route', async () => {
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/next', control: () => new Component('p') }] });
        app.run(host);
        await settle();
        expect(await hook().navigate('/next')).toEqual({ ok: true, value: true });
        expect(hook().getRoute().uri).toBe('/next');
    });

    test('setStoreValue writes a nested key of a reactive store by its id and refuses bad keys', async () => {
        const store = reactive({ user: { name: 'a' } });
        const c = new Component('span');
        c.bindings.text(() => store.user.name);
        run(c);
        const id = hook().getStores().find((s: any) => s.value === store).id;
        expect(hook().setStoreValue(id, ['user', 'name'], 'b')).toEqual({ ok: true });
        await settle();
        expect(el(c).textContent).toBe('b');
        expect(hook().setStoreValue(id, ['__proto__', 'polluted'], 1).ok).toBe(false);
        expect(({} as any).polluted).toBeUndefined();
        expect(hook().setStoreValue(id, [], 1).ok).toBe(false);
    });

    test('setStoreValue still finds the store after other stores are created', () => {
        const store = reactive({ n: 1 });
        const id = hook().getStores().find((s: any) => s.value === store).id;
        const others = [];
        for (let i = 0; i < 250; i++) others.push(reactive({ n: 0 }));
        expect(hook().setStoreValue(id, ['n'], 2)).toEqual({ ok: true });
        expect(store.n).toBe(2);
        expect(others.every(o => o.n === 0)).toBe(true);
    });

    test('setStoreValue writes a signal and a key inside its value', async () => {
        const theme = createSignal('light');
        const user = createSignal({ name: 'a' });
        const c = new Component('span');
        c.bindings.text(() => `${theme.value} ${user.value.name}`);
        run(c);
        const list = hook().getStores();
        const themeId = list.find((s: any) => s.type === 'signal' && s.value === 'light').id;
        const userId = list.find((s: any) => s.type === 'signal' && s.value?.name === 'a').id;
        expect(hook().setStoreValue(themeId, [], 'dark')).toEqual({ ok: true });
        expect(hook().setStoreValue(userId, ['name'], 'b')).toEqual({ ok: true });
        await settle();
        expect(theme.peek()).toBe('dark');
        expect(el(c).textContent).toBe('dark b');
    });

    test('setStoreValue refuses a computed and an unknown id', () => {
        const s = createSignal(1);
        const doubled = createComputed(() => s.value * 2);
        doubled.value;
        const id = hook().getStores().find((x: any) => x.type === 'computed').id;
        expect(hook().setStoreValue(id, [], 5).ok).toBe(false);
        expect(hook().setStoreValue(-1, ['n'], 5).ok).toBe(false);
    });

    test('an unknown path or a disposed component gives ok false', async () => {
        const c = new Component('div');
        run(c);
        expect(hook().setClass([9], 'x', true).ok).toBe(false);
        await c.dispose();
        expect(hook().setClass([0, 0], 'x', true).ok).toBe(false);
    });
});
