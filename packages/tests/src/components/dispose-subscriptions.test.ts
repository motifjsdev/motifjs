/**
 * @jest-environment jsdom
 *
 * Bertaraf sırasında olay abonelikleri ve disposing kancaları:
 *  - `ondisposing` işleyicisi dispose() ve disposeAsync() yollarında TAM BİR KEZ çalışır
 *    (disposeAsync eskiden işleyicileri callDisposing'den sonra elle bir kez daha koşuyordu).
 *  - `this.context.on(...)` / `onRouterChanged(...)` abonelikleri bileşen bertaraf edilince
 *    kendiliğinden kalkar; elle iptal edilen abonelik bertarafta sorun çıkarmaz.
 */
import { Application, Component, Transporter } from '@motifx/core';

describe('ondisposing tek sefer çalışır', () => {
    test('dispose() yolunda', async () => {
        let n = 0;
        const c = new Component('div', { ondisposing: () => { n++; } });
        await c.dispose();
        expect(n).toBe(1);
    });

    test('disposeAsync() yolunda', async () => {
        let n = 0;
        const c = new Component('div', { ondisposing: () => { n++; } });
        await c.disposeAsync();
        expect(n).toBe(1);
    });

    test('ebeveyn bertaraf edilince çocuk (disposeAsync yolu)', async () => {
        let n = 0;
        const parent = new Component('div');
        parent.controls.add(new Component('span', { ondisposing: () => { n++; } }));
        await parent.dispose();
        expect(n).toBe(1);
    });

    test('sınıf metodu onDisposing de tek sefer', async () => {
        let n = 0;
        class C extends Component { onDisposing() { n++; } }
        const c = new C('div');
        await c.disposeAsync();
        expect(n).toBe(1);
    });
});

describe('context.on abonelikleri bertarafta kalkar', () => {
    let app: Application;
    beforeEach(() => { app = Application.CreateBuilder().build(); });
    afterEach(() => { try { app?.dispose(); } catch { } });

    test('dispose sonrası fire işleyiciye ulaşmaz', async () => {
        let n = 0;
        const c = new Component('div');
        c.context.on('evt', () => { n++; });
        app.fire('evt');
        expect(n).toBe(1);
        await c.dispose();
        app.fire('evt');
        expect(n).toBe(1);
    });

    test('çocuk bileşen (disposeAsync yolu) aboneliği de kalkar', async () => {
        let n = 0;
        const parent = new Component('div');
        const child = new Component('span');
        parent.controls.add(child);
        child.context.on('evt', () => { n++; });
        await parent.dispose();
        app.fire('evt');
        expect(n).toBe(0);
    });

    test('onRouterChanged aboneliği de kalkar', async () => {
        let n = 0;
        const c = new Component('div');
        c.context.onRouterChanged(() => { n++; });
        app.fire('motifjs-router-navigated', {});
        expect(n).toBe(1);
        await c.dispose();
        app.fire('motifjs-router-navigated', {});
        expect(n).toBe(1);
    });

    test('elle iptal edilen abonelik: iptal çalışır, bertaraf hata vermez', async () => {
        let n = 0;
        const c = new Component('div');
        const off = c.context.on('evt', () => { n++; });
        off();
        app.fire('evt');
        expect(n).toBe(0);
        await expect(c.dispose()).resolves.toBeUndefined();
    });

    test('bileşenin aboneliği uygulama genelindeki diğer abonelikleri etkilemez', async () => {
        let appLevel = 0;
        app.on('evt', () => { appLevel++; });
        const c = new Component('div');
        c.context.on('evt', () => { });
        await c.dispose();
        app.fire('evt');
        expect(appLevel).toBe(1);
    });

    test('context uygulamanın geri kalanını aynen sunar (fire, alanlar)', () => {
        let got: any;
        app.on('ping', (a) => { got = a; });
        const c = new Component('div');
        c.context.fire('ping', 42);
        expect(got).toBe(42);
        expect(c.context.provider).toBe(app.provider);
        expect(c.context instanceof Application).toBe(true);
    });

    test('taşınan (Transporter) bileşen hata vermez ve yeni ebeveynin uygulamasını görür', () => {
        const a = new Component('div');
        const b = new Component('div');
        const child = new Component('span');
        a.controls.add(child);
        expect(() => Transporter.transport(child, b)).not.toThrow();
        expect(child.parent).toBe(b);
        let n = 0;
        app.on('evt2', () => { n++; });
        child.context.fire('evt2');
        expect(n).toBe(1);
    });
});
