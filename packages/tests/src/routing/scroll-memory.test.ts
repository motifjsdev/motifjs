/**
 * Kaydırma hafızası testleri (`useRouter({ scrollMemory })`).
 *
 * Ölçülen davranışlar:
 * - varsayılan KAPALI: kapalıyken kaydırmaya hiç dokunulmaz
 * - ziyaret edilen yola dönünce konum geri konur
 * - konum gezinme BAŞLARKEN okunur (içerik değişiminin kırptığı değer yazılmaz)
 * - hiç görülmemiş yol baştan başlar
 * - adresteki çıpa hafızayı ezer
 * - gezinmeye özel `scroll` seçeneği hafızayı ezer
 * - `key` ile aynı sayfanın iki adresi tek anahtarda toplanır
 *
 * jsdom düzen (layout) taklidi yapmaz: `scrollY` daima 0 ve `scrollTo` bir şey
 * kaydırmaz. Bu yüzden pencere sahte bir "belge" ile taklit ediliyor — kaydırma
 * hedefi içerik yüksekliğine göre kırpılıyor, tıpkı tarayıcıdaki gibi.
 */

import { Application, Component } from '@motifx/core';
import { RouteItem } from '@motifx/core';

const createMockControl = () => () => new Component('div');

/** Pencereyi sahte bir kaydırma düzlemine bağlar; `height` içerik yüksekliğidir. */
function installViewport(height = 5000) {
    const state = { top: 0, height };

    Object.defineProperty(window, 'scrollY', {
        configurable: true,
        get: () => state.top,
    });

    const scrollTo = jest.fn((x: any, y?: number) => {
        const target = typeof x === 'object' && x !== null ? Number(x.top ?? 0) : Number(y ?? 0);
        state.top = Math.max(0, Math.min(target, state.height));
    });
    (window as any).scrollTo = scrollTo;

    // Geri koyma döngüsü kare bekler; testte kareyi elle çeviriyoruz.
    const frames: Array<() => void> = [];
    (window as any).requestAnimationFrame = (run: () => void) => {
        frames.push(run);
        return frames.length;
    };
    (window as any).cancelAnimationFrame = (id: number) => {
        frames[id - 1] = () => { };
    };

    return {
        state,
        scrollTo,
        tick(times = 1) {
            for (let i = 0; i < times; i++) {
                const pending = frames.splice(0);
                for (const run of pending) run();
            }
        },
        get pendingFrames() {
            return frames.length;
        },
    };
}

const routes = (): RouteItem[] => [
    { path: '/', control: createMockControl() },
    { path: '/uzun', control: createMockControl() },
    { path: '/kisa', control: createMockControl() },
    { path: '/docs/{slug?:giris}', control: createMockControl() },
];

describe('Scroll memory', () => {
    let app: Application;
    let view: ReturnType<typeof installViewport>;

    beforeEach(() => {
        sessionStorage.clear();
        history.replaceState({}, '', '/');
        view = installViewport();
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
    });

    const run = () => app.run(document.createElement('div'));

    it('varsayılan kapalı: kaydırmaya dokunulmaz', async () => {
        app.useRouter({ routes: routes(), mode: 'history' });
        run();

        await app.router.navigate('/uzun');
        view.state.top = 1200;
        await app.router.navigate('/kisa');

        expect(view.scrollTo).not.toHaveBeenCalled();
        expect(view.state.top).toBe(1200);
    });

    it('ziyaret edilen yola dönünce kaldığı yere kaydırır', async () => {
        app.useRouter({ routes: routes(), mode: 'history', scrollMemory: true });
        run();

        await app.router.navigate('/uzun');
        view.state.top = 1200;

        await app.router.navigate('/kisa');
        expect(view.state.top).toBe(0); // ilk kez görülen yol baştan başlar

        await app.router.navigate('/uzun');
        expect(view.state.top).toBe(1200);
    });

    it('konumu gezinme başlarken okur: içerik değişiminin kırptığı değeri yazmaz', async () => {
        app.useRouter({ routes: routes(), mode: 'history', scrollMemory: true });
        run();

        await app.router.navigate('/uzun');
        view.state.top = 3000;

        // Kısa sayfaya geçiş: içerik yerleşince tarayıcı konumu kırpar.
        await app.router.navigate('/kisa');
        view.state.height = 200;
        view.state.top = Math.min(view.state.top, view.state.height);

        view.state.height = 5000;
        await app.router.navigate('/uzun');
        expect(view.state.top).toBe(3000);
    });

    it('içerik geç çizilse de hedefe kare kare ulaşır', async () => {
        app.useRouter({ routes: routes(), mode: 'history', scrollMemory: true });
        run();

        await app.router.navigate('/uzun');
        view.state.top = 2400;
        await app.router.navigate('/kisa');

        // Dönüşte belge henüz kısa: hedefe ulaşılamaz, döngü kare bekler.
        view.state.height = 300;
        await app.router.navigate('/uzun');
        expect(view.state.top).toBe(300);
        expect(view.pendingFrames).toBe(1);

        // İçerik yerleşti.
        view.state.height = 5000;
        view.tick();
        expect(view.state.top).toBe(2400);
        expect(view.pendingFrames).toBe(0);
    });

    it('hash kipinde ziyaret edilen yola dönünce kaldığı yere kaydırır', async () => {
        app.useRouter({ routes: routes(), mode: 'hash', scrollMemory: true });
        run();

        await app.router.navigate('/uzun');
        view.state.top = 1200;

        await app.router.navigate('/kisa');
        expect(view.state.top).toBe(0);

        await app.router.navigate('/uzun');
        expect(view.state.top).toBe(1200);
    });

    it('hash kipinde rota içi çıpa hafızayı ezer', async () => {
        const target = document.createElement('div');
        target.id = 'bolum';
        const scrollIntoView = jest.fn(function (this: HTMLElement) { view.state.top = 777; });
        (target as any).scrollIntoView = scrollIntoView;
        document.body.appendChild(target);

        try {
            app.useRouter({ routes: routes(), mode: 'hash', scrollMemory: true });
            run();

            await app.router.navigate('/uzun');
            view.state.top = 1500;
            await app.router.navigate('/kisa');

            await app.router.navigate('/uzun#bolum');
            expect(scrollIntoView).toHaveBeenCalled();
            expect(view.state.top).toBe(777);
        } finally {
            target.remove();
        }
    });

    it('adresteki çıpa hafızayı ezer', async () => {
        const target = document.createElement('div');
        target.id = 'bolum';
        const scrollIntoView = jest.fn(function (this: HTMLElement) { view.state.top = 777; });
        (target as any).scrollIntoView = scrollIntoView;
        document.body.appendChild(target);

        try {
            app.useRouter({ routes: routes(), mode: 'history', scrollMemory: true });
            run();

            await app.router.navigate('/uzun');
            view.state.top = 1500;
            await app.router.navigate('/kisa');

            await app.router.navigate('/uzun#bolum');
            expect(scrollIntoView).toHaveBeenCalled();
            expect(view.state.top).toBe(777);
        } finally {
            target.remove();
        }
    });

    it('gezinmeye özel scroll seçeneği hafızayı ezer', async () => {
        app.useRouter({ routes: routes(), mode: 'history', scrollMemory: true });
        run();

        await app.router.navigate('/uzun');
        view.state.top = 1200;
        await app.router.navigate('/kisa');

        await app.router.navigate('/uzun', { scroll: 'top' });
        expect(view.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
        expect(view.state.top).toBe(0);
    });

    it('key ile aynı sayfanın iki adresi tek anahtarda toplanır', async () => {
        app.useRouter({
            routes: routes(),
            mode: 'history',
            scrollMemory: { key: (path) => (path === '/docs' ? '/docs/giris' : path) },
        });
        run();

        await app.router.navigate('/docs/giris');
        view.state.top = 640;
        await app.router.navigate('/kisa');

        await app.router.navigate('/docs');
        expect(view.state.top).toBe(640);
    });

    it('top: false verilince görülmemiş sayfada konuma dokunmaz', async () => {
        app.useRouter({ routes: routes(), mode: 'history', scrollMemory: { top: false } });
        run();

        await app.router.navigate('/uzun');
        view.state.top = 900;
        await app.router.navigate('/kisa');

        expect(view.state.top).toBe(900);
    });

    it('konumlar oturum deposuna yazılır (yenilemede hatırlanır)', async () => {
        app.useRouter({ routes: routes(), mode: 'history', scrollMemory: true });
        run();

        await app.router.navigate('/uzun');
        view.state.top = 800;
        await app.router.navigate('/kisa');

        const raw = sessionStorage.getItem('motifjs:scroll');
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw!)).toEqual(expect.arrayContaining([['/uzun', 800]]));
    });

    it('açılış navigasyonu depodaki konumu ezmez', async () => {
        sessionStorage.setItem('motifjs:scroll', JSON.stringify([['/uzun', 900]]));
        history.replaceState({}, '', '/uzun');

        app.useRouter({ routes: routes(), mode: 'history', scrollMemory: true });
        run();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(view.state.top).toBe(900);
    });
    describe('container', () => {
        const makeScroller = (height = 5000) => {
            const el = document.createElement('div');
            el.id = 'scroller';
            const box = { top: 0, height };
            Object.defineProperty(el, 'scrollTop', {
                configurable: true,
                get: () => box.top,
                set: (v: number) => { box.top = Math.max(0, Math.min(Number(v) || 0, box.height)); },
            });
            document.body.appendChild(el);
            return { el, box };
        };

        afterEach(() => {
            document.getElementById('scroller')?.remove();
        });

        it('seçiciyle verilen kabın konumunu hatırlar, pencereye dokunmaz', async () => {
            const { box } = makeScroller();
            app.useRouter({ routes: routes(), mode: 'history', scrollMemory: { container: '#scroller' } });
            run();

            await app.router.navigate('/uzun');
            box.top = 1500;
            await app.router.navigate('/kisa');
            expect(box.top).toBe(0);

            await app.router.navigate('/uzun');
            expect(box.top).toBe(1500);
            expect(view.scrollTo).not.toHaveBeenCalled();
        });

        it('fonksiyonla verilen kap her seferinde yeniden çözülür', async () => {
            let target: HTMLElement | null = null;
            app.useRouter({ routes: routes(), mode: 'history', scrollMemory: { container: () => target } });
            run();

            const { el, box } = makeScroller();
            target = el;
            await app.router.navigate('/uzun');
            box.top = 700;
            await app.router.navigate('/kisa');
            await app.router.navigate('/uzun');

            expect(box.top).toBe(700);
        });

        it('kap bulunamazsa pencere kaydırmasına düşer', async () => {
            app.useRouter({ routes: routes(), mode: 'history', scrollMemory: { container: '#yok' } });
            run();

            await app.router.navigate('/uzun');
            view.state.top = 1200;
            await app.router.navigate('/kisa');
            await app.router.navigate('/uzun');

            expect(view.state.top).toBe(1200);
        });
    });
});
