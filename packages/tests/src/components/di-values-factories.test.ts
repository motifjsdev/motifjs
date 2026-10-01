import { Application, Component, FromService, MotifError, ServiceCollection, errorHandler } from '@motifx/core';

const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

function format(x: unknown) { return 'f' + x; }
class Plugin { }

describe('only useClass is constructed', () => {
    test('useValue returns the same function from get and getAsync', async () => {
        const services = new ServiceCollection();
        services.addSingleton('fmt', { useValue: format });
        services.addSingleton('pluginType', { useValue: Plugin });
        const provider = services.buildServiceProvider();

        expect(provider.get('fmt')).toBe(format);
        expect(await services.buildServiceProvider().getAsync('fmt')).toBe(format);
        expect(provider.get('pluginType')).toBe(Plugin);
        expect(await services.buildServiceProvider().getAsync('pluginType')).toBe(Plugin);
    });

    test('a factory result is returned as is', async () => {
        const arrow = (x: number) => x * 2;
        const services = new ServiceCollection();
        services.addSingleton('class', { useFactory: () => Plugin });
        services.addSingleton('function', { useFactory: () => format });
        services.addSingleton('arrow', { useFactory: () => arrow });
        services.addSingleton('asyncClass', { useFactory: async () => Plugin });
        const provider = services.buildServiceProvider();

        expect(provider.get('class')).toBe(Plugin);
        expect(provider.get('function')).toBe(format);
        expect(provider.get('arrow')).toBe(arrow);
        expect(await services.buildServiceProvider().getAsync('class')).toBe(Plugin);
        expect(await provider.getAsync('asyncClass')).toBe(Plugin);
    });

    test('useClass is constructed by get and getAsync', async () => {
        const services = new ServiceCollection();
        services.addTransient(Plugin, Plugin);
        const provider = services.buildServiceProvider();

        expect(provider.get(Plugin)).toBeInstanceOf(Plugin);
        expect(await provider.getAsync(Plugin)).toBeInstanceOf(Plugin);
    });
});

describe('registration warnings', () => {
    const register = () => {
        const services = new ServiceCollection();
        services.addSingleton('both', { useValue: 1, useFactory: () => 2 });
        services.addSingleton('badDeps', { useClass: Plugin, deps: 'x' as any });
        services.addSingleton('fnValue', { useValue: format });
    };

    test('coded warnings in development', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis as any).__MOTIF_DEV__ = true;
        try {
            register();
            expect(warn.mock.calls.map(c => String(c[0]))).toEqual([
                "[motifjs] MJX410: Multiple sources provided for token 'both': useFactory, useValue. Resolution order is useValue > useFactory > useClass.",
                "[motifjs] MJX411: 'deps' must be an array for token 'badDeps'; the invalid deps are ignored.",
            ]);
        } finally {
            delete (globalThis as any).__MOTIF_DEV__;
            warn.mockRestore();
        }
    });

    test('no warning outside development', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        try {
            register();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

describe('router and registered route components', () => {
    class Missing { }

    const run = async (register: (app: Application) => void, control: any) => {
        window.history.replaceState({}, '', '/a');
        const builder = Application.CreateBuilder();
        register(builder as any);
        const app = builder.build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const received: any[] = [];
        const unbind = errorHandler.addListener(e => received.push(e));
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
        let shown: any = null;
        app.useRouter({ routes: [{ path: '/a', control, onShow: (i: any) => { shown = i; } }] as any });
        app.run(host);
        await tick(200);
        unbind();
        consoleError.mockRestore();
        app.dispose();
        host.remove();
        return { received, shown };
    };

    test('a registered page that cannot be resolved fails the navigation instead of being built without DI', async () => {
        const args: any[] = [];
        class Page extends Component {
            constructor(dep?: unknown) { super('section'); args.push(dep); }
        }
        const { received, shown } = await run(
            (builder: any) => builder.services.addTransient(Page, { useClass: Page, deps: [Missing] }),
            Page
        );

        expect(args).toEqual([]);
        expect(shown).toBeNull();
        const failure = received.find(e => e instanceof MotifError && e.code === 'MJX304');
        expect(failure).toBeDefined();
        expect(failure.cause).toBeInstanceOf(MotifError);
        expect(failure.cause.code).toBe('MJX401');
    });

    test('an unregistered page is still built directly', async () => {
        class Plain extends Component {
            constructor() { super('section'); }
        }
        const { received, shown } = await run(() => { }, Plain);

        expect(shown).toBeInstanceOf(Plain);
        expect(received.some(e => e instanceof MotifError && e.code === 'MJX304')).toBe(false);
    });

    test('a registered page with its dependencies is resolved through DI', async () => {
        class Dep { }
        class Page extends Component {
            constructor(public dep: Dep) { super('section'); }
        }
        const { shown } = await run((builder: any) => {
            builder.services.addSingleton(Dep, Dep);
            builder.services.addTransient(Page, { useClass: Page, deps: [Dep] });
        }, Page);

        expect(shown).toBeInstanceOf(Page);
        expect(shown.dep).toBeInstanceOf(Dep);
    });
});

describe('registering a function directly', () => {
    const codeOf = (fn: () => void) => {
        try { fn(); } catch (error: any) { return error instanceof MotifError ? error.code : String(error); }
        return 'no error';
    };

    test('a function that cannot be constructed fails at registration with MJX413', () => {
        const services = new ServiceCollection();
        const arrow: any = (x: number) => x;
        const asyncFn: any = async () => 1;
        const method: any = ({ m() { return 1; } }).m;
        expect(codeOf(() => services.addSingleton('arrow', arrow))).toBe('MJX413');
        expect(codeOf(() => services.addScoped('async', asyncFn))).toBe('MJX413');
        expect(codeOf(() => services.addTransient('method', method))).toBe('MJX413');
        expect(codeOf(() => services.tryAddSingleton('arrow2', arrow))).toBe('MJX413');
        expect(codeOf(() => services.replace('arrow3', arrow))).toBe('MJX413');
    });

    test('the error names the token and the two correct forms', () => {
        const services = new ServiceCollection();
        let message = '';
        try { services.addSingleton('formatter', ((x: number) => x) as any); } catch (error: any) { message = error.message; }
        expect(message).toBe("[motifjs] MJX413: Service 'formatter' is registered with a function that cannot be constructed. Use { useValue: fn } to provide the function itself or { useFactory: fn } to create the service.");
    });

    test('classes, constructor functions and the explicit forms are accepted', () => {
        function Legacy(this: any) { this.kind = 'legacy'; }
        const services = new ServiceCollection();
        expect(codeOf(() => services.addSingleton(Plugin, Plugin))).toBe('no error');
        expect(codeOf(() => services.addSingleton('legacy', Legacy as any))).toBe('no error');
        expect(codeOf(() => services.addSingleton('bound', Plugin.bind(null) as any))).toBe('no error');
        expect(codeOf(() => services.addSingleton('fn', { useValue: (x: number) => x }))).toBe('no error');
        expect(codeOf(() => services.addSingleton('factory', { useFactory: () => new Plugin() }))).toBe('no error');
        const provider = services.buildServiceProvider();
        expect(provider.get<any>('legacy').kind).toBe('legacy');
    });
});

describe('FromService', () => {
    test('returns null and warns with MJX414 in development when resolution fails', () => {
        class NotRegistered { }
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis as any).__MOTIF_DEV__ = true;
        const app = Application.CreateBuilder().build();
        try {
            expect(FromService(NotRegistered)).toBeNull();
            expect(String(warn.mock.calls[0]?.[0])).toBe("[motifjs] MJX414: FromService failed for token 'NotRegistered': [motifjs] MJX401: Service not registered for token: NotRegistered");
        } finally {
            delete (globalThis as any).__MOTIF_DEV__;
            warn.mockRestore();
            app.dispose();
        }
    });

    test('returns null without a warning outside development', () => {
        class NotRegistered { }
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        const app = Application.CreateBuilder().build();
        try {
            expect(FromService(NotRegistered)).toBeNull();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
            app.dispose();
        }
    });
});
