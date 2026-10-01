/**
 * @jest-environment jsdom
 *
 * Koşullu dalların İLK çizimi senkron olmalı.
 *
 * Eskiden `Frame.navigate` → `navigateHost` her zaman `await prevLock` yaptığı için `{cond && <X/>}`
 * (bindings.when), ternary ve JSX döndüren `{this.parca()}` (bindings.method) içerikleri `build()`
 * döndüğünde henüz DOM'da değildi; ternary üstüne bir de setTimeout(0)/queueMicrotask ekliyordu.
 * ui-kit bu yüzden "statik kararı JSX'e sokma" kuralı taşıyordu.
 *
 * Yeni davranış: boş bir Frame'e ilk içerik senkron hızlı yoldan yerleşir; ternary/when ilk
 * değerlendirmeyi hemen ve İZLEMESİZ yapar. Sonraki değişimler eski zamanlamayı korur
 * (latest-wins, nested→kök sırası).
 */
import { Component, ComponentBase, Frame, effect, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function mount() {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    return host;
}
const html = (c: ComponentBase) => (c.element as unknown as HTMLElement).innerHTML;
const span = (id: string, text = id) => new Component('span', {
    initializeComponent: (s: ComponentBase) => { (s.element as unknown as HTMLElement).id = id; s.setText(text); },
} as any);

describe('koşullu dalların ilk çizimi senkron', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('bindings.when: koşul açılışta doğruysa içerik build() sırasında yazılır', () => {
        const st = reactive({ show: true });
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (s: ComponentBase) => { s.bindings.when(() => st.show, () => span('w')); },
        } as any);
        host.build();
        expect(html(host)).toContain('id="w"');   // await YOK
    });

    it('bindings.ternary: doğru dal build() sırasında yazılır', () => {
        const st = reactive({ a: true });
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.ternary(() => st.a, (f: Frame) => { f.navigate(span('t')); }, (f: Frame) => { f.navigate(span('f')); });
            },
        } as any);
        host.build();
        expect(html(host)).toContain('id="t"');
        expect(html(host)).not.toContain('id="f"');
    });

    it('iç içe ternary (ternaryCall): en derin dal da build() sırasında yazılır', () => {
        const st = reactive({ a: false, b: true });
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (s: ComponentBase) => {
                // Derleyicinin ürettiği biçim: dış ternary → yanlış dalda iç ternaryCall, aynı frame'e navigate
                s.bindings.ternary(
                    () => st.a,
                    (f: Frame) => { f.navigate(span('A')); },
                    (f: Frame) => {
                        (s.bindings as any).ternaryCall(() => st.b, () => { f.navigate(span('B')); }, () => { f.navigate(span('C')); });
                    },
                );
            },
        } as any);
        host.build();
        expect(html(host)).toContain('id="B"');
    });

    it('bindings.method: JSX döndüren çağrı build() sırasında yazılır', () => {
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (s: ComponentBase) => { s.bindings.method(() => span('m')); },
        } as any);
        host.build();
        expect(html(host)).toContain('id="m"');
    });

    it('Frame.navigate: boş frame senkron, dolu frame asenkron kalır ve eskisi dispose edilir', async () => {
        const host = mount();
        const frame = new Frame();
        host.controls.add(frame);

        const first = span('one');
        void frame.navigate(first);
        expect(html(host)).toContain('id="one"');   // senkron

        const second = span('two');
        void frame.navigate(second);
        expect(html(host)).toContain('id="one"');   // henüz değil — eski içerik await ile dispose edilir
        await tick();
        expect(html(host)).toContain('id="two"');
        expect(html(host)).not.toContain('id="one"');
        expect(first.isDisposed).toBe(true);
    });

    it('latest-wins korunur: art arda iki navigate sonunda yalnızca sonuncusu mount edilir', async () => {
        const host = mount();
        const frame = new Frame();
        host.controls.add(frame);
        void frame.navigate(span('x'));           // senkron
        void frame.navigate(span('y'));           // kuyruk
        void frame.navigate(span('z'));           // kuyruk, y'yi geçersiz kılar
        await tick(); await tick();
        expect(html(host)).toContain('id="z"');
        expect(html(host)).not.toContain('id="y"');
    });

    it('sonraki değişimler çalışmaya devam eder (when aç/kapa, ternary dal değişimi)', async () => {
        const st = reactive({ show: false, a: true });
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.when(() => st.show, () => span('w'));
                s.bindings.ternary(() => st.a, (f: Frame) => { f.navigate(span('t')); }, (f: Frame) => { f.navigate(span('f')); });
            },
        } as any);
        host.build();
        document.body.appendChild(host.element as unknown as Node);
        expect(html(host)).not.toContain('id="w"');
        expect(html(host)).toContain('id="t"');

        st.show = true; st.a = false;
        await tick(); await tick();
        expect(html(host)).toContain('id="w"');
        expect(html(host)).toContain('id="f"');
        expect(html(host)).not.toContain('id="t"');

        st.show = false;
        await tick();
        expect(html(host)).not.toContain('id="w"');
    });

    it('dal içindeki reaktif okumalar dış effect e sızmaz (izlemesiz kurulum)', async () => {
        const st = reactive({ show: true, other: 0 });
        const host = mount();
        let outerRuns = 0;
        effect(() => {
            outerRuns++;
            // Dış effect'in İÇİNDE when kuruluyor (liste öğesi render'ı gibi)
            const c = new Component('div', {
                initializeComponent: (s: ComponentBase) => {
                    s.bindings.when(() => st.show, () => {
                        void st.other;           // dal içinde reaktif okuma
                        return span('leak');
                    });
                },
            } as any);
            host.controls.add(c);
        });
        expect(outerRuns).toBe(1);
        st.other++;
        await tick();
        expect(outerRuns).toBe(1);   // sızsaydı 2 olurdu
    });
});
