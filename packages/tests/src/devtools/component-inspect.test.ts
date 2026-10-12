/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive } from '@motifx/core';

class Store { }
class Unused { }

describe('devtools component inspection', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Store, Store);
        builder.services.addSingleton(Unused, Unused);
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

    test('props are previewed without calling getters', () => {
        let calls = 0;
        const other = new Component('p');
        const c = new Component('div', { label: 'a', count: 2, on: true, none: null, read: function readValue() { calls++; return 1; }, list: [1, 2, 3], data: { x: 1, y: 2 }, other } as any);
        run(c, other);
        const before = calls;
        const info = hook().inspect([0, 0]);
        expect(info.props.label).toBe('a');
        expect(info.props.count).toBe(2);
        expect(info.props.on).toBe(true);
        expect(info.props.none).toBeNull();
        expect(info.props.read).toEqual({ kind: 'function', name: 'readValue' });
        expect(info.props.list).toEqual({ kind: 'array', length: 3 });
        expect(info.props.data).toEqual({ kind: 'object', type: 'Object', keys: 2 });
        expect(info.props.other).toEqual({ kind: 'component', path: [0, 1], type: 'Component' });
        expect(calls).toBe(before);
    });

    test('bindings are listed by kind', () => {
        const s = reactive({ text: 'x', items: [1, 2], on: true, w: 1 });
        const c = new Component('div');
        c.bindings.text(() => s.text);
        c.bindings.list(() => s.items, (i: any) => new Component('span'));
        c.bindings.add({ propertyName: '__conditional__', dataSource: null, activate() { }, deactivate() { }, reActivate() { } } as any);
        c.class.add([{ on: () => s.on }]);
        c.style(() => ({ width: s.w + 'px' }));
        run(c);
        const kinds = hook().inspect([0, 0]).bindings.map((b: any) => b.kind);
        expect(kinds).toEqual(expect.arrayContaining(['property', 'list', 'conditional', 'class', 'style']));
        const text = hook().inspect([0, 0]).bindings.find((b: any) => b.kind === 'property');
        expect(text).toMatchObject({ property: 'textContent', updateMode: 'onPropertyChanged', active: true });
    });

    test('dom and component events are listed with their modifiers, removed ones are not', async () => {
        const c = new Component('button');
        run(c);
        await c.motif.on('click:prevent:stop', function save() { });
        await c.motif.on('saved' as any, () => { }, false);
        const gone = () => { };
        await c.motif.on('focus', gone);
        c.motif.off('focus', gone);
        const events = hook().inspect([0, 0]).events;
        expect(events).toContainEqual({ name: 'click:prevent:stop', type: 'click', dom: true, handler: 'save', modifiers: ['prevent', 'stop'] });
        expect(events.find((e: any) => e.type === 'saved')).toMatchObject({ dom: false });
        expect(events.some((e: any) => e.type === 'focus')).toBe(false);
    });

    test('hooks are listed with their method and handler count', () => {
        class Card extends Component {
            constructor() { super('section', { onBuilt: () => { } } as any); }
            onDisposing() { }
        }
        run(new Card());
        const hooks = hook().inspect([0, 0]).hooks;
        expect(hooks).toContainEqual({ name: 'onBuilt', method: false, handlers: 1 });
        expect(hooks).toContainEqual({ name: 'onDisposing', method: true, handlers: 0 });
        expect(hooks.some((h: any) => h.name === 'onConfig')).toBe(false);
    });

    test('static and reactive classes are told apart with the current reactive set', () => {
        const s = reactive({ on: true });
        const c = new Component('div');
        c.class.add('card');
        c.class.add([{ danger: () => s.on }]);
        run(c);
        const classes = hook().inspect([0, 0]).classes;
        expect(classes.static).toEqual(['card']);
        expect(classes.reactive.length).toBe(1);
        expect(classes.reactive[0].classes).toEqual(['danger']);
    });

    test('attributes are listed with whether they are reactive', () => {
        const s = reactive({ t: 'hello' });
        const c = new Component('div');
        c.attr.add({ role: 'note', title: () => s.t });
        run(c);
        const attrs = hook().inspect([0, 0]).attributes;
        expect(attrs.find((a: any) => a.name === 'role')).toMatchObject({ reactive: false });
        expect(attrs.find((a: any) => a.name === 'title')).toMatchObject({ reactive: true });
    });

    test('services asked through getService are listed with the scope', () => {
        const c = new Component('div');
        run(c);
        expect(c.getService(Store)).toBeInstanceOf(Store);
        const services = hook().inspect([0, 0]).services;
        expect(services.requested).toEqual(['Store']);
        expect(services.scope).not.toBeNull();
        expect(typeof services.scope.kind).toBe('string');
    });

    test('services asked while devtools are off are not recorded', () => {
        const c = new Component('div');
        run(c);
        app.useDevelopment(false);
        c.getService(Store);
        app.useDevelopment(true);
        expect(hook().inspect([0, 0]).services.requested).toEqual([]);
    });

    test('getServices lists registrations with their lifetime and whether they were created', () => {
        const c = new Component('div');
        run(c);
        c.getService(Store);
        const list = hook().getServices();
        expect(list).toContainEqual({ token: 'Store', lifetime: 'singleton', created: true });
        expect(list).toContainEqual({ token: 'Unused', lifetime: 'singleton', created: false });
    });

    test('inspect creates nothing on the component', () => {
        const c = new Component('div');
        run(c);
        const before = { b: (c as any)._bindings, k: (c as any)._class };
        hook().inspect([0, 0]);
        expect((c as any)._bindings).toBe(before.b);
        expect((c as any)._class).toBe(before.k);
        const bare = new Component('span');
        c.controls.add(bare);
        const raw = { b: (bare as any)._bindings, k: (bare as any)._class, x: (bare as any)._baseCtx };
        hook().inspect([0, 0, 0]);
        expect((bare as any)._bindings).toBe(raw.b);
        expect((bare as any)._class).toBe(raw.k);
        expect((bare as any)._baseCtx).toBe(raw.x);
    });

    test('an unknown path gives null', () => {
        run();
        expect(hook().inspect([5])).toBeNull();
    });
});
