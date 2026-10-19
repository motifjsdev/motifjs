/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, FragmentNode } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

function stubKeyframes(c: ComponentBase, order: 'browser' | 'manual' = 'browser', ms = 30) {
    c.motif.options.transition.out({ keyframes: [{ opacity: 1 }, { opacity: 0 }], options: ms });
    const animation: any = new EventTarget();
    let settle: (value: any) => void = () => { };
    let abort: (reason: any) => void = () => { };
    animation.finished = new Promise((r, j) => { settle = r; abort = j; });
    animation.finished.catch(() => { });
    animation.cancel = () => {
        animation.oncancel?.();
        animation.dispatchEvent(new Event('cancel'));
        const e = new Error('The user aborted a request.');
        e.name = 'AbortError';
        abort(e);
    };
    if (order === 'browser') {
        setTimeout(() => {
            settle(animation);
            setTimeout(() => animation.dispatchEvent(new Event('finish')), 0);
        }, ms);
    }
    (c.element as any).animate = () => animation;
    return animation;
}

const settled = (p: Promise<unknown>) => {
    const s = { state: 'pending' };
    p.then(() => { s.state = 'resolved'; }, (e) => { s.state = 'rejected:' + (e && e.name); });
    return s;
};

describe('await motif.hide() settles after the leave has ended', () => {
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

    test('css class leave: the element is out and the trace is in its place', async () => {
        const child = new Component('div', { transition: 'fade' } as any);
        const root = await mountChild(child);
        const el = child.element as HTMLElement;

        await child.motif.hide();

        expect(child.isVisible).toBe(false);
        expect(el.parentNode).toBeNull();
        expect(el.classList.contains('fade-leave-active')).toBe(false);
        expect((child.motif.options as any).placeholder.parentNode).toBe(root.element);
    });

    test('show() after an awaited hide() brings the component back', async () => {
        const child = new Component('div', { transition: { name: 'fx', duration: 40 } } as any);
        const root = await mountChild(child);

        await child.motif.hide();
        await child.motif.show();
        await wait(200);

        expect(child.isVisible).toBe(true);
        expect((child.element as HTMLElement).parentNode).toBe(root.element);
    });

    test('keyframe leave: settles after the finish event when the finished promise resolves first', async () => {
        const child = new Component('div');
        await mountChild(child);
        stubKeyframes(child, 'browser');

        await child.motif.hide();

        expect(child.isVisible).toBe(false);
        expect((child.element as HTMLElement).parentNode).toBeNull();
    });

    test('fragment: hide() waits for the leave of every child', async () => {
        const a = new Component('div', { transition: { name: 'fx', duration: 60 } } as any);
        const b = new Component('span');
        const frag = new FragmentNode({ initializeComponent: (s: ComponentBase) => { s.controls.add(a, b); } });
        const root = await mountChild(frag);

        await frag.motif.hide();

        expect(frag.isVisible).toBe(false);
        expect(a.isVisible).toBe(true);
        expect(b.isVisible).toBe(true);
        expect((a.element as HTMLElement).parentNode).toBeNull();
        expect((b.element as HTMLElement).parentNode).toBeNull();

        await frag.motif.show();
        await wait(200);
        expect(a.isVisible).toBe(true);
        expect((a.element as HTMLElement).parentNode).toBe(root.element);
        expect((b.element as HTMLElement).parentNode).toBe(root.element);
    });

    test('a cancelled keyframe leave completes the hide at once, like a cut css leave', async () => {
        const child = new Component('div');
        const root = await mountChild(child);
        const animation = stubKeyframes(child, 'manual', 1000);

        const s = settled(child.motif.hide());
        await wait(20);
        expect(s.state).toBe('pending');
        expect(child.isVisible).toBe(true);

        animation.cancel();
        await wait(20);

        expect(s.state).toBe('resolved');
        expect(child.isVisible).toBe(false);
        expect((child.element as HTMLElement).parentNode).toBeNull();
        expect((child.motif.options as any).placeholder.parentNode).toBe(root.element);
    });

    test('a cancelled keyframe leave with hideStrategy detach settles too', async () => {
        const child = new Component('div', { options: { hideStrategy: 'detach' } } as any);
        await mountChild(child);
        const animation = stubKeyframes(child, 'manual', 1000);

        const s = settled(child.motif.hide());
        await wait(20);
        expect(s.state).toBe('pending');

        animation.cancel();
        await wait(20);

        expect(s.state).toBe('resolved');
        expect(child.isVisible).toBe(false);
        expect((child.element as HTMLElement).parentNode).toBeNull();
    });

    test('a css leave cut by stopAnimations() still completes the hide', async () => {
        const child = new Component('div', { transition: { name: 'fx', duration: 2000 } } as any);
        await mountChild(child);

        const s = settled(child.motif.hide());
        await wait(40);
        expect(s.state).toBe('pending');
        await child.motif.stopAnimations();
        await wait(10);

        expect(s.state).toBe('resolved');
        expect(child.isVisible).toBe(false);
    });
});
