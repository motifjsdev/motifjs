/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive, createSignal } from '@motifx/core';

class Svc { n = 1; }

class Panel extends Component {
    state = reactive({ open: false, tabs: ['a', 'b'] });
    title = 'Orders';
    private _cache = 3;
    constructor() { super('section'); }
    get cache() { return this._cache; }
}

describe('devtools component fields and store reads', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Svc, Svc);
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

    const settle = () => new Promise(r => setTimeout(r, 0));
    const pathOf = (c: Component) => hook().pathOfElement(c.element);
    const storeId = (value: unknown) => hook().getStores().find((s: any) => s.value === value).id;

    test('inspect lists the fields of a class component and none of the framework fields', () => {
        const panel = new Panel();
        run(panel);
        const fields = hook().inspect(pathOf(panel)).fields;
        expect(Object.keys(fields)).toEqual(['state', 'title', '_cache']);
        expect(fields.title).toBe('Orders');
        expect(fields._cache).toBe(3);
        expect(fields.state).toMatchObject({ kind: 'object', keys: 2 });
    });

    test('a plain component using framework features has no fields', async () => {
        const s = reactive({ show: true, items: [1, 2], cls: 'a', text: 'x' });
        const plain = new Component('div');
        plain.class.add('static');
        plain.class.add(() => s.cls);
        plain.style(() => ({ color: 'red' }) as any);
        plain.motif.on('click', () => { });
        plain.bindings.text(() => s.text);
        plain.bindings.wait(() => !s.show);
        plain.bindings.watch(() => s.cls);
        const list = new Component('ul');
        list.bindings.list(() => s.items, (i: any) => new Component('li'));
        const input = new Component('input');
        input.bindings.model(s, 'text');
        run(plain, list, input);
        plain.getService(Svc);
        s.show = false; s.items.push(3); s.cls = 'b';
        await settle();
        s.show = true;
        await settle();
        for (const c of [plain, list, input]) expect(hook().inspect(pathOf(c)).fields).toEqual({});
    });

    test('readValue opens a field one level', () => {
        const panel = new Panel();
        run(panel);
        const r = hook().readValue(pathOf(panel), 'fields', ['state']);
        expect(r.ok).toBe(true);
        expect(r.value.entries.map((e: any) => e.key)).toEqual(['open', 'tabs']);
        expect(hook().readValue(pathOf(panel), 'fields', ['state', 'tabs']).value.entries.map((e: any) => e.value)).toEqual(['a', 'b']);
        expect(hook().readValue(pathOf(panel), 'fields', ['element']).ok).toBe(false);
    });

    test('a getter field is listed as a getter and never called', () => {
        let calls = 0;
        const panel = new Panel();
        Object.defineProperty(panel, 'live', { enumerable: true, get() { calls++; return { a: 1 }; } });
        run(panel);
        expect(hook().inspect(pathOf(panel)).fields.live).toEqual({ kind: 'getter' });
        expect(hook().readValue(pathOf(panel), 'fields', ['live'])).toEqual({ ok: false, error: 'getter' });
        expect(calls).toBe(0);
    });

    test('readStore opens a reactive store, a nested key and a Map inside it', () => {
        const store = reactive({ user: { name: 'ada' }, tags: new Map([['x', 1]]) });
        run(new Component('div'));
        const id = storeId(store);
        expect(hook().readStore(id, []).value.entries.map((e: any) => e.key)).toEqual(['user', 'tags']);
        expect(hook().readStore(id, ['user']).value.entries).toEqual([{ key: 'name', value: 'ada' }]);
        expect(hook().readStore(id, ['tags']).value.entries).toEqual([{ key: 'x', value: 1 }]);
    });

    test('readStore opens a signal holding an object and shows a primitive signal value', () => {
        const user = createSignal({ name: 'ada', age: 3 });
        const theme = createSignal('dark');
        run(new Component('div'));
        const list = hook().getStores();
        const userId = list.find((s: any) => s.type === 'signal' && s.value?.name === 'ada').id;
        const themeId = list.find((s: any) => s.type === 'signal' && s.value === 'dark').id;
        expect(hook().readStore(userId, []).value.entries.map((e: any) => e.key)).toEqual(['name', 'age']);
        expect(hook().readStore(themeId, [])).toEqual({ ok: true, value: { value: 'dark', entries: [], total: 0 } });
        expect(user.peek().name).toBe('ada');
        expect(theme.peek()).toBe('dark');
    });

    test('readStore refuses an unknown id and a blocked key', () => {
        const store = reactive({ a: { b: 1 } });
        run(new Component('div'));
        expect(hook().readStore(-1, []).ok).toBe(false);
        expect(hook().readStore(storeId(store), ['__proto__'])).toEqual({ ok: false, error: 'invalid key' });
    });
});
