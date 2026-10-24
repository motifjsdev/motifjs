/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

function keyframeAnimations(c: ComponentBase) {
    const made: any[] = [];
    (c.element as any).animate = (keyframes: any, options: any) => {
        const ms = typeof options === 'number' ? options : options?.duration ?? 0;
        const animation: any = new EventTarget();
        animation.keyframes = keyframes;
        animation.playState = 'running';
        animation.cancelled = false;
        let settle: (value: any) => void = () => { };
        let abort: (reason: any) => void = () => { };
        animation.finished = new Promise((r, j) => { settle = r; abort = j; });
        const timer = setTimeout(() => {
            animation.playState = 'finished';
            settle(animation);
            setTimeout(() => animation.dispatchEvent(new Event('finish')), 0);
        }, ms);
        animation.cancel = () => {
            if (animation.playState === 'idle') return;
            clearTimeout(timer);
            animation.playState = 'idle';
            animation.cancelled = true;
            const e = new Error('The user aborted a request.');
            e.name = 'AbortError';
            abort(e);
            animation.finished = new Promise(() => { });
            setTimeout(() => {
                animation.oncancel?.();
                animation.dispatchEvent(new Event('cancel'));
            }, 0);
        };
        made.push(animation);
        return animation;
    };
    return made;
}

const settled = (p: Promise<unknown>) => {
    const s = { state: 'pending' };
    p.then(() => { s.state = 'resolved'; }, (e) => { s.state = 'rejected:' + (e && e.name); });
    return s;
};

describe('motif.stopAnimations() cancels running keyframe animations', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    async function mountChild(child: ComponentBase) {
        const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(child); } });
        container.appendChild(root.element as Node);
        root.build();
        await wait(20);
        return root;
    }

    test('a running enter is cancelled and the call settles without waiting for its end', async () => {
        const child = new Component('div');
        const made = keyframeAnimations(child);
        child.motif.options.transition.in({ keyframes: [{ opacity: 0 }, { opacity: 1 }], options: 2000 });
        await mountChild(child);
        expect(made).toHaveLength(1);

        const s = settled(child.motif.stopAnimations());
        await wait(20);

        expect(s.state).toBe('resolved');
        expect(made[0].cancelled).toBe(true);
        expect(child.motif.options.transition.activeAnimations).toEqual([]);
    });

    test('hiding during an enter cancels the enter and keeps the leave in the list until it ends', async () => {
        const child = new Component('div');
        const made = keyframeAnimations(child);
        child.motif.options.transition.in({ keyframes: [{ opacity: 0 }, { opacity: 1 }], options: 150 });
        child.motif.options.transition.out({ keyframes: [{ opacity: 1 }, { opacity: 0 }], options: 400 });
        const root = await mountChild(child);

        const hidden = child.motif.hide();
        expect(made).toHaveLength(2);
        expect(made[0].cancelled).toBe(true);
        expect(child.motif.options.transition.activeAnimations).toEqual([made[1]]);

        await wait(250);
        expect(made[1].playState).toBe('running');
        expect(child.motif.options.transition.activeAnimations).toEqual([made[1]]);

        await hidden;
        expect(child.isVisible).toBe(false);
        expect((child.element as HTMLElement).parentNode).toBeNull();
        expect((child.motif.options as any).placeholder.parentNode).toBe(root.element);
        expect(child.motif.options.transition.activeAnimations).toEqual([]);
    });

    test('stopping a keyframe leave completes the hide at once', async () => {
        const child = new Component('div');
        const made = keyframeAnimations(child);
        child.motif.options.transition.out({ keyframes: [{ opacity: 1 }, { opacity: 0 }], options: 2000 });
        const root = await mountChild(child);

        const s = settled(child.motif.hide());
        await wait(20);
        expect(s.state).toBe('pending');

        await child.motif.stopAnimations();
        await wait(20);

        expect(made[0].cancelled).toBe(true);
        expect(s.state).toBe('resolved');
        expect(child.isVisible).toBe(false);
        expect((child.motif.options as any).placeholder.parentNode).toBe(root.element);
    });

    test('an animation that has already finished is not cancelled', async () => {
        const child = new Component('div');
        await mountChild(child);
        const cancel = jest.fn();
        child.motif.options.transition.activeAnimations = [{ playState: 'finished', finished: Promise.resolve(), cancel } as any];

        await child.motif.stopAnimations();

        expect(cancel).not.toHaveBeenCalled();
        expect(child.motif.options.transition.activeAnimations).toEqual([]);
    });

    test('disposing a component cancels its running keyframe animation', async () => {
        const child = new Component('div');
        const made = keyframeAnimations(child);
        child.motif.options.transition.in({ keyframes: [{ opacity: 0 }, { opacity: 1 }], options: 2000 });
        await mountChild(child);

        const s = settled(child.disposeAsync());
        await wait(20);

        expect(s.state).toBe('resolved');
        expect(made[0].cancelled).toBe(true);
    });

    test('disposing a parent cancels the running keyframe animations of its children', async () => {
        const child = new Component('div');
        const made = keyframeAnimations(child);
        child.motif.options.transition.in({ keyframes: [{ opacity: 0 }, { opacity: 1 }], options: 2000 });
        const root = await mountChild(child);

        const s = settled(root.dispose());
        await wait(20);

        expect(s.state).toBe('resolved');
        expect(made[0].cancelled).toBe(true);
    });
});
