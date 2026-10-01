/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function mount(child: ComponentBase) {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    host.controls.add(child);
    return host;
}

function text(bind: (s: ComponentBase) => void) {
    const comp = new Component('span', { initializeComponent: (s: ComponentBase) => bind(s) } as any);
    mount(comp);
    return () => (comp.element as unknown as HTMLElement).textContent;
}

const when = new Date(2026, 0, 15, 13, 5, 0);

describe('formatString follows formatInfo', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('formats currency with the given locale and currency', async () => {
        const st = reactive({ price: 1234.5 });
        const us = text(s => s.bindings.add('textContent', st, 'price', 'C', { locale: 'en-US', currency: 'USD' }));
        const de = text(s => s.bindings.add('textContent', st, 'price', 'C', { locale: 'de-DE', currency: 'EUR' }));
        const tr = text(s => s.bindings.add('textContent', st, 'price', 'C', { locale: 'tr-TR', currency: 'TRY' }));
        await tick();

        expect(us()).toBe('$1,234.50');
        expect(de()).toBe(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5));
        expect(tr()).toBe(new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(1234.5));
        expect(new Set([us(), de(), tr()]).size).toBe(3);
    });

    it('formats numbers and percentages with the given locale', async () => {
        const st = reactive({ total: 1234.5678, ratio: 0.25 });
        const us = text(s => s.bindings.add('textContent', st, 'total', 'N1', { locale: 'en-US' }));
        const de = text(s => s.bindings.add('textContent', st, 'total', 'N3', { locale: 'de-DE' }));
        const pct = text(s => s.bindings.add('textContent', st, 'ratio', 'P', { locale: 'en-US' }));
        await tick();

        expect(us()).toBe('1,234.6');
        expect(de()).toBe('1.234,568');
        expect(pct()).toBe('25%');
    });

    it('formats dates and times with the given locale', async () => {
        const st = reactive({ when });
        const usDate = text(s => s.bindings.add('textContent', st, 'when', 'd', { locale: 'en-US' }));
        const deDate = text(s => s.bindings.add('textContent', st, 'when', 'd', { locale: 'de-DE' }));
        const usTime = text(s => s.bindings.add('textContent', st, 'when', 't', { locale: 'en-US' }));
        await tick();

        expect(usDate()).toBe(when.toLocaleDateString('en-US'));
        expect(deDate()).toBe(when.toLocaleDateString('de-DE'));
        expect(usTime()).toBe(when.toLocaleTimeString('en-US'));
        expect(usDate()).not.toBe(deDate());
    });

    it('uses the runtime locale when no formatInfo is given', async () => {
        const st = reactive({ total: 1234.5, when });
        const number = text(s => s.bindings.add('textContent', st, 'total', 'N2'));
        const date = text(s => s.bindings.add('textContent', st, 'when', 'd'));
        await tick();

        expect(number()).toBe(new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5));
        expect(date()).toBe(when.toLocaleDateString());
    });

    it('formats currency as a plain amount when no currency is given', async () => {
        const st = reactive({ price: 1234.5 });
        const plain = text(s => s.bindings.add('textContent', st, 'price', 'C', { locale: 'en-US' }));
        await tick();
        expect(plain()).toBe('1,234.50');
    });

    it('accepts formatInfo assigned on the returned binding', async () => {
        const st = reactive({ price: 1234.5 });
        const read = text(s => {
            const binding = s.bindings.add('textContent', st, 'price', 'C');
            binding.formatInfo = { locale: 'en-GB', currency: 'GBP' };
        });
        await tick();
        expect(read()).toBe('£1,234.50');
    });

    it('re-formats when the value changes', async () => {
        const st = reactive({ price: 1 });
        const read = text(s => s.bindings.add('textContent', st, 'price', 'C', { locale: 'en-US', currency: 'USD' }));
        await tick();
        expect(read()).toBe('$1.00');
        st.price = 2.5;
        await tick();
        expect(read()).toBe('$2.50');
    });
});
