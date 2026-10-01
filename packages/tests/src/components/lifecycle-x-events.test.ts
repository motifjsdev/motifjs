/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, EventArgs } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

class Box extends Component<HTMLDivElement> {
    constructor() { super('div'); }
}

describe('on("x:…") lifecycle events', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    test('config, configured, building and built fire in order on a subclass instance', () => {
        const box = new Box();
        const seen: string[] = [];
        box.motif.on('x:config', () => { seen.push('config'); });
        box.motif.on('x:configured', () => { seen.push('configured'); });
        box.motif.on('x:building', () => { seen.push('building'); });
        box.motif.on('x:built', (sender: ComponentBase, e: EventArgs) => { seen.push('built:' + (sender === box) + ':' + (e.cancel === false)); });
        box.build();
        expect(seen).toEqual(['config', 'configured', 'building', 'built:true:true']);
    });

    test('disposing and disposed fire during dispose', async () => {
        const box = new Box();
        const seen: string[] = [];
        box.motif.on('x:disposing', () => { seen.push('disposing'); });
        box.motif.on('x:disposed', () => { seen.push('disposed'); });
        box.build();
        container.appendChild(box.element as Node);
        await box.dispose();
        expect(seen).toEqual(['disposing', 'disposed']);
    });

    test('visibilitychanged fires on hide and show', async () => {
        const box = new Box();
        let count = 0;
        box.motif.on('x:visibilityChanged', () => { count++; });
        const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(box); } });
        root.build();
        container.appendChild(root.element as Node);
        await box.motif.hide();
        await wait(30);
        await box.motif.show();
        expect(count).toBe(2);
    });

    test('off removes an x: listener', () => {
        const box = new Box();
        let fired = 0;
        const cb = () => { fired++; };
        box.motif.on('x:built', cb);
        box.motif.off('x:built', cb);
        box.build();
        expect(fired).toBe(0);
    });

    test('x:mounted still fires once the element is attached', async () => {
        const box = new Box();
        let mounted = 0;
        box.motif.on('x:mounted', () => { mounted++; });
        box.build();
        container.appendChild(box.element as Node);
        await wait(20);
        expect(mounted).toBe(1);
    });
});
