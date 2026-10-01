/**
 * @jest-environment jsdom
 *
 * Bertaraf ve DOM dinleyicileri / eşzamanlı bertaraf:
 *  - dispose() DOM dinleyicilerini söker (eskiden isDisposed erken true olduğu için off()
 *    boşa dönüyor, element null'landıktan sonra _offAll de sökemiyordu → DOM'dan çıkmış
 *    öğeye gelen olay — ör. sürüklenen sekmeye `dragend` — ölü bileşende çalışıyordu).
 *  - Aynı bileşene eşzamanlı ikinci dispose/disposeAsync çağrısı ilkini bekler; kancalar
 *    bir kez çalışır, silinmiş alanlara erişip hata vermez.
 */
import { Component } from '@motifx/core';

const errors: string[] = [];
const origError = console.error;
beforeEach(() => { errors.length = 0; console.error = (...a: any[]) => { errors.push(a.map(String).join(' ')); }; });
afterEach(() => { console.error = origError; });

describe('dispose() DOM dinleyicilerini söker', () => {
    test.each(['dispose', 'disposeAsync'] as const)('%s sonrası öğeye gelen olay işleyiciyi çağırmaz', async (how) => {
        let n = 0;
        const c = new Component('div');
        c.motif.on('click', () => { n++; });
        const el = c.element as HTMLElement;
        el.dispatchEvent(new MouseEvent('click'));
        expect(n).toBe(1);
        await c[how]();
        el.dispatchEvent(new MouseEvent('click'));
        expect(n).toBe(1);
    });

    test('JSX tarzı prop olay işleyicisi (onclick) de sökülür', async () => {
        let n = 0;
        const c = new Component('div', { onclick: () => { n++; } } as any);
        c.build();
        const el = c.element as HTMLElement;
        el.dispatchEvent(new MouseEvent('click'));
        await c.dispose();
        el.dispatchEvent(new MouseEvent('click'));
        expect(n).toBe(1);
    });

    test('bertaraf edilmiş bileşenin alanına dokunan işleyici hata vermez (dragend senaryosu)', async () => {
        class Bar extends Component { drop = { index: 3 }; }
        const bar = new Bar('div');
        const tab = new Component('div');
        bar.controls.add(tab);
        tab.motif.on('dragend', () => { bar.drop.index = -1; });
        bar.build();
        const el = tab.element as HTMLElement;
        await bar.dispose();
        el.dispatchEvent(new Event('dragend'));
        expect(errors.filter(e => e.includes('on.wrapped'))).toEqual([]);
    });
});

describe('eşzamanlı bertaraf', () => {
    test.each([
        ['dispose + disposeAsync', (c: Component) => [c.dispose(), c.disposeAsync()]],
        ['disposeAsync + dispose', (c: Component) => [c.disposeAsync(), c.dispose()]],
        ['dispose + dispose', (c: Component) => [c.dispose(), c.dispose()]],
    ] as const)('%s: hata yok, kancalar bir kez', async (_name, run) => {
        let disposing = 0, disposed = 0;
        const c = new Component('div', { ondisposing: () => { disposing++; }, ondisposed: () => { disposed++; } } as any);
        c.controls.add(new Component('span'));
        c.build();
        await Promise.all(run(c));
        expect(c.isDisposed).toBe(true);
        expect(disposing).toBe(1);
        expect(disposed).toBe(1);
        expect(errors).toEqual([]);
    });

    test('ebeveyn bertarafı sürerken çocuk ayrıca bertaraf edilir', async () => {
        const parent = new Component('div');
        const child = new Component('span');
        parent.controls.add(child);
        parent.build();
        await Promise.all([parent.dispose(), child.dispose()]);
        expect(child.isDisposed).toBe(true);
        expect(parent.isDisposed).toBe(true);
        expect(errors).toEqual([]);
    });
});
