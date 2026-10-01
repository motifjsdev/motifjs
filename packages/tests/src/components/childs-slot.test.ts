/**
 * `{this.childs}` derleyici çıktısının runtime karşılığı.
 *
 * Derleyici artık `<div>{this.childs}</div>` için şunu üretiyor:
 *   _mc("div", { initializeComponent: sender => { const _comp = this.childs; sender.controls.add(_comp); } })
 * Bu testler o emisyonun runtime'da doğru davrandığını doğrular: dizi düzleşir, boş/eksik
 * childs hata vermez, içerik metne (`[object Object]`) dönüşmez.
 *
 * (ts-jest burada `jsx: 'react-jsx'` kullandığı için derleyici devrede değil; emisyon elle yazılır.)
 */

import { Component } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe('childs içerik slotu (runtime)', () => {
    let container: HTMLElement;

    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => { cleanupTestContainer(container); });

    function span(text: string) {
        const c = new Component('span');
        (c.element as HTMLElement).textContent = text;
        return c;
    }

    test('controls.add(childs) dizisi düzleşir ve çocuklar DOM\'a girer', async () => {
        const childs = [span('A'), span('B')];

        const root = new Component(container as any, {});
        const panel = new Component('div', {
            childs,
            initializeComponent: (sender: any) => {
                const _comp = sender.childs;
                sender.controls.add(_comp);
            }
        });
        root.controls.add(panel);
        root.build();
        await wait(0);

        expect((panel.element as HTMLElement).children.length).toBe(2);
        expect(container.querySelectorAll('span').length).toBe(2);
        expect(container.textContent).toContain('A');
        expect(container.textContent).toContain('B');
    });

    test('içerik metne dönüşmez ([object Object] basılmaz)', async () => {
        const root = new Component(container as any, {});
        const panel = new Component('div', {
            childs: [span('A')],
            initializeComponent: (sender: any) => { sender.controls.add(sender.childs); }
        });
        root.controls.add(panel);
        root.build();
        await wait(0);

        expect(container.textContent).not.toContain('[object Object]');
        expect(container.textContent).toBe('A');
    });

    test('childs verilmediğinde hata olmaz ve DOM boş kalır', async () => {
        const root = new Component(container as any, {});
        const panel = new Component('div', {
            initializeComponent: (sender: any) => { sender.controls.add(sender.childs); }
        });
        root.controls.add(panel);
        expect(() => root.build()).not.toThrow();
        await wait(0);

        expect((panel.element as HTMLElement).children.length).toBe(0);
        expect(container.textContent).toBe('');
    });

    test('boş childs dizisi de sorunsuzdur', async () => {
        const root = new Component(container as any, {});
        const panel = new Component('div', {
            childs: [],
            initializeComponent: (sender: any) => { sender.controls.add(sender.childs); }
        });
        root.controls.add(panel);
        root.build();
        await wait(0);

        expect((panel.element as HTMLElement).children.length).toBe(0);
    });

    test('slot kardeşleri arasında doğru konuma girer (sıra korunur)', async () => {
        const root = new Component(container as any, {});
        const once = new Component('b');
        (once.element as HTMLElement).textContent = 'ONCE';
        const sonra = new Component('b');
        (sonra.element as HTMLElement).textContent = 'SONRA';

        // <div>{once}{this.childs}{sonra}</div> emisyonunun sırası
        const panel = new Component('div', {
            childs: [span('A'), span('B')],
            initializeComponent: (sender: any) => {
                sender.controls.add(once);
                sender.controls.add(sender.childs);
                sender.controls.add(sonra);
            }
        });
        root.controls.add(panel);
        root.build();
        await wait(0);

        const sira = Array.from((panel.element as HTMLElement).children).map(e => e.textContent);
        expect(sira).toEqual(['ONCE', 'A', 'B', 'SONRA']);
    });

    test('childs aktarımı (forwarding): childs: [this.childs] iç içe dizi düzleşir', async () => {
        const inner = [span('A'), span('B')];

        const root = new Component(container as any, {});
        // <Card>{this.childs}</Card> emisyonu: childs prop'una İÇ İÇE dizi geçer
        const card = new Component('div', {
            childs: [inner],
            initializeComponent: (sender: any) => { sender.controls.add(sender.childs); }
        });
        root.controls.add(card);
        root.build();
        await wait(0);

        expect(container.querySelectorAll('span').length).toBe(2);
        expect(container.textContent).toBe('AB');
    });
});
