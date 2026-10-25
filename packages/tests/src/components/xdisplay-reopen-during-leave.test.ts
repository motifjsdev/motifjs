/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, FragmentNode, reactive } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

function stubKeyframes(c: ComponentBase, ms = 1000) {
    c.motif.options.transition.out({ keyframes: [{ opacity: 1 }, { opacity: 0 }], options: ms });
    const animation: any = new EventTarget();
    let abort: (reason: any) => void = () => { };
    animation.finished = new Promise((_, j) => { abort = j; });
    animation.finished.catch(() => { });
    animation.cancelled = false;
    animation.cancel = () => {
        animation.cancelled = true;
        animation.oncancel?.();
        animation.dispatchEvent(new Event('cancel'));
        const e = new Error('The user aborted a request.');
        e.name = 'AbortError';
        abort(e);
    };
    (c.element as any).animate = () => animation;
    return animation;
}

const settled = (p: Promise<unknown>) => {
    const s = { state: 'pending' };
    p.then(() => { s.state = 'resolved'; }, (e) => { s.state = 'rejected:' + (e && e.name); });
    return s;
};

const slide = { name: 'slide', duration: 220 };

describe('show() while the leave transition is still running', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    async function mount(child: ComponentBase) {
        const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(child); } });
        container.appendChild(root.element as Node);
        root.build();
        await wait(80);
        return root;
    }

    test('x-display turned back on 100 ms into a 220 ms leave: the element stays in the DOM', async () => {
        const state = reactive({ open: true });
        const panel = new Component('aside', { 'x-display': () => state.open, transition: slide } as any);
        const root = await mount(panel);
        const el = panel.element as HTMLElement;
        expect(el.parentNode).toBe(root.element);

        state.open = false;
        await wait(100);
        state.open = true;
        await wait(500);

        expect(panel.isWait).toBe(false);
        expect(panel.isVisible).toBe(true);
        expect(el.parentNode).toBe(root.element);
        expect(el.classList.contains('slide-leave-active')).toBe(false);
        expect(el.classList.contains('slide-leave-to')).toBe(false);
    });

    test('x-display turned back on after the leave finished: the enter brings the element back', async () => {
        const state = reactive({ open: true });
        const panel = new Component('aside', { 'x-display': () => state.open, transition: slide } as any);
        const root = await mount(panel);
        const el = panel.element as HTMLElement;

        state.open = false;
        await wait(400);
        expect(el.parentNode).toBeNull();
        state.open = true;
        await wait(400);

        expect(panel.isVisible).toBe(true);
        expect(el.parentNode).toBe(root.element);
    });

    test('the cut leave is followed by the enter transition', async () => {
        const state = reactive({ open: true });
        const panel = new Component('aside', { 'x-display': () => state.open, transition: slide } as any);
        await mount(panel);
        const el = panel.element as HTMLElement;

        state.open = false;
        await wait(100);
        expect(el.classList.contains('slide-leave-active')).toBe(true);
        state.open = true;
        await wait(30);

        expect(el.classList.contains('slide-leave-active')).toBe(false);
        expect(el.classList.contains('slide-enter-active')).toBe(true);
        await wait(400);
        expect(el.classList.contains('slide-enter-active')).toBe(false);
        expect(panel.isVisible).toBe(true);
    });

    test('imperative: show() 100 ms into the leave keeps the element', async () => {
        const panel = new Component('aside', { transition: slide } as any);
        const root = await mount(panel);
        const el = panel.element as HTMLElement;

        panel.motif.hide();
        await wait(100);
        panel.motif.show();
        await wait(500);

        expect(panel.isVisible).toBe(true);
        expect(el.parentNode).toBe(root.element);
    });

    test('await motif.hide() cut by show() settles and the component stays visible', async () => {
        const panel = new Component('aside', { transition: slide } as any);
        const root = await mount(panel);
        const el = panel.element as HTMLElement;

        const s = settled(panel.motif.hide());
        await wait(100);
        expect(s.state).toBe('pending');
        panel.motif.show();
        await wait(30);

        expect(s.state).toBe('resolved');
        expect(panel.isVisible).toBe(true);
        expect(el.parentNode).toBe(root.element);
        await wait(400);
        expect(el.parentNode).toBe(root.element);
        expect((panel.motif.options as any).placeholder?.parentNode ?? null).toBeNull();
    });

    test('keyframe leave cut by show(): the animation is cancelled and the element stays', async () => {
        const panel = new Component('aside');
        const root = await mount(panel);
        const animation = stubKeyframes(panel);
        const el = panel.element as HTMLElement;

        const s = settled(panel.motif.hide());
        await wait(20);
        panel.motif.show();
        await wait(20);

        expect(animation.cancelled).toBe(true);
        expect(s.state).toBe('resolved');
        expect(panel.isVisible).toBe(true);
        expect(el.parentNode).toBe(root.element);
    });

    test('hideStrategy detach: show() during the leave keeps the element and reports visible again', async () => {
        const seen: boolean[] = [];
        class Panel extends Component<HTMLElement> {
            onVisibilityChanged(_s: ComponentBase, e: { visible: boolean }) { seen.push(e.visible); }
        }
        const panel = new Panel('aside', { options: { hideStrategy: 'detach' }, transition: slide } as any);
        const root = await mount(panel);
        const el = panel.element as HTMLElement;

        const s = settled(panel.motif.hide());
        await wait(100);
        expect(seen).toEqual([false]);
        panel.motif.show();
        await wait(500);

        expect(s.state).toBe('resolved');
        expect(seen).toEqual([false, true]);
        expect(panel.isVisible).toBe(true);
        expect(el.parentNode).toBe(root.element);
    });

    test('fragment: children reopened during their leave stay in the DOM', async () => {
        const state = reactive({ open: true });
        const a = new Component('div', { transition: slide } as any);
        const b = new Component('span');
        const frag = new FragmentNode({ 'x-display': () => state.open, initializeComponent: (s: ComponentBase) => { s.controls.add(a, b); } } as any);
        const root = await mount(frag);
        const elA = a.element as HTMLElement;
        const elB = b.element as HTMLElement;
        expect(elA.parentNode).toBe(root.element);
        expect(elB.parentNode).toBe(root.element);

        state.open = false;
        await wait(100);
        expect(elA.classList.contains('slide-leave-active')).toBe(true);
        expect(elB.parentNode).toBeNull();
        state.open = true;
        await wait(500);

        expect(frag.isVisible).toBe(true);
        expect(elA.parentNode).toBe(root.element);
        expect(elB.parentNode).toBe(root.element);
        expect(elA.classList.contains('slide-leave-active')).toBe(false);
        expect(elA.classList.contains('slide-leave-to')).toBe(false);
    });

    test('hide → show → hide in quick succession ends hidden', async () => {
        const panel = new Component('aside', { transition: slide } as any);
        const root = await mount(panel);
        const el = panel.element as HTMLElement;

        panel.motif.hide();
        await wait(50);
        panel.motif.show();
        await wait(50);
        panel.motif.hide();
        await wait(500);

        expect(panel.isVisible).toBe(false);
        expect(el.parentNode).toBeNull();
        expect((panel.motif.options as any).placeholder.parentNode).toBe(root.element);
    });

    test('x-display toggled off, on, off within one leave ends hidden', async () => {
        const state = reactive({ open: true });
        const panel = new Component('aside', { 'x-display': () => state.open, transition: slide } as any);
        const root = await mount(panel);
        const el = panel.element as HTMLElement;

        state.open = false;
        await wait(50);
        state.open = true;
        await wait(50);
        state.open = false;
        await wait(500);

        expect(panel.isWait).toBe(true);
        expect(panel.isVisible).toBe(false);
        expect(el.parentNode).toBeNull();
        expect((panel.motif.options as any).placeholder.parentNode).toBe(root.element);
    });
});
