/**
 * @jest-environment jsdom
 */
import { Application, Component, Injectable, MotifError, ServiceProvider } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

let app: Application | null = null;

afterEach(async () => {
    if (app) await app.dispose();
    app = null;
    document.body.innerHTML = '';
});

function host(): HTMLElement {
    return document.body.appendChild(document.createElement('div'));
}

describe('startup singletons', () => {
    test('a decorated startup singleton is created by run() without being resolved', () => {
        let made = 0;
        class Telemetry { constructor() { made++; } }
        Injectable({ lifetime: 'singleton', startup: true })(Telemetry as any);

        const builder = Application.CreateBuilder();
        app = builder.build();
        expect(made).toBe(0);
        app.run(host());
        expect(made).toBe(1);
        expect(app.provider.get(Telemetry)).toBe(app.provider.get(Telemetry));
        expect(made).toBe(1);
    });

    test('an explicit registration takes startup in the object form for useClass and useFactory', () => {
        const created: string[] = [];
        class Clock { constructor() { created.push('clock'); } }
        class Feed { constructor() { created.push('feed'); } }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Clock, { useClass: Clock, startup: true });
        builder.services.addSingleton(Feed, { useFactory: () => new Feed(), startup: true });
        app = builder.build();
        app.run(host());
        expect(created).toEqual(['clock', 'feed']);
    });

    test('a singleton without startup is still created on first resolve', () => {
        let made = 0;
        class Cache { constructor() { made++; } }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Cache, Cache);
        app = builder.build();
        app.run(host());
        expect(made).toBe(0);
        app.provider.get(Cache);
        expect(made).toBe(1);
    });

    test('a startup singleton resolved before run() is not created again and components see the same instance', () => {
        let made = 0;
        class Session { constructor() { made++; } }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Session, { useClass: Session, startup: true });
        app = builder.build();
        const early = app.provider.get(Session);
        const root = new Component('main');
        app.run(host(), root);
        expect(made).toBe(1);
        expect(root.getService(Session)).toBe(early);
    });

    test('startup singletons are created in registration order with their dependencies first', () => {
        const created: string[] = [];
        class Storage { constructor() { created.push('storage'); } }
        class Config { constructor(readonly storage: Storage) { created.push('config'); } }
        class Layout { constructor() { created.push('layout'); } }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Config, { useClass: Config, deps: [Storage], startup: true });
        builder.services.addSingleton(Layout, { useClass: Layout, startup: true });
        builder.services.addSingleton(Storage, Storage);
        app = builder.build();
        app.run(host());
        expect(created).toEqual(['storage', 'config', 'layout']);
    });

    test('a startup singleton can use the application and the provider', () => {
        class Shell {
            constructor(readonly application: Application, readonly services: ServiceProvider) { }
        }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Shell, { useClass: Shell, deps: [Application, ServiceProvider], startup: true });
        app = builder.build();
        app.run(host());
        const shell = app.provider.get(Shell);
        expect(shell.application).toBe(app);
        expect(shell.services).toBe(app.provider);
    });

    test('an async factory with startup throws MJX402 from run()', () => {
        const builder = Application.CreateBuilder();
        builder.services.addSingleton('remote', { useFactory: async () => ({ ready: true }), startup: true });
        app = builder.build();
        let error: any = null;
        try { app.run(host()); } catch (e) { error = e; }
        expect(error).toBeInstanceOf(MotifError);
        expect(error.code).toBe('MJX402');
        expect(app.state).toBe('initializing');
    });

    test('a startup constructor that throws stops run()', () => {
        const failure = new Error('no storage');
        class Broken { constructor() { throw failure; } }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Broken, { useClass: Broken, startup: true });
        app = builder.build();
        expect(() => app!.run(host())).toThrow(failure);
        expect(app.state).toBe('initializing');
    });

    test('startup on a transient or scoped registration warns with MJX415 in development and is ignored', () => {
        let made = 0;
        class Draft { constructor() { made++; } }
        class Wizard { constructor() { made++; } }
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis as any).__MOTIF_DEV__ = true;
        try {
            const builder = Application.CreateBuilder();
            builder.services.addTransient(Draft, { useClass: Draft, startup: true });
            builder.services.addScoped(Wizard, { useClass: Wizard, startup: true });
            app = builder.build();
            app.run(host());
            expect(made).toBe(0);
            const messages = warn.mock.calls.map(c => String(c[0]));
            expect(messages).toContain("[motifjs] MJX415: 'startup' only applies to singleton services; 'Draft' is registered as transient and is created when it is first resolved.");
            expect(messages).toContain("[motifjs] MJX415: 'startup' only applies to singleton services; 'Wizard' is registered as scoped and is created when it is first resolved.");
        } finally {
            delete (globalThis as any).__MOTIF_DEV__;
            warn.mockRestore();
        }
    });

    test('a class decorated with startup between build() and run() is created by run()', () => {
        let made = 0;
        const builder = Application.CreateBuilder();
        app = builder.build();
        class Presence { constructor() { made++; } }
        Injectable({ lifetime: 'singleton', startup: true })(Presence as any);
        expect(made).toBe(0);
        app.run(host());
        expect(made).toBe(1);
    });

    test('an explicit registration still wins over a startup decorator', () => {
        const created: string[] = [];
        class Uplink { constructor() { created.push('decorated'); } }
        Injectable({ lifetime: 'singleton', startup: true })(Uplink as any);
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Uplink, { useFactory: () => { created.push('explicit'); return {}; } });
        app = builder.build();
        app.run(host());
        expect(created).toEqual([]);
        app.provider.get(Uplink);
        expect(created).toEqual(['explicit']);
    });

    test('a class decorated with startup after run() is created on first resolve', () => {
        let made = 0;
        const builder = Application.CreateBuilder();
        app = builder.build();
        app.run(host());
        class LatePanel { constructor() { made++; } }
        Injectable({ lifetime: 'singleton', startup: true })(LatePanel as any);
        expect(made).toBe(0);
        app.provider.get(LatePanel);
        expect(made).toBe(1);
    });

    test('replace keeps startup unless the new registration sets it', () => {
        const created: string[] = [];
        class Sync { constructor() { created.push('sync'); } }
        class FakeSync { constructor() { created.push('fake'); } }
        class Beacon { constructor() { created.push('beacon'); } }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Sync, { useClass: Sync, startup: true });
        builder.services.addSingleton(Beacon, { useClass: Beacon, startup: true });
        builder.services.replace(Sync, FakeSync);
        builder.services.replace(Beacon, { useClass: Beacon, startup: false });
        app = builder.build();
        app.run(host());
        expect(created).toEqual(['fake']);
    });
});

describe('startup singletons and rebuild()', () => {
    test('rebuild() after run() creates startup singletons again in the new provider that components resolve from', async () => {
        const instances: Clock[] = [];
        class Clock {
            disposed = 0;
            constructor(readonly services: ServiceProvider) { instances.push(this); }
            dispose() { this.disposed++; }
        }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Clock, { useClass: Clock, deps: [ServiceProvider], startup: true });
        app = builder.build();
        const root = new Component('main');
        app.run(host(), root);
        const first = root.getService(Clock)!;
        expect(instances).toEqual([first]);

        const previous = app.provider;
        builder.rebuild();
        expect(app.provider).not.toBe(previous);
        expect(instances.length).toBe(2);
        const second = instances[1];
        expect(second.services).toBe(app.provider);
        expect(root.getService(Clock)).toBe(second);
        expect(root.serviceProvider).toBe(app.provider);
        expect(app.provider.get(ServiceProvider)).toBe(app.provider);
        await tick();
        expect(first.disposed).toBe(1);
        expect(second.disposed).toBe(0);
    });

    test('rebuild() before run() leaves startup to run()', () => {
        let made = 0;
        class Clock { constructor() { made++; } }
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Clock, { useClass: Clock, startup: true });
        app = builder.build();
        builder.rebuild();
        expect(made).toBe(0);
        app.run(host());
        expect(made).toBe(1);
    });
});
