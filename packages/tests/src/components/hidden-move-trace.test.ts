/**
 * @jest-environment jsdom
 */
import { Application, Component, errorHandler } from '@motifx/core';

describe('a hidden component moved to another parent', () => {
    let app: Application;
    let host: HTMLElement;
    let root: Component;
    let first: Component;
    let second: Component;
    let panel: Component;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        root = new Component('main');
        first = new Component('section');
        second = new Component('section');
        panel = new Component('article');
        first.controls.add(panel);
        root.controls.add(first, second);
        app.run(host, root);
        warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        errorHandler.setDevelopmentMode(true);
    });

    afterEach(async () => {
        errorHandler.setDevelopmentMode(false);
        warn.mockRestore();
        await app.dispose();
        document.body.innerHTML = '';
    });

    const warned = () => warn.mock.calls.some(call => String(call[0]).includes('MJX106'));

    test('shows again under the new parent, the same element, without rebuilding', async () => {
        const el = panel.element as Node;
        await panel.motif.hide();
        second.controls.add(panel);
        expect((panel.motif.options.placeholder as Node).parentNode).toBe(second.element);
        await panel.motif.show();
        expect(panel.isVisible).toBe(true);
        expect(panel.element).toBe(el);
        expect(el.parentNode).toBe(second.element);
        expect(warned()).toBe(false);
    });

    test('moved into a parent built later, it shows there without rebuilding', async () => {
        const el = panel.element as Node;
        await panel.motif.hide();
        const later = new Component('aside');
        later.controls.add(panel);
        root.controls.add(later);
        expect((panel.motif.options.placeholder as Node).parentNode).toBe(later.element);
        await panel.motif.show();
        expect(panel.isVisible).toBe(true);
        expect(panel.element).toBe(el);
        expect(el.parentNode).toBe(later.element);
        expect(warned()).toBe(false);
    });

    test('moved back to where it was hidden, it shows there', async () => {
        await panel.motif.hide();
        second.controls.add(panel);
        first.controls.add(panel);
        await panel.motif.show();
        expect((panel.element as Node).parentNode).toBe(first.element);
        expect(warned()).toBe(false);
    });
});
