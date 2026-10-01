/**
 * @jest-environment jsdom
 *
 * KORUMA TESTİ — koşullu dalların reaktifliği.
 *
 * `bindings.when` ve `bindings.ternary` dalı kurarken `untracked` kullanır: amaç, dal içindeki
 * reaktif okumaların DIŞ effect'e (ör. bir liste öğesinin render effect'i) sızmasını önlemektir
 * (L1 ailesi). Bu sarma, dalın KENDİ bağlarının canlılığını etkilememelidir.
 *
 * Reaktivite çerçevenin varlık nedenidir; burada kırılan bir şey "performans ödünü" değil,
 * doğrudan hatadır. Bu dosya o sınırı kilitler.
 */
import { Component, ComponentBase, Frame, reactive } from '@motifx/core';
const tick = () => new Promise<void>(r => setTimeout(r, 0));
const html = (c: any) => (c.element as HTMLElement).innerHTML;

describe('untracked sarmaları reaktifliği azalttı mı?', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('when dalının İÇİNDEKİ bağ canlı kalır', async () => {
        const st = reactive({ show: true, text: 'ilk' });
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.when(() => st.show, () => new Component('span', {
                    initializeComponent: (x: ComponentBase) => { x.bindings.add('textContent', st, 'text'); },
                } as any));
            },
        } as any);
        host.build();
        document.body.appendChild(host.element as any);
        await tick();
        expect(html(host)).toContain('ilk');

        st.text = 'guncel';                 // dal İÇİ reaktivite
        await tick();
        expect(html(host)).toContain('guncel');
    });

    it('ternary dalının İÇİNDEKİ bağ canlı kalır', async () => {
        const st = reactive({ a: true, text: 'ilk' });
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.ternary(() => st.a,
                    (f: Frame) => { f.navigate(new Component('span', { initializeComponent: (x: ComponentBase) => { x.bindings.add('textContent', st, 'text'); } } as any)); },
                    (f: Frame) => { f.navigate(new Component('b')); });
            },
        } as any);
        host.build();
        document.body.appendChild(host.element as any);
        await tick();
        expect(html(host)).toContain('ilk');

        st.text = 'guncel';
        await tick();
        expect(html(host)).toContain('guncel');
    });

    it('koşulun KENDİSİ değişince dal değişir (when + ternary)', async () => {
        const st = reactive({ show: false, a: true });
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.when(() => st.show, () => { const c = new Component('i'); (c.element as any).id = 'w'; return c as any; });
                s.bindings.ternary(() => st.a,
                    (f: Frame) => { const c = new Component('u'); (c.element as any).id = 'T'; f.navigate(c); },
                    (f: Frame) => { const c = new Component('s'); (c.element as any).id = 'F'; f.navigate(c); });
            },
        } as any);
        host.build();
        document.body.appendChild(host.element as any);
        await tick();
        expect(html(host)).not.toContain('id="w"');
        expect(html(host)).toContain('id="T"');

        st.show = true; st.a = false;
        await tick(); await tick();
        expect(html(host)).toContain('id="w"');
        expect(html(host)).toContain('id="F"');
    });

    it('x-wait/x-display koşulu canlı kalır', async () => {
        const st = reactive({ hide: true });
        const host = new Component<HTMLDivElement>('div');
        const c = new Component('span', { 'x-wait': () => st.hide } as any);
        (c.element as any).id = 'k';
        host.controls.add(c);
        host.build();
        document.body.appendChild(host.element as any);
        await tick();
        expect(html(host)).not.toContain('id="k"');
        st.hide = false;
        await tick();
        expect(html(host)).toContain('id="k"');
    });
});
