/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe('appear transition classes', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    test('first enter uses appear classes, later enters use enter classes', async () => {
        const child = new Component('div', {
            transition: { name: 'fx', appearFromClass: 'ap-from', appearActiveClass: 'ap-active', appearToClass: 'ap-to' }
        } as any);
        const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(child); } });
        container.appendChild(root.element as Node);
        root.build();
        await Promise.resolve();

        const el = child.element as HTMLElement;
        expect(el.classList.contains('ap-from')).toBe(true);
        expect(el.classList.contains('ap-active')).toBe(true);
        expect(el.classList.contains('fx-enter-from')).toBe(false);

        await wait(80);
        expect(el.classList.contains('ap-from')).toBe(false);
        expect(el.classList.contains('ap-active')).toBe(false);

        await child.motif.hide();
        await wait(80);
        expect(el.parentNode).toBeNull();

        await child.motif.show();
        expect(el.classList.contains('fx-enter-from')).toBe(true);
        expect(el.classList.contains('fx-enter-active')).toBe(true);
        expect(el.classList.contains('ap-from')).toBe(false);
    });

    test('without appear classes the first enter falls back to enter classes', async () => {
        const child = new Component('div', { transition: 'fade' } as any);
        const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(child); } });
        container.appendChild(root.element as Node);
        root.build();
        await Promise.resolve();

        const el = child.element as HTMLElement;
        expect(el.classList.contains('fade-enter-from')).toBe(true);
        expect(el.classList.contains('fade-enter-active')).toBe(true);
    });
});
