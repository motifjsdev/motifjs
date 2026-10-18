/**
 * @jest-environment jsdom
 */
import { Application, Component, FromService, ServiceProvider, inject } from '@motifx/core';

function finished(done: Promise<void>, ms = 2000): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<boolean>(r => { timer = setTimeout(() => r(false), ms); });
    return Promise.race([done.then(() => true), late]).finally(() => clearTimeout(timer));
}

afterEach(() => { document.body.innerHTML = ''; });

class Store {
    disposed = 0;
    dispose() { this.disposed++; }
}

class Session {
    readonly app = inject(Application);
}

class Telemetry {
    constructor(readonly app: Application) { }
}

class PluginHost {
    disposed = 0;
    constructor(readonly services: ServiceProvider) { }
    dispose() { this.disposed++; }
}

function start() {
    const builder = Application.CreateBuilder();
    builder.services.addSingleton(Store, Store);
    builder.services.addSingleton(Session, Session);
    builder.services.addSingleton(Telemetry, { useClass: Telemetry, deps: [Application] });
    builder.services.addSingleton(PluginHost, { useClass: PluginHost, deps: [ServiceProvider] });
    const app = builder.build();
    const root = new Component('main');
    app.run(document.body.appendChild(document.createElement('div')), root);
    return { app, root };
}

const routes: [string, (app: Application, root: Component) => unknown][] = [
    ['provider.get', app => app.provider.get(Application)],
    ['getService', (_, root) => root.getService(Application)],
    ['FromService', () => FromService(Application)],
    ['inject', app => app.provider.get(Session).app],
    ['deps', app => app.provider.get(Telemetry).app],
];

describe('app.dispose() after the Application was resolved through DI', () => {
    test.each(routes)('%s: finishes, disposes the singletons cached after it and clears Application.main', async (_, resolve) => {
        const { app, root } = start();
        expect(resolve(app, root)).toBe(app);
        const store = app.provider.get(Store);

        expect(await finished(app.dispose())).toBe(true);
        expect(app.state).toBe('disposed');
        expect(Application.main).toBeNull();
        expect(store.disposed).toBe(1);
    });
});

describe('app.dispose() after the ServiceProvider was resolved through DI', () => {
    test('the provider is disposed once and every singleton once, also one cached before the provider', async () => {
        const { app } = start();
        const provider = app.provider;
        const store = provider.get(Store);
        const plugins = provider.get(PluginHost);
        expect(plugins.services).toBe(provider);

        const original = provider.dispose.bind(provider);
        let calls = 0;
        provider.dispose = () => (++calls > 3 ? Promise.resolve() : original());

        expect(await finished(app.dispose())).toBe(true);
        expect(calls).toBe(1);
        expect(store.disposed).toBe(1);
        expect(plugins.disposed).toBe(1);
        expect(app.state).toBe('disposed');
    });
});
