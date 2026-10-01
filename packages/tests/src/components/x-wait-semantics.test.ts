/**
 * @jest-environment jsdom
 *
 * `x-wait` / `x-display` ile `{cond && <X/>}` (bindings.when) arasındaki ÖLÇÜLMÜŞ farklar.
 *
 * Dokümantasyonda koşullu gösterim için `x-wait` birincil yöntem olarak öğretiliyor; bu dosya
 * o anlatımın dayanağıdır. Doğrulanan iddialar:
 *   1. `x-wait` başlangıçta true ise eleman hiç build edilmez (DOM yok, çocuk DOM'u yok).
 *   2. false'a dönünce bir kez kurulur.
 *   3. Tekrar true olunca gizlenir ama ÖRNEK KORUNUR (dispose edilmez, durum yaşar).
 *   4. `bindings.when` her açılışta yeni örnek kurar, her kapanışta dispose eder.
 *   5. `x-display` `x-wait`'in tersidir (true → görünür).
 */
import { Component, ComponentBase, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function mount() {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    return host;
}
const html = (host: Component<HTMLDivElement>) => (host.element as unknown as HTMLElement).innerHTML;

describe('x-wait semantics vs bindings.when', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('1+2+3: başlangıçta bekleyen eleman kurulmaz, açılınca kurulur, kapanınca örnek korunur', async () => {
        const st = reactive({ hidden: true });
        const host = mount();

        let buildCount = 0;
        let disposeCount = 0;
        const child = new Component('span', {
            'x-wait': () => st.hidden,
            onbuilt: () => { buildCount++; },
            ondisposed: () => { disposeCount++; },
        } as any);
        (child.element as unknown as HTMLElement).id = 'target';
        host.controls.add(child);
        await tick();

        // 1 — hiç build edilmedi
        expect(buildCount).toBe(0);
        expect(html(host)).not.toContain('id="target"');
        expect(child.isBuilt).toBe(false);

        // 2 — açılınca bir kez kurulur
        st.hidden = false;
        await tick();
        expect(buildCount).toBe(1);
        expect(html(host)).toContain('id="target"');

        // örnek üzerinde durum bırak
        (child.element as unknown as HTMLElement).dataset.state = 'korundu';

        // 3 — kapanınca dispose YOK, örnek korunur
        st.hidden = true;
        await tick();
        expect(disposeCount).toBe(0);
        expect(child.isDisposed).toBe(false);

        st.hidden = false;
        await tick();
        expect(buildCount).toBe(1); // yeniden kurulmadı
        expect((child.element as unknown as HTMLElement).dataset.state).toBe('korundu');
    });

    it('4: bindings.when her açılışta yeni örnek kurar ve kapanışta dispose eder', async () => {
        const st = reactive({ show: false });
        const host = mount();

        let created = 0;
        let disposed = 0;
        host.bindings.when(() => st.show, () => {
            created++;
            const c = new Component('span', { ondisposed: () => { disposed++; } } as any);
            (c.element as unknown as HTMLElement).id = 'w';
            return c as any;
        });
        await tick();
        expect(created).toBe(0);

        st.show = true;
        await tick();
        expect(created).toBe(1);
        expect(html(host)).toContain('id="w"');

        st.show = false;
        await tick();
        expect(disposed).toBe(1);

        st.show = true;
        await tick();
        expect(created).toBe(2); // YENİ örnek — önceki durum kayıp
    });

    it('5: x-display x-wait in tersidir', async () => {
        const st = reactive({ visible: false });
        const host = mount();
        const c = new Component('span', { 'x-display': () => st.visible } as any);
        (c.element as unknown as HTMLElement).id = 'd';
        host.controls.add(c);
        await tick();
        expect(html(host)).not.toContain('id="d"');

        st.visible = true;
        await tick();
        expect(html(host)).toContain('id="d"');
    });

    it('bekleyen elemanın ÇOCUKLARI da DOM a girmez', async () => {
        const st = reactive({ hidden: true });
        const host = mount();

        let childBuilt = 0;
        const inner = new Component('b', { onbuilt: () => { childBuilt++; } } as any);
        (inner.element as unknown as HTMLElement).id = 'inner';
        const outer = new Component('div', { 'x-wait': () => st.hidden } as any);
        outer.controls.add(inner);
        host.controls.add(outer);
        await tick();

        expect(html(host)).not.toContain('id="inner"');
        expect(childBuilt).toBe(0);

        st.hidden = false;
        await tick();
        expect(html(host)).toContain('id="inner"');
        expect(childBuilt).toBe(1);
    });
});
