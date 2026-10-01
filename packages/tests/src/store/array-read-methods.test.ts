/**
 * Reaktif dizide OKUMA metotları (includes / indexOf / lastIndexOf / concat) effect'i
 * kendi kendine tetiklememeli. Eskiden okuma tuzağı bu metotlara erişimde `trigger` da
 * çağırıyordu: effect okuduğu anahtarı tetikleyip kendini yeniden kuyruğa sokuyor, flush
 * içinde 50 tur dönüp `reactivity.recursive-effect` uyarısı veriyordu (IDE Kanban panosu).
 * Mutasyonlar (push/splice…) ise okuyan effect'i yeniden çalıştırmaya devam etmeli.
 */
import { reactive, effect } from '@motifx/core';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe.each(['includes', 'indexOf', 'lastIndexOf', 'concat'] as const)('dizi okuma metodu: %s', (method) => {
    test('effect kendi kendini tetiklemez (tek koşu)', async () => {
        const state = reactive({ tags: ['a', 'b'] });
        let runs = 0;
        effect(() => { runs++; (state.tags as any)[method]('a'); });
        await flush();
        await flush();
        expect(runs).toBe(1);
    });

    test('push sonrası effect yeniden çalışır', async () => {
        const state = reactive({ tags: ['a', 'b'] });
        let runs = 0;
        effect(() => { runs++; (state.tags as any)[method]('c'); });
        await flush();
        state.tags.push('c');
        await flush();
        expect(runs).toBe(2);
    });

    test('splice ile silme sonrası effect yeniden çalışır', async () => {
        const state = reactive({ tags: ['a', 'b'] });
        let runs = 0;
        effect(() => { runs++; (state.tags as any)[method]('a'); });
        await flush();
        state.tags.splice(0, 1);
        await flush();
        expect(runs).toBe(2);
    });
});

test('includes sonucu mutasyonla doğru güncellenir', async () => {
    const state = reactive({ tags: ['a'] });
    let seen: boolean[] = [];
    effect(() => { seen.push(state.tags.includes('x')); });
    await flush();
    state.tags.push('x');
    await flush();
    state.tags.splice(state.tags.indexOf('x'), 1);
    await flush();
    expect(seen).toEqual([false, true, false]);
});
