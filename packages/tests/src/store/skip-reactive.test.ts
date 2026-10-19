/**
 * @jest-environment jsdom
 */
import { Application, Component, ServiceProvider, reactive } from '@motifx/core';

const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };
const IS_REACTIVE = Symbol.for('motif.isReactive');
const isProxy = (o: any) => !!(o && o[IS_REACTIVE]);

describe('reactive: what is wrapped and what is returned as it is', () => {
    test.each(['Control', 'RouteManager', 'ServiceManager', 'Foo'])('a user class named %s becomes reactive and its binding stays live', async (name) => {
        const Cls = ({ [name]: class { x = 1; } })[name] as any;
        expect(Cls.name).toBe(name);
        const s = reactive(new Cls());
        expect(isProxy(s)).toBe(true);

        const host = document.body.appendChild(document.createElement('div'));
        const root = new Component(host as any);
        root.build();
        const p = new Component('p', { initializeComponent: (x: any) => x.bindings.text(() => String(s.x)) });
        root.controls.add(p);
        await settle();
        expect((p.element as HTMLElement).textContent).toBe('1');
        s.x = 2;
        await settle();
        expect((p.element as HTMLElement).textContent).toBe('2');
        root.dispose();
        host.remove();
    });

    test('a user class instance nested in reactive state is reactive too', async () => {
        class Control { x = 1; }
        const s = reactive({ ctrl: new Control() });
        expect(isProxy(s.ctrl)).toBe(true);
    });

    test('component, application, service provider and router are returned as they are', () => {
        const app = Application.CreateBuilder().build();
        const comp = new Component('div');
        expect(reactive(comp)).toBe(comp);
        expect(reactive(app)).toBe(app);
        expect(reactive(app.provider)).toBe(app.provider);
        expect(reactive(app.router)).toBe(app.router);
        expect(isProxy(reactive(comp))).toBe(false);

        const s = reactive({ page: comp, app, provider: app.provider, router: app.router, plain: { a: 1 } });
        expect(s.page).toBe(comp);
        expect(s.app).toBe(app);
        expect(s.provider).toBe(app.provider);
        expect(s.router).toBe(app.router);
        expect(isProxy(s.plain)).toBe(true);
        expect(app.provider).toBeInstanceOf(ServiceProvider);
        app.dispose();
    });

    test('a field that holds a component is still tracked as a field', async () => {
        const a = new Component('i');
        const b = new Component('b');
        const s = reactive({ page: a as Component });
        let runs = 0;
        const host = document.body.appendChild(document.createElement('div'));
        const root = new Component(host as any);
        root.build();
        const p = new Component('p', { initializeComponent: (x: any) => x.bindings.method(() => { runs++; return s.page; }) });
        root.controls.add(p);
        await settle();
        expect((p.element as HTMLElement).querySelector('i')).not.toBeNull();
        s.page = b;
        await settle();
        expect(runs).toBe(2);
        expect((p.element as HTMLElement).querySelector('b')).not.toBeNull();
        root.dispose();
        host.remove();
    });
});
