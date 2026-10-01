import { Component, ComponentBase, FragmentNode } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe('skipNextLeave with hide() on the placeholder strategy', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    async function mountChild(child: ComponentBase) {
        const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(child); } });
        container.appendChild(root.element as Node);
        root.build();
        await wait(80);
        return root;
    }

    test('hide() skips the leave animation, swaps in the placeholder at once and consumes the flag', async () => {
        const child = new Component('div', { transition: 'fade' } as any);
        await mountChild(child);
        const el = child.element as HTMLElement;
        const parent = el.parentNode as Node;

        child.motif.options.transition.skipNextLeave = true;
        await child.motif.hide();

        expect(el.parentNode).toBeNull();
        expect(el.classList.contains('fade-leave-active')).toBe(false);
        expect((child.motif.options as any).placeholder.parentNode).toBe(parent);
        expect(child.isVisible).toBe(false);
        expect(child.motif.options.transition.skipNextLeave).toBe(false);
    });

    test('the flag only affects one hide(); the next hide() animates again', async () => {
        const child = new Component('div', { transition: 'fade' } as any);
        await mountChild(child);
        const el = child.element as HTMLElement;

        child.motif.options.transition.skipNextLeave = true;
        await child.motif.hide();
        await child.motif.show();
        await wait(80);

        const hiding = child.motif.hide();
        await Promise.resolve();
        expect(el.classList.contains('fade-leave-active')).toBe(true);
        await hiding;
        await wait(80);
        expect(el.parentNode).toBeNull();
    });

    test('on a fragment root the skip is passed to visible children', async () => {
        const a = new Component('div', { transition: 'fade' } as any);
        const b = new Component('div', { transition: 'fade' } as any);
        const frag = new FragmentNode({ initializeComponent: (s: ComponentBase) => { s.controls.add(a, b); } });
        await mountChild(frag);
        const elA = a.element as HTMLElement;
        const elB = b.element as HTMLElement;

        frag.motif.options.transition.skipNextLeave = true;
        await frag.motif.hide();
        await Promise.resolve();

        expect(elA.parentNode).toBeNull();
        expect(elB.parentNode).toBeNull();
        expect(elA.classList.contains('fade-leave-active')).toBe(false);
        expect(elB.classList.contains('fade-leave-active')).toBe(false);
        expect(a.motif.options.transition.skipNextLeave).toBe(false);
        expect(b.motif.options.transition.skipNextLeave).toBe(false);
        expect(frag.motif.options.transition.skipNextLeave).toBe(false);
    });

    test('an already hidden child of a fragment root does not keep a stale flag', async () => {
        const a = new Component('div', { transition: 'fade' } as any);
        const b = new Component('div', { transition: 'fade' } as any);
        const frag = new FragmentNode({ initializeComponent: (s: ComponentBase) => { s.controls.add(a, b); } });
        await mountChild(frag);

        b.motif.options.transition.skipNextLeave = true;
        await b.motif.hide();
        expect(b.isVisible).toBe(false);

        frag.motif.options.transition.skipNextLeave = true;
        await frag.motif.hide();

        expect(b.motif.options.transition.skipNextLeave).toBe(false);
    });
});
