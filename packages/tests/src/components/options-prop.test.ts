/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, motifComponent } from '@motifx/core';
import { createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe('options prop merges into component options', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    test('plain Component reads hideStrategy from the options prop', () => {
        const c = new Component('div', { options: { hideStrategy: 'detach' } } as any);
        expect(c.motif.options.hideStrategy).toBe('detach');
        expect((c.element as HTMLElement).hasAttribute('options')).toBe(false);
    });

    test('subclass reads hideStrategy and disableDisposal', () => {
        class Panel extends Component<HTMLDivElement> {
            constructor(props: any) { super('div', props); }
        }
        const p = new Panel({ options: { hideStrategy: 'placeholder', disableDisposal: true } });
        expect(p.motif.options.hideStrategy).toBe('placeholder');
        expect((p.motif.options as any).disableDisposal).toBe(true);
    });

    test('unknown option keys are ignored', () => {
        const c = new Component('div', { options: { transition: 'x', foo: 1 } } as any);
        expect(c.motif.options.transition.name).toBe('');
        expect((c.motif.options as any).foo).toBeUndefined();
    });

    test('function component root receives options through the tag', () => {
        const Fn = () => new Component('div');
        const root = motifComponent(Fn, { options: { hideStrategy: 'detach' } }) as ComponentBase;
        expect(root.motif.options.hideStrategy).toBe('detach');
    });

    test('detach strategy removes the element instead of leaving a placeholder', async () => {
        const child = new Component('div', { options: { hideStrategy: 'detach' } } as any);
        const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(child); } });
        root.build();
        container.appendChild(root.element as Node);
        await child.motif.hide();
        expect((root.element as HTMLElement).childNodes.length).toBe(0);
        await child.motif.show();
        expect((root.element as HTMLElement).firstChild).toBe(child.element);
    });
});
