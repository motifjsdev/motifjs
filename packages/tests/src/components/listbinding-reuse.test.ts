/**
 * ListBinding primitive yeniden kullanımı (hibrit strateji).
 *
 * 1. aşama (her zaman): KONUMSAL — aynı index'te değer aynıysa bileşen yeniden kullanılır.
 * 2. aşama (yalnızca renderFn `index` bildirmiyorsa): DEĞER ANAHTARLI — aynı değere sahip
 *    artakalan bileşen taşınarak yeniden kullanılır.
 *
 * Eskiden primitive listelerde her güncelleme TÜM satırları yeniden yaratıyordu
 * (1000 öğeye 1 ekleme = 1001 renderFn çağrısı; DOM durumu her seferinde kayboluyordu).
 */

import { Component, ComponentBase, reactive } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe('ListBinding — primitive yeniden kullanımı', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => { cleanupTestContainer(container); });

    /** Değere bağlı, index'ten BAĞIMSIZ render (arity 1) */
    function valueRenderer(counter: { n: number }) {
        return (item: any) => {
            counter.n++;
            const c = new Component('span');
            (c.element as HTMLElement).textContent = String(item);
            return c;
        };
    }

    /** Index'e BAĞIMLI render (arity 2) */
    function indexRenderer(counter: { n: number }) {
        return (item: any, idx: number) => {
            counter.n++;
            const c = new Component('span');
            (c.element as HTMLElement).textContent = `${idx}:${item}`;
            return c;
        };
    }

    function mount(itemsFn: () => any[], renderFn: any) {
        const host = new Component('div', {
            initializeComponent: (s: ComponentBase) => { s.bindings.list(itemsFn, renderFn); }
        });
        host.build();
        container.appendChild(host.element as Node);
        return host;
    }

    const spans = (host: ComponentBase) =>
        Array.from((host.element as HTMLElement).querySelectorAll('span'));

    test('liste değişmeden effect yeniden koşarsa hiçbir satır yeniden render edilmez', async () => {
        const counter = { n: 0 };
        const model = reactive({ items: ['a', 'b', 'c'], flag: 0 });
        const host = mount(() => { void model.flag; return model.items; }, valueRenderer(counter));
        await wait(5);

        const before = spans(host);
        const rendersAfterMount = counter.n;
        expect(rendersAfterMount).toBe(3);

        model.flag = 1; // liste aynı, alakasız alan değişti
        await wait(5);

        expect(counter.n).toBe(rendersAfterMount); // ek render YOK
        const after = spans(host);
        expect(after).toEqual(before);             // DOM elemanları birebir korundu
    });

    test('sona ekleme yalnızca eklenen öğeyi render eder', async () => {
        const counter = { n: 0 };
        const base = Array.from({ length: 200 }, (_, i) => 'i' + i);
        const model = reactive({ items: base });
        const host = mount(() => model.items, valueRenderer(counter));
        await wait(20);

        const afterMount = counter.n;
        expect(afterMount).toBe(200);
        const before = spans(host);

        model.items = [...base, 'yeni'];
        await wait(20);

        expect(counter.n - afterMount).toBe(1);    // yalnızca 1 yeni render
        const after = spans(host);
        expect(after.length).toBe(201);
        // İlk 200 element birebir korundu
        for (let i = 0; i < 200; i++) expect(after[i]).toBe(before[i]);
        expect((after[200] as HTMLElement).textContent).toBe('yeni');
    });

    test('tek öğe değişince yalnızca o satır yeniden render edilir', async () => {
        const counter = { n: 0 };
        const model = reactive({ items: ['a', 'b', 'c'] });
        const host = mount(() => model.items, valueRenderer(counter));
        await wait(5);
        const before = spans(host);

        model.items = ['a', 'b', 'z'];
        await wait(5);

        expect(counter.n).toBe(4); // 3 ilk render + 1 yeni öğe
        const after = spans(host);
        expect((host.element as HTMLElement).textContent).toBe('abz');
        expect(after[0]).toBe(before[0]);
        expect(after[1]).toBe(before[1]);
        expect(after[2]).not.toBe(before[2]);
    });

    test('index\'ten bağımsız render: yeniden sıralamada tüm satırlar taşınarak korunur', async () => {
        const counter = { n: 0 };
        const model = reactive({ items: ['a', 'b', 'c'] });
        const host = mount(() => model.items, valueRenderer(counter));
        await wait(5);
        const before = spans(host);

        model.items = ['c', 'a', 'b'];
        await wait(5);

        expect(counter.n).toBe(3); // ek render YOK
        expect((host.element as HTMLElement).textContent).toBe('cab');
        const after = spans(host);
        expect(after.length).toBe(3);
        // Aynı üç element, yalnızca sırası değişti
        for (const el of after) expect(before.includes(el)).toBe(true);
    });

    test('index\'e bağımlı render: yeniden sıralamada index BAYAT kalmaz (güvenli mod)', async () => {
        const counter = { n: 0 };
        const model = reactive({ items: ['a', 'b', 'c'] });
        const host = mount(() => model.items, indexRenderer(counter));
        await wait(5);
        expect((host.element as HTMLElement).textContent).toBe('0:a1:b2:c');

        model.items = ['c', 'a', 'b'];
        await wait(5);

        // Değer anahtarlı taşıma UYGULANMAZ; index'ler doğru kalır
        expect((host.element as HTMLElement).textContent).toBe('0:c1:a2:b');
    });

    test('index\'e bağımlı render: değişmeyen konumlar yine de yeniden kullanılır', async () => {
        const counter = { n: 0 };
        const model = reactive({ items: ['a', 'b', 'c'] });
        const host = mount(() => model.items, indexRenderer(counter));
        await wait(5);
        const before = spans(host);
        expect(counter.n).toBe(3);

        model.items = ['a', 'b', 'z']; // yalnızca son konum değişti
        await wait(5);

        expect(counter.n).toBe(4); // yalnızca son satır yeniden render edildi
        const after = spans(host);
        expect(after[0]).toBe(before[0]);
        expect(after[1]).toBe(before[1]);
        expect((host.element as HTMLElement).textContent).toBe('0:a1:b2:z');
    });

    test('tekrarlı değerler (multiset) doğru yönetilir', async () => {
        const counter = { n: 0 };
        const model = reactive({ items: ['a', 'a', 'b'] });
        const host = mount(() => model.items, valueRenderer(counter));
        await wait(5);
        expect(spans(host).length).toBe(3);
        expect((host.element as HTMLElement).textContent).toBe('aab');

        model.items = ['a', 'b']; // bir 'a' çıktı
        await wait(10);

        expect(spans(host).length).toBe(2);
        expect((host.element as HTMLElement).textContent).toBe('ab');
        expect(counter.n).toBe(3); // yeni render yok, artan bileşen dispose edildi
    });

    test('baştan silme: kayan satırlar taşınarak korunur', async () => {
        const counter = { n: 0 };
        const model = reactive({ items: ['a', 'b', 'c', 'd'] });
        const host = mount(() => model.items, valueRenderer(counter));
        await wait(5);
        const before = spans(host);

        model.items = ['b', 'c', 'd'];
        await wait(10);

        expect(counter.n).toBe(4); // ek render YOK
        expect((host.element as HTMLElement).textContent).toBe('bcd');
        const after = spans(host);
        expect(after.length).toBe(3);
        expect(after[0]).toBe(before[1]);
        expect(after[1]).toBe(before[2]);
        expect(after[2]).toBe(before[3]);
    });

    test('liste boşaltılınca tüm satırlar DOM\'dan silinir', async () => {
        const counter = { n: 0 };
        const model = reactive({ items: ['a', 'b', 'c'] });
        const host = mount(() => model.items, valueRenderer(counter));
        await wait(5);
        expect(spans(host).length).toBe(3);

        model.items = [];
        await wait(10);
        expect(spans(host).length).toBe(0);

        // Tekrar doldurma çalışır
        model.items = ['x'];
        await wait(10);
        expect(spans(host).length).toBe(1);
        expect((host.element as HTMLElement).textContent).toBe('x');
    });

    test('nesne listelerindeki kimlik tabanlı yeniden kullanım bozulmadı', async () => {
        const counter = { n: 0 };
        const a = { v: 'a' }, b = { v: 'b' }, c = { v: 'c' };
        const model = reactive({ items: [a, b, c] as any[] });
        const host = mount(() => model.items, (item: any) => {
            counter.n++;
            const comp = new Component('span');
            (comp.element as HTMLElement).textContent = item.v;
            return comp;
        });
        await wait(5);
        const before = spans(host);
        expect(counter.n).toBe(3);

        model.items = [c, a, b];
        await wait(5);

        expect(counter.n).toBe(3); // ek render YOK
        expect((host.element as HTMLElement).textContent).toBe('cab');
        const after = spans(host);
        for (const el of after) expect(before.includes(el)).toBe(true);
    });

    test('karışık (primitive + nesne) liste tutarlı çalışır', async () => {
        const counter = { n: 0 };
        const obj = { v: 'O' };
        const model = reactive({ items: ['a', obj, 'b'] as any[] });
        const host = mount(() => model.items, (item: any) => {
            counter.n++;
            const comp = new Component('span');
            (comp.element as HTMLElement).textContent = typeof item === 'object' ? item.v : String(item);
            return comp;
        });
        await wait(5);
        expect((host.element as HTMLElement).textContent).toBe('aOb');
        const before = spans(host);
        expect(counter.n).toBe(3);

        model.items = ['a', obj, 'b', 'c'];
        await wait(10);

        expect(counter.n).toBe(4); // yalnızca 'c'
        expect((host.element as HTMLElement).textContent).toBe('aObc');
        const after = spans(host);
        for (let i = 0; i < 3; i++) expect(after[i]).toBe(before[i]);
    });
});
