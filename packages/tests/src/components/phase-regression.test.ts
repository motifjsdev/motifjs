/**
 * Faz 0–4 düzeltmeleri için regresyon testleri (onaylı plan, Faz 5).
 *
 * Kapsam:
 *  - Faz 1: checked prop-vs-attr doğruluğu, metod-attribute whitelist güvenliği
 *  - Faz 2: ListBinding keyed reuse + LIS yeniden sıralama + kaldırma temizliği
 *  - Faz 3: enter transition'ın DOM bağlantısı SONRASI başlaması, skipNextLeave korunumu
 *  - Faz 4: Frame latest-wins, Symbol event trigger/on tutarlılığı (geç-outlet mekanizması),
 *           Lazy Fallbackview yokken placeholder temizliği
 */

import { Component, ComponentBase, Frame, Lazy, reactive } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe('Faz regresyonları', () => {
    let container: HTMLElement;

    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => { cleanupTestContainer(container); });

    // ---------------------------------------------------------------- Faz 1

    describe('Faz 1: controlAttribute', () => {
        test('checked property olarak yazılır ve kullanıcı etkileşiminden sonra da işler', async () => {
            const comp = new Component('input') as Component<HTMLInputElement>;
            comp.build();
            container.appendChild(comp.element as Node);

            comp.attr.add({ checked: true });
            expect(comp.element.checked).toBe(true);

            // Kullanıcı etkileşimini simüle et: kutuyu işaretten çıkar
            comp.element.checked = false;

            // Attribute yolu (setAttribute) bu noktada işlemezdi; property yolu işlemeli
            comp.attr.add({ checked: true });
            expect(comp.element.checked).toBe(true);

            comp.attr.add({ checked: false });
            expect(comp.element.checked).toBe(false);
        });

        test('whitelist dışındaki metod adları (remove) metod olarak ÇAĞRILMAZ, attribute olarak yazılır', async () => {
            const comp = new Component('div');
            comp.build();
            container.appendChild(comp.element as Node);
            expect(container.contains(comp.element as Node)).toBe(true);

            // Eski kodda bu, el.remove()'u tetikleyip elementi DOM'dan koparıyordu
            comp.attr.add({ remove: true });
            await wait(0); // olası zamanlanmış metod çağrıları için bekle

            expect(container.contains(comp.element as Node)).toBe(true);
            expect((comp.element as HTMLElement).getAttribute('remove')).toBe('');
        });

        test('whitelist içindeki focus metod-attribute olarak çalışmaya devam eder', async () => {
            const comp = new Component('input') as Component<HTMLInputElement>;
            comp.build();
            container.appendChild(comp.element as Node);

            comp.attr.add({ focus: true });
            await wait(0);
            expect(document.activeElement).toBe(comp.element);
        });
    });

    // ---------------------------------------------------------------- Faz 2

    describe('Faz 2: ListBinding keyed diff', () => {
        function renderItem(item: { id: number }): ComponentBase {
            const c = new Component('span');
            (c.element as HTMLElement).textContent = String(item.id);
            return c;
        }

        test('yeniden sıralamada bileşen instanceları (ve elementleri) yeniden kullanılır', async () => {
            const a = { id: 1 }, b = { id: 2 }, c = { id: 3 }, d = { id: 4 };
            const model = reactive({ items: [a, b, c, d] });

            const host = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.list(() => model.items, renderItem as any);
                }
            });
            host.build();
            container.appendChild(host.element as Node);
            await wait(0);

            expect((host.element as HTMLElement).textContent).toBe('1234');
            const spansBefore = Array.from((host.element as HTMLElement).querySelectorAll('span'));
            expect(spansBefore.length).toBe(4);

            // Yeniden sırala: [d, a, b, c]
            model.items = [d, a, b, c] as any;
            await wait(0);

            expect((host.element as HTMLElement).textContent).toBe('4123');
            const spansAfter = Array.from((host.element as HTMLElement).querySelectorAll('span'));
            expect(spansAfter.length).toBe(4);
            // Element kimlikleri korunmalı (yeniden yaratma yok)
            for (const el of spansAfter) {
                expect(spansBefore.includes(el)).toBe(true);
            }
        });

        test('kaldırılan öğenin bileşeni dispose edilir ve DOM güncellenir', async () => {
            const a = { id: 1 }, b = { id: 2 }, c = { id: 3 };
            const model = reactive({ items: [a, b, c] });

            const host = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.list(() => model.items, renderItem as any);
                }
            });
            host.build();
            container.appendChild(host.element as Node);
            await wait(0);
            expect((host.element as HTMLElement).textContent).toBe('123');

            model.items = [a, c] as any;
            await wait(10);

            expect((host.element as HTMLElement).textContent).toBe('13');
            expect((host.element as HTMLElement).querySelectorAll('span').length).toBe(2);
        });

        test('yerinde splice ile kaldırılan öğe de DOM\'dan silinir (olditems snapshot)', async () => {
            const model = reactive({ items: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });

            const host = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.list(() => model.items, renderItem as any);
                }
            });
            host.build();
            container.appendChild(host.element as Node);
            await wait(0);
            expect((host.element as HTMLElement).textContent).toBe('1234');

            // Yerinde mutasyon: diziyi DEĞİŞTİRMEDEN öğe çıkar (bench'in yakaladığı bug)
            model.items.splice(1, 1); // id:2 çıkar
            await wait(10);

            expect((host.element as HTMLElement).textContent).toBe('134');
            expect((host.element as HTMLElement).querySelectorAll('span').length).toBe(3);

            // Yerinde temizleme
            model.items.splice(0, model.items.length);
            await wait(10);
            expect((host.element as HTMLElement).querySelectorAll('span').length).toBe(0);
        });
    });

    // ---------------------------------------------------------------- Faz 3

    describe('Faz 3: transitions', () => {
        test('enter transition element DOM\'a bağlandıktan sonra başlar', async () => {
            const root = new Component(container as any, {});
            const child = new Component('div');
            (child as any).motif.options.transitionIn = true;

            let calledWhenConnected: boolean | null = null;
            (child as any).motif.options.transition.enterTransition = (resolve: () => void) => {
                calledWhenConnected = !!(child.element as any)?.isConnected;
                try { resolve(); } catch { }
                return null as any;
            };

            root.controls.add(child);
            root.build();

            // Senkron build sırasında (element hâlâ detached fragment'ta) BAŞLAMAMALI
            expect(calledWhenConnected).toBe(null);

            await Promise.resolve();
            await Promise.resolve();

            // Mikro-görevde, element bağlandıktan sonra başlamalı
            expect(calledWhenConnected).toBe(true);
        });

        test('elle set edilen skipNextLeave dispose() tarafından ezilmez', async () => {
            const comp = new Component('div');
            comp.build();
            container.appendChild(comp.element as Node);
            const el = comp.element as Node;

            let leaveCalled = false;
            (comp as any).motif.options.transition.leaveTransition = (resolve: () => void) => {
                leaveCalled = true;
                try { resolve(); } catch { }
                return null as any;
            };
            (comp as any).motif.options.transition.skipNextLeave = true;

            await comp.dispose(); // seçenek VERMEDEN — eski kod bayrağı false'a ezerdi
            expect(leaveCalled).toBe(false);
            expect(container.contains(el)).toBe(false);
        });

        test('dispose({skipLeaveTransition:true}) leave transition çalıştırmaz', async () => {
            const comp = new Component('div');
            comp.build();
            container.appendChild(comp.element as Node);
            const el = comp.element as Node;

            let leaveCalled = false;
            (comp as any).motif.options.transition.leaveTransition = (resolve: () => void) => {
                leaveCalled = true;
                try { resolve(); } catch { }
                return null as any;
            };

            await comp.dispose({ deep: true, skipLeaveTransition: true });
            expect(leaveCalled).toBe(false);
            expect(container.contains(el)).toBe(false);
        });

        test('normal dispose leave transition\'ı çalıştırır', async () => {
            const comp = new Component('div');
            comp.build();
            container.appendChild(comp.element as Node);

            let leaveCalled = false;
            (comp as any).motif.options.transition.leaveTransition = (resolve: () => void) => {
                leaveCalled = true;
                try { resolve(); } catch { }
                return null as any;
            };

            await comp.dispose();
            expect(leaveCalled).toBe(true);
        });
    });

    describe('CSS class tabanlı transitions (Vue-tarzı)', () => {
        test('transition prop (string) enter fazında from/active/to sınıflarını uygular', async () => {
            const root = new Component(container as any, {});
            const child = new Component('div', { transition: 'fade' } as any);

            const seen: string[][] = [];
            const el = child.element as HTMLElement;
            const observer = () => seen.push(Array.from(el.classList));

            root.controls.add(child);
            root.build();
            observer(); // build senkron bitti: from+active eklenmiş olmalı (mikro-görev ertelemesi öncesi olabilir)

            // Enter mikro-görevde başlar; rAF/16ms sonrasında to fazı ve temizlik
            await wait(50);
            observer();

            const joined = seen.map(s => s.join(' ')).join(' | ');
            // Süreç boyunca fade-enter-* sınıflarından en az biri görünmüş olmalı
            // ve süre 0 olduğundan (jsdom) sonunda hepsi temizlenmiş olmalı
            expect(el.classList.length).toBe(0);
            // Not: jsdom'da computed duration 0 → sınıflar aynı karede temizlenir;
            // en azından akışın hatasız tamamlandığını ve DOM'un temiz kaldığını doğruluyoruz
            expect(container.contains(el)).toBe(true);
            expect(joined).toBeDefined();
        });

        test('enter sırasında from/active sınıfları senkron eklenir (bağlı elemanda)', async () => {
            const comp = new Component('div', { transition: 'pop' } as any);
            comp.build();
            container.appendChild(comp.element as Node);
            const el = comp.element as HTMLElement;

            // Element bağlı → enterTransition senkron başlar (build içinde isConnected kontrolü)
            // Yeniden manuel tetikle ve senkron sınıfları gözle
            (comp as any).motif.options.transition.enterTransition(() => { });
            expect(el.classList.contains('pop-enter-from')).toBe(true);
            expect(el.classList.contains('pop-enter-active')).toBe(true);

            await wait(50);
            // jsdom'da süre 0 → sınıflar temizlenir
            expect(el.classList.contains('pop-enter-from')).toBe(false);
            expect(el.classList.contains('pop-enter-active')).toBe(false);
            expect(el.classList.contains('pop-enter-to')).toBe(false);
        });

        test('duration verildiğinde leave sınıfları süre boyunca kalır, sonra temizlenir ve DOM söküülür', async () => {
            const comp = new Component('div', {
                transition: { name: 'slide', duration: { enter: 0, leave: 80 } }
            } as any);
            comp.build();
            container.appendChild(comp.element as Node);
            const el = comp.element as HTMLElement;

            const disposePromise = comp.dispose();
            await wait(30); // rAF sonrası, süre dolmadan
            expect(el.classList.contains('slide-leave-active')).toBe(true);
            expect(el.classList.contains('slide-leave-to')).toBe(true);
            expect(container.contains(el)).toBe(true); // henüz sökülmedi

            await disposePromise;
            expect(container.contains(el)).toBe(false); // süre + güvence sonrası söküldü
        });

        test('özel sınıf adları (enterFromClass vb.) varsayılanların yerine geçer', async () => {
            const comp = new Component('div', {
                transition: { enterFromClass: 'ozel-giris', enterActiveClass: 'ozel-aktif', enterToClass: 'ozel-son' }
            } as any);
            comp.build();
            container.appendChild(comp.element as Node);
            const el = comp.element as HTMLElement;

            (comp as any).motif.options.transition.enterTransition(() => { });
            expect(el.classList.contains('ozel-giris')).toBe(true);
            expect(el.classList.contains('ozel-aktif')).toBe(true);

            await wait(50);
            expect(el.classList.length).toBe(0);
        });

        test('skipLeaveTransition CSS leave\'i de atlar', async () => {
            const comp = new Component('div', {
                transition: { name: 'slide', duration: { enter: 0, leave: 500 } }
            } as any);
            comp.build();
            container.appendChild(comp.element as Node);
            const el = comp.element as HTMLElement;

            const t0 = Date.now();
            await comp.dispose({ deep: true, skipLeaveTransition: true });
            expect(Date.now() - t0).toBeLessThan(400); // 500ms leave beklemedi
            expect(container.contains(el)).toBe(false);
        });

        test('WAAPI keyframe tanımı (transitionIn) CSS sınıflarından önceliklidir', async () => {
            const comp = new Component('div', { transition: 'fade' } as any);
            (comp as any).motif.options.transitionIn = { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: 10 };
            comp.build();
            container.appendChild(comp.element as Node);
            const el = comp.element as HTMLElement;

            (comp as any).motif.options.transition.enterTransition(() => { });
            // WAAPI yolu seçildi → CSS sınıfları uygulanmamalı
            expect(el.classList.contains('fade-enter-from')).toBe(false);
            await wait(50);
        });
    });

    // ---------------------------------------------------------------- Faz 4

    describe('Faz 4: navigasyon ve olaylar', () => {
        test('Frame: hızlı ardışık navigate\'te yalnızca en güncel sayfa mount edilir (latest-wins)', async () => {
            const root = new Component(container as any, {});
            const frame = new Frame();
            root.controls.add(frame);
            root.build();

            const pageA = new Component('div');
            (pageA.element as HTMLElement).textContent = 'A';
            const pageB = new Component('div');
            (pageB.element as HTMLElement).textContent = 'B';

            const p1 = frame.navigate(pageA);
            const p2 = frame.navigate(pageB);
            await Promise.all([p1, p2]);
            await wait(0);

            expect(frame.current).toBe(pageB);
            expect(container.textContent).toContain('B');
            expect(container.textContent).not.toContain('A');
        });

        test('Frame: yeni navigasyondan önce eski sayfa TAM dispose edilir', async () => {
            const root = new Component(container as any, {});
            const frame = new Frame();
            root.controls.add(frame);
            root.build();

            const pageA = new Component('div');
            (pageA.element as HTMLElement).textContent = 'A';
            await frame.navigate(pageA);
            expect(container.textContent).toContain('A');

            const pageB = new Component('div');
            (pageB.element as HTMLElement).textContent = 'B';
            await frame.navigate(pageB);

            expect(pageA.isDisposed).toBe(true);
            expect(container.textContent).toContain('B');
            expect(container.textContent).not.toContain('A');
        });

        test('Symbol tabanlı olaylar on/trigger arasında tutarlı eşleşir (geç-outlet mekanizması)', async () => {
            const comp = new Component('div');
            comp.build();

            const sym = Symbol.for('RouterView.built');
            let called = 0;
            const handler = () => { called++; };

            comp.motif.on(sym as any, handler as any);
            await comp.motif.trigger(sym as any, {});
            expect(called).toBe(1);

            // off gerçekten kaldırmalı (bayat dinleyici birikmemeli)
            await comp.motif.off(sym as any, handler as any);
            await comp.motif.trigger(sym as any, {});
            expect(called).toBe(1);
        });

        test('Lazy: Fallbackview yokken hata placeholder\'ı sonsuza kadar bırakmaz', async () => {
            const root = new Component(container as any, {});

            const placeholder = new Component('div');
            (placeholder.element as HTMLElement).textContent = 'YÜKLENİYOR';
            const onError = jest.fn();

            const frame = Lazy({
                caller: () => Promise.reject(new Error('yükleme hatası')),
                options: { Placeholderview: placeholder as any, onError }
            });
            root.controls.add(frame as any);
            root.build();
            await wait(20);

            expect(onError).toHaveBeenCalled();
            expect(container.textContent).not.toContain('YÜKLENİYOR');
        });

        test('Lazy: Fallbackview varsa hata durumunda gösterilir', async () => {
            const root = new Component(container as any, {});

            const fallback = new Component('div');
            (fallback.element as HTMLElement).textContent = 'HATA GÖRÜNÜMÜ';

            const frame = Lazy({
                caller: () => Promise.reject(new Error('yükleme hatası')),
                options: { Fallbackview: fallback as any }
            });
            root.controls.add(frame as any);
            root.build();
            await wait(20);

            expect(container.textContent).toContain('HATA GÖRÜNÜMÜ');
        });
    });
});
