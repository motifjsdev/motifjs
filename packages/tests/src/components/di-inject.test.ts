import { inject, Injectable, MotifError, ServiceCollection } from '@motifx/core';

class Config {
    url = '/api';
}

class Logger {
    lines: string[] = [];
    log(line: string) { this.lines.push(line); }
}

function thrown(fn: () => unknown): any {
    try {
        fn();
    } catch (error) {
        return error;
    }
    throw new Error('expected an error');
}

describe('inject()', () => {
    test('resolves dependencies in field initializers and the constructor', () => {
        class Api {
            private config = inject(Config);
            readonly logger = inject(Logger);
            readonly base: string;
            constructor() {
                this.base = this.config.url;
                this.logger.log('ready');
            }
        }
        const services = new ServiceCollection();
        services.addSingleton(Config, Config);
        services.addSingleton(Logger, Logger);
        services.addTransient(Api, Api);
        const provider = services.buildServiceProvider();

        const api = provider.get<Api>(Api);
        expect(api.base).toBe('/api');
        expect(api.logger).toBe(provider.get(Logger));
        expect(api.logger.lines).toEqual(['ready']);
    });

    test('works on a class registered with the standard @Injectable decorator', () => {
        @Injectable({ lifetime: 'singleton' })
        class Store {
            readonly logger = inject(Logger);
        }
        const services = new ServiceCollection();
        services.addSingleton(Logger, Logger);
        const provider = services.buildServiceProvider();

        const store = provider.get<Store>(Store);
        expect(store.logger).toBe(provider.get(Logger));
        expect(provider.get(Store)).toBe(store);
    });

    test('resolves scoped services from the scope that constructs the service', () => {
        class Session { }
        class Page {
            readonly session = inject(Session);
        }
        const services = new ServiceCollection();
        services.addScoped(Session, Session);
        services.addTransient(Page, Page);
        const root = services.buildServiceProvider();
        const a = root.createScope('a');
        const b = root.createScope('b');

        expect(a.get<Page>(Page).session).toBe(a.get(Session));
        expect(b.get<Page>(Page).session).toBe(b.get(Session));
        expect(a.get(Session)).not.toBe(b.get(Session));
    });

    test('nested construction restores the outer context', () => {
        class Inner {
            readonly logger = inject(Logger);
        }
        class Outer {
            readonly inner = inject(Inner);
            readonly config = inject(Config);
        }
        const services = new ServiceCollection();
        services.addSingleton(Config, Config);
        services.addSingleton(Logger, Logger);
        services.addTransient(Inner, Inner);
        services.addTransient(Outer, Outer);
        const provider = services.buildServiceProvider();

        const outer = provider.get<Outer>(Outer);
        expect(outer.inner.logger).toBe(provider.get(Logger));
        expect(outer.config).toBe(provider.get(Config));
    });

    test('throws MJX409 outside a service construction', () => {
        const error = thrown(() => inject(Config));
        expect(error).toBeInstanceOf(MotifError);
        expect(error.code).toBe('MJX409');
        expect(error.message).toContain('inject(Config)');
    });

    test('throws MJX409 when the class is constructed by hand', () => {
        class Api {
            readonly config = inject(Config);
        }
        expect(thrown(() => new Api()).code).toBe('MJX409');
    });

    test('throws MJX409 after construction has finished', () => {
        class Api {
            later() { return inject(Config); }
        }
        const services = new ServiceCollection();
        services.addSingleton(Config, Config);
        services.addTransient(Api, Api);
        const api = services.buildServiceProvider().get<Api>(Api);
        expect(thrown(() => api.later()).code).toBe('MJX409');
    });

    test('detects cycles through inject()', () => {
        class A { b = inject(B); }
        class B { a = inject(A); }
        const services = new ServiceCollection();
        services.addTransient(A, A);
        services.addTransient(B, B);
        const error = thrown(() => services.buildServiceProvider().get(A));
        expect(error.code).toBe('MJX404');
    });

    test('reports an unregistered token with MJX401', () => {
        class Api { readonly config = inject(Config); }
        const services = new ServiceCollection();
        services.addTransient(Api, Api);
        expect(thrown(() => services.buildServiceProvider().get(Api)).code).toBe('MJX401');
    });

    test('works inside factories', () => {
        class Api {
            constructor(readonly url: string) { }
        }
        const services = new ServiceCollection();
        services.addSingleton(Config, Config);
        services.addTransient(Api, { useFactory: () => new Api(inject(Config).url) });
        expect(services.buildServiceProvider().get<Api>(Api).url).toBe('/api');
    });

    test('works with getAsync', async () => {
        class Api {
            readonly config = inject(Config);
        }
        const services = new ServiceCollection();
        services.addSingleton(Config, Config);
        services.addTransient(Api, Api);
        const provider = services.buildServiceProvider();
        const api = await provider.getAsync<Api>(Api);
        expect(api.config).toBe(provider.get(Config));
    });
});

describe('deps', () => {
    test('passes dependencies to the constructor in order', () => {
        @Injectable({ deps: [Config, Logger] })
        class Api {
            constructor(readonly config: Config, readonly logger: Logger) { }
        }
        const services = new ServiceCollection();
        services.addSingleton(Config, Config);
        services.addSingleton(Logger, Logger);
        const provider = services.buildServiceProvider();

        const api = provider.get<Api>(Api);
        expect(api.config).toBe(provider.get(Config));
        expect(api.logger).toBe(provider.get(Logger));
    });

    test('a class with a constructor parameter and no deps receives undefined', () => {
        @Injectable()
        class Api {
            constructor(readonly config?: Config) { }
        }
        const services = new ServiceCollection();
        services.addSingleton(Config, Config);
        expect(services.buildServiceProvider().get<Api>(Api).config).toBeUndefined();
    });
});
