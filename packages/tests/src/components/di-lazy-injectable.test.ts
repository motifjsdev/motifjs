/**
 * @jest-environment jsdom
 *
 * S1 — `@Injectable` otomatik kaydı yalnızca `build()` anında yüklü sınıfları kapsıyordu.
 *
 * `Injectable` dekoratörü sınıfı modül seviyesindeki `autoRegistry`'ye yazar;
 * `autoRegisterInjectables()` bu haritayı yalnızca `builder.build()` sırasında bir kez
 * dolaşır. Tembel yüklenen bir sayfanın (`() => import('./pages/Home')`) servisi build'den
 * SONRA tanımlandığından haritaya girer ama kimse okumazdı → `provider.get` "not
 * registered" fırlatır, `ComponentBase.getService` null döner.
 */
import { Component, Injectable, ServiceCollection } from '@motifx/core';

describe('lazy @Injectable registration (S1)', () => {
    it('resolves a class decorated AFTER the provider was built', () => {
        const services = new ServiceCollection();
        services.autoRegisterInjectables();               // builder.build() anını taklit eder
        const provider = services.buildServiceProvider();

        // "Tembel modül" build'den sonra yüklendi: dekoratör şimdi çalışıyor.
        class LateService { public value = 42; }
        Injectable({ lifetime: 'singleton' })(LateService as any);

        const instance = provider.get<LateService>(LateService);
        expect(instance).toBeInstanceOf(LateService);
        expect(instance.value).toBe(42);
        // singleton ömrü korunuyor
        expect(provider.get(LateService)).toBe(instance);
    });

    it('honours the declared lifetime for lazily registered services', () => {
        const services = new ServiceCollection();
        services.autoRegisterInjectables();
        const provider = services.buildServiceProvider();

        class TransientService { }
        Injectable()(TransientService as any);            // varsayılan: transient

        expect(provider.get(TransientService)).not.toBe(provider.get(TransientService));
    });

    it('injects lazily registered dependencies of another lazily registered service', () => {
        const services = new ServiceCollection();
        services.autoRegisterInjectables();
        const provider = services.buildServiceProvider();

        class Repo { public rows = [1, 2, 3]; }
        Injectable({ lifetime: 'singleton' })(Repo as any);

        class Facade { constructor(public repo: Repo) { } }
        Injectable({ lifetime: 'singleton', deps: [Repo] })(Facade as any);

        const facade = provider.get<Facade>(Facade);
        expect(facade.repo).toBeInstanceOf(Repo);
        expect(facade.repo.rows).toEqual([1, 2, 3]);
    });

    it('still throws for tokens that were never decorated or registered', () => {
        const services = new ServiceCollection();
        const provider = services.buildServiceProvider();
        class Unknown { }
        expect(() => provider.get(Unknown)).toThrow(/not registered/i);
    });

    it('lets an explicit registration win over the decorator', () => {
        const services = new ServiceCollection();

        class Configured { public origin = 'auto'; }
        Injectable({ lifetime: 'transient' })(Configured as any);

        services.addSingleton(Configured, { useFactory: () => ({ origin: 'explicit' }) });
        services.autoRegisterInjectables();               // build(): açık kayıt ezilmemeli
        const provider = services.buildServiceProvider();

        const a = provider.get<Configured>(Configured);
        expect(a.origin).toBe('explicit');
        expect(provider.get(Configured)).toBe(a);         // singleton olarak kaldı
    });

    it('ComponentBase.getService resolves a lazily decorated service', () => {
        const services = new ServiceCollection();
        services.autoRegisterInjectables();
        const provider = services.buildServiceProvider();

        class NotesService { public items: string[] = []; add(v: string) { this.items.push(v); } }
        Injectable({ lifetime: 'singleton' })(NotesService as any);

        const page = new Component<HTMLDivElement>('div');
        (page as any).provider = provider;                // Application.run'ın yaptığına eşdeğer
        page.build();

        const svc = page.getService<NotesService>(NotesService);
        expect(svc).not.toBeNull();
        svc!.add('ilk not');
        expect(page.getService<NotesService>(NotesService)!.items).toEqual(['ilk not']);
        page.dispose();
    });
});
