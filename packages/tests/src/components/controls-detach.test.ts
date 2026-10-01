/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

const div = (text: string, props: any = {}) => new Component('div', {
    ...props,
    initializeComponent: (s: ComponentBase) => { (s.element as HTMLElement).textContent = text; }
});

function mountRoot(container: HTMLElement): Component {
    const root = new Component('div');
    root.build();
    container.appendChild(root.element as Node);
    return root;
}

describe('controls.detach / silentDetach / silentUnlink (no transition configured)', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    test('detach removes an element child synchronously without disposing it and allows re-adding', () => {
        const root = mountRoot(container);
        const child = div('a');
        root.controls.add(child);
        expect((root.element as HTMLElement).textContent).toBe('a');

        root.controls.detach(child);
        expect(child.isDisposed).toBe(false);
        expect(child.parent).toBeNull();
        expect(root.controls.length).toBe(0);
        expect((root.element as HTMLElement).childNodes.length).toBe(0);

        root.controls.add(child);
        expect((root.element as HTMLElement).textContent).toBe('a');
        expect(child.parent).toBe(root);
    });

    test('detach moves a fragment child out of the DOM and keeps its children alive', () => {
        const root = mountRoot(container);
        const frag = new Component();
        const inner = div('x');
        frag.controls.add(inner);
        root.controls.add(frag);
        expect((root.element as HTMLElement).textContent).toBe('x');

        root.controls.detach(frag);
        expect(frag.isDisposed).toBe(false);
        expect(inner.isDisposed).toBe(false);
        expect(frag.controls.length).toBe(1);
        expect((root.element as HTMLElement).childNodes.length).toBe(0);

        root.controls.add(frag);
        expect((root.element as HTMLElement).textContent).toBe('x');
    });

    test('reparenting a built fragment through controls.add keeps its children', () => {
        const rootA = mountRoot(container);
        const rootB = mountRoot(container);
        const frag = new Component();
        const inner = div('k');
        frag.controls.add(inner);
        rootA.controls.add(frag);
        expect((rootA.element as HTMLElement).textContent).toBe('k');

        rootB.controls.add(frag);
        expect((rootA.element as HTMLElement).textContent).toBe('');
        expect((rootB.element as HTMLElement).textContent).toBe('k');
        expect(inner.isDisposed).toBe(false);
        expect(frag.parent).toBe(rootB);
        expect(rootA.controls.length).toBe(0);
    });

    test('detach notifies controlremoved, silentDetach does not', async () => {
        const root = mountRoot(container);
        const a = div('a');
        const b = div('b');
        root.controls.add(a, b);
        const removed: ComponentBase[] = [];
        await root.motif.on('controlremoved' as any, ((e: any) => { removed.push(e.control); }) as any, false);

        root.controls.detach(a);
        expect(removed).toEqual([a]);
        expect((root.element as HTMLElement).textContent).toBe('b');

        root.controls.silentDetach(b);
        expect(removed).toEqual([a]);
        expect((root.element as HTMLElement).textContent).toBe('');
        expect(b.isDisposed).toBe(false);
    });

    test('silentUnlink leaves the DOM untouched', () => {
        const root = mountRoot(container);
        const child = div('u');
        root.controls.add(child);

        root.controls.silentUnlink(child);
        expect(root.controls.length).toBe(0);
        expect(child.parent).toBeNull();
        expect((root.element as HTMLElement).textContent).toBe('u');
    });

    test('detach of a hidden child removes its placeholder', async () => {
        const root = mountRoot(container);
        const child = div('h');
        root.controls.add(child);
        await child.motif.hide();
        expect((root.element as HTMLElement).childNodes.length).toBe(1);

        root.controls.detach(child);
        expect((root.element as HTMLElement).childNodes.length).toBe(0);
        expect(child.isDisposed).toBe(false);
    });
});

describe('controls.detach with a leave transition', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    const hasLeave = (c: ComponentBase, name: string) => {
        const cl = (c.element as HTMLElement).classList;
        return cl.contains(`${name}-leave-from`) || cl.contains(`${name}-leave-active`) || cl.contains(`${name}-leave-to`);
    };

    test('element root plays its own leave, DOM is removed and controlremoved fires only after it ends', async () => {
        const root = mountRoot(container);
        const child = div('a', { transition: 'fx' });
        root.controls.add(child);
        await wait(40);
        const removed: ComponentBase[] = [];
        await root.motif.on('controlremoved' as any, ((e: any) => { removed.push(e.control); }) as any, false);

        const done = root.controls.detach(child);
        expect(root.controls.length).toBe(0);
        expect(child.parent).toBeNull();
        expect((child.element as HTMLElement).parentNode).toBe(root.element);
        expect(hasLeave(child, 'fx')).toBe(true);
        expect(removed).toEqual([]);

        await done;
        expect((child.element as HTMLElement).parentNode).toBeNull();
        expect(child.isDisposed).toBe(false);
        expect(hasLeave(child, 'fx')).toBe(false);
        expect(removed).toEqual([child]);
    });

    test('fragment root distributes the leave to its element children, then moves the whole range out', async () => {
        const root = mountRoot(container);
        const frag = new Component();
        const a = div('a', { transition: 'fx' });
        const nested = new Component();
        const b = div('b', { transition: 'fy' });
        nested.controls.add(b);
        frag.controls.add(a, nested);
        root.controls.add(frag);
        await wait(40);
        expect((root.element as HTMLElement).textContent).toBe('ab');

        const done = root.controls.detach(frag);
        expect(hasLeave(a, 'fx')).toBe(true);
        expect(hasLeave(b, 'fy')).toBe(true);
        expect((root.element as HTMLElement).textContent).toBe('ab');

        await done;
        expect((root.element as HTMLElement).childNodes.length).toBe(0);
        expect(frag.isDisposed).toBe(false);
        expect(a.isDisposed).toBe(false);
        expect(b.isDisposed).toBe(false);
        expect(frag.controls.length).toBe(2);
        expect(nested.controls.length).toBe(1);
        expect(hasLeave(a, 'fx')).toBe(false);

        root.controls.add(frag);
        expect((root.element as HTMLElement).textContent).toBe('ab');
    });

    test('reparenting through controls.add waits for the leave before attaching to the new parent', async () => {
        const rootA = mountRoot(container);
        const rootB = mountRoot(container);
        const child = div('m', { transition: 'fx' });
        rootA.controls.add(child);
        await wait(40);

        rootB.controls.add(child);
        expect(child.parent).toBe(rootB);
        expect(rootB.controls.items).toContain(child);
        expect(rootA.controls.length).toBe(0);
        expect((child.element as HTMLElement).parentNode).toBe(rootA.element);
        expect(hasLeave(child, 'fx')).toBe(true);

        await wait(80);
        expect((child.element as HTMLElement).parentNode).toBe(rootB.element);
        expect((rootA.element as HTMLElement).childNodes.length).toBe(0);
        expect(child.isDisposed).toBe(false);
    });

    test('explicit detach followed by an immediate add lands the node in the new parent exactly once', async () => {
        const rootA = mountRoot(container);
        const rootB = mountRoot(container);
        const child = div('n', { transition: 'fx' });
        rootA.controls.add(child);
        await wait(40);

        rootA.controls.detach(child);
        rootB.controls.add(child);
        await wait(80);
        expect((rootB.element as HTMLElement).childNodes.length).toBe(1);
        expect((child.element as HTMLElement).parentNode).toBe(rootB.element);
        expect((rootA.element as HTMLElement).childNodes.length).toBe(0);
    });

    test('silentDetach never animates', async () => {
        const root = mountRoot(container);
        const child = div('s', { transition: 'fx' });
        root.controls.add(child);
        await wait(40);

        root.controls.silentDetach(child);
        expect((child.element as HTMLElement).parentNode).toBeNull();
        expect(hasLeave(child, 'fx')).toBe(false);
        expect(child.isDisposed).toBe(false);
    });
});
