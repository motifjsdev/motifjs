/**
 * @jest-environment jsdom
 *
 * S4 — Fonksiyon bileşenlerinde JSX etiketine yazılan çerçeve prop'ları (direktifler, `initializeComponent`,
 * yaşam döngüsü kancaları) sessizce düşüyordu.
 *
 * Sınıf bileşeninde bunlar yapıcıya geçer; fonksiyon bileşeninde ise fonksiyon yalnızca kendi
 * veri prop'larını okuyup KENDİ JSX'inden yeni bir bileşen döndürür. Derleyici bu prop'ları
 * `runover` altında toplar (`<InfoBar x-display={...} />` → `runover: { preconfig: s =>
 * s.bindings.display(...) }`), ama dönen köke hiç uygulanmıyordu → bileşen hep görünür kalıyordu.
 *
 * Buradaki çağrılar derleyicinin ürettiği biçimi birebir taklit eder.
 */
import { Component, ComponentBase, motifComponent, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function mount() {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    return host;
}
const html = (host: Component<HTMLDivElement>) => (host.element as unknown as HTMLElement).innerHTML;

/** `(props) => <span>…</span>` — düz fonksiyon bileşeni. */
const Badge = (p: any) => motifComponent('span', {
    initializeComponent: (s: ComponentBase) => { s.class.add('badge'); s.setText(p.title ?? ''); }
});

describe('framework props on function components (S4)', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('applies x-display to the returned root', async () => {
        const st = reactive({ show: false });
        const host = mount();
        host.controls.add(motifComponent(Badge, {
            title: 'rozet',
            runover: { preconfig: (s: ComponentBase) => { s.bindings.display(() => st.show); } },
            childs: []
        }) as any);
        await tick();
        expect(html(host)).toBe('<!--h-->');

        st.show = true;
        await tick();
        expect(html(host)).toBe('<span class="badge">rozet</span>');

        st.show = false;
        await tick();
        expect(host.element.querySelector('.badge')).toBeNull();
    });

    it('runs outer initializeComponent and lifecycle hooks', async () => {
        const order: string[] = [];
        const host = mount();
        host.controls.add(motifComponent(Badge, {
            title: 'x',
            runover: {
                initializeComponent: (s: ComponentBase) => { order.push('initializeComponent'); s.class.add('outer'); },
                onbuilt: () => { order.push('onbuilt'); }
            },
            childs: []
        }) as any);
        await tick();

        expect(order).toEqual(['initializeComponent', 'onbuilt']);
        expect(host.element.querySelector('.badge')!.classList.contains('outer')).toBe(true);
    });

    it('calls ref with the returned component', async () => {
        let captured: ComponentBase | null = null;
        const host = mount();
        host.controls.add(motifComponent(Badge, {
            title: 'y',
            ref: (c: ComponentBase) => { captured = c; },
            childs: []
        }) as any);
        await tick();
        expect(captured).not.toBeNull();
        expect((captured as any).element.tagName).toBe('SPAN');
    });

    it('does not apply the same runover twice when the function forwards its props', async () => {
        const st = reactive({ show: true });
        let initializeComponentCount = 0;
        // Prop'larını doğrudan köküne aktaran fonksiyon bileşeni
        const PassThrough = (p: any) => motifComponent('span', p);
        const host = mount();
        host.controls.add(motifComponent(PassThrough, {
            runover: {
                initializeComponent: (s: ComponentBase) => { initializeComponentCount++; s.class.add('pass'); },
                preconfig: (s: ComponentBase) => { s.bindings.display(() => st.show); }
            },
            childs: []
        }) as any);
        await tick();

        expect(initializeComponentCount).toBe(1);
        expect(host.element.querySelectorAll('.pass').length).toBe(1);
        st.show = false;
        await tick();
        expect(host.element.querySelector('.pass')).toBeNull();
    });

    it('still works for class components (regression)', async () => {
        const st = reactive({ show: false });
        class Chip extends Component<HTMLSpanElement> {
            static elementTag = 'span';
            onConfigured() { this.class.add('chip'); }
        }
        const host = mount();
        host.controls.add(motifComponent(Chip, {
            runover: { preconfig: (s: ComponentBase) => { s.bindings.display(() => st.show); } },
            childs: []
        }) as any);
        await tick();
        expect(host.element.querySelector('.chip')).toBeNull();

        st.show = true;
        await tick();
        expect(host.element.querySelector('.chip')).not.toBeNull();
    });
});
