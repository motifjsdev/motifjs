/**
 * @jest-environment jsdom
 *
 * `bindings.model(source, member)` bir onay kutusunda `checked` üzerinden çalışmalı, `value`
 * üzerinden değil.
 *
 * Hata: hedef DOM özelliği (`checked` mi `value` mı) bağ kurulurken bir kez seçiliyordu.
 * Derleyici `type` attribute'unu `initializeComponent` içinde uygular, `onconfig` (model bağının kurulduğu
 * yer) ise `initializeComponent`'tan ÖNCE çalışır; o anda `input.type` hâlâ 'text' görünür. Sonuç:
 * `el.value = true` → DOM "true" dizgesine çevirir, geri yazma da modele boolean yerine
 * "true"/"false" dizgesi koyar.
 */
import { Component, ComponentBase, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

/** Derleyici çıktısını taklit eder: `type` `initializeComponent` içinde, model bağı `onconfig` içinde. */
function makeInput(type: string, bind: (s: ComponentBase) => void) {
    return new Component('input', {
        onconfig: (s: ComponentBase) => bind(s),
        initializeComponent: (s: ComponentBase) => { s.attr.add({ type }); }
    } as any);
}

function mount(child: Component<any>) {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    host.controls.add(child);
    return host;
}

describe('bindings.model on a checkbox', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('renders the model boolean as checked, not as value="true"', async () => {
        const p = reactive({ notifications: true });
        const cb = makeInput('checkbox', s => s.bindings.model(p, 'notifications'));
        mount(cb);
        await tick();

        const el = cb.element as unknown as HTMLInputElement;
        expect(el.type).toBe('checkbox');
        expect(el.checked).toBe(true);
        expect(el.getAttribute('value')).toBeNull();

        p.notifications = false;
        await tick();
        expect(el.checked).toBe(false);
    });

    it('writes a boolean back to the model on change', async () => {
        const p = reactive({ notifications: true });
        const cb = makeInput('checkbox', s => s.bindings.model(p, 'notifications'));
        mount(cb);
        await tick();

        const el = cb.element as unknown as HTMLInputElement;
        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();

        expect(p.notifications).toBe(false);
        expect(typeof p.notifications).toBe('boolean');

        el.checked = true;
        el.dispatchEvent(new Event('click', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        expect(p.notifications).toBe(true);
        expect(typeof p.notifications).toBe('boolean');
    });

    it('treats radio inputs the same way', async () => {
        const p = reactive({ agreed: false });
        const rb = makeInput('radio', s => s.bindings.model(p, 'agreed'));
        mount(rb);
        await tick();

        const el = rb.element as unknown as HTMLInputElement;
        expect(el.checked).toBe(false);

        p.agreed = true;
        await tick();
        expect(el.checked).toBe(true);

        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();
        expect(p.agreed).toBe(false);
    });

    it('still uses value for text inputs (input event)', async () => {
        const p = reactive({ name: 'Ekrem' });
        const input = makeInput('text', s => s.bindings.model(p, 'name'));
        mount(input);
        await tick();

        const el = input.element as unknown as HTMLInputElement;
        expect(el.value).toBe('Ekrem');

        el.value = 'Ayşe';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(p.name).toBe('Ayşe');

        p.name = 'Mehmet';
        await tick();
        expect(el.value).toBe('Mehmet');
    });

    it('writes numbers (not strings) back from number/range inputs', async () => {
        const p = reactive({ density: 3, count: 1 });
        const range = makeInput('range', s => s.bindings.model(p, 'density'));
        const num = makeInput('number', s => s.bindings.model(p, 'count'));
        mount(range); mount(num);
        await tick();

        const r = range.element as unknown as HTMLInputElement;
        const n = num.element as unknown as HTMLInputElement;
        expect(r.value).toBe('3');

        r.value = '5';
        r.dispatchEvent(new Event('input', { bubbles: true }));
        n.value = '7';
        n.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        expect(p.density).toBe(5);
        expect(typeof p.density).toBe('number');
        expect(p.count).toBe(7);
        expect(p.count + 1).toBe(8);
    });

    it('maps an emptied number input to null', async () => {
        const p = reactive({ count: 4 as number | null });
        const num = makeInput('number', s => s.bindings.model(p, 'count'));
        mount(num);
        await tick();

        const n = num.element as unknown as HTMLInputElement;
        n.value = '';
        n.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(p.count).toBeNull();

        p.count = 9;
        await tick();
        expect(n.value).toBe('9');
    });

    it('keeps date inputs as strings', async () => {
        const p = reactive({ birthDate: '1990-05-17' });
        const d = makeInput('date', s => s.bindings.model(p, 'birthDate'));
        mount(d);
        await tick();

        const el = d.element as unknown as HTMLInputElement;
        expect(el.value).toBe('1990-05-17');
        el.value = '2001-01-02';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(p.birthDate).toBe('2001-01-02');
        expect(typeof p.birthDate).toBe('string');
    });

    it('keeps working when the model value is null/undefined', async () => {
        const p = reactive({ name: null as string | null });
        const input = makeInput('text', s => s.bindings.model(p, 'name'));
        mount(input);
        await tick();

        const el = input.element as unknown as HTMLInputElement;
        expect(el.value).toBe('');
    });
});
