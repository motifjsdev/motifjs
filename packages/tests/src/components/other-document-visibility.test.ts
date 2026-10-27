/**
 * @jest-environment jsdom
 */
import { Application, Component, errorHandler } from '@motifx/core';

describe('hide and show of a component whose element was moved to another document', () => {
    let app: Application;
    let host: HTMLElement;
    let manager: Component;
    let view: Component;
    let frame: HTMLIFrameElement;
    let holder: HTMLElement;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        manager = new Component('section');
        view = new Component('article');
        manager.controls.add(view);
        app.run(host, manager);
        frame = document.createElement('iframe');
        document.body.appendChild(frame);
        app.connectDocument(frame.contentDocument!);
        holder = frame.contentDocument!.createElement('div');
        frame.contentDocument!.body.appendChild(holder);
        holder.appendChild(view.element as Node);
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

    test('the trace is left in the other document and show returns there, not to the parent component', async () => {
        const el = view.element as Node;
        expect(el.ownerDocument).toBe(frame.contentDocument);
        await view.motif.hide();
        const trace = view.motif.options.placeholder as Node;
        expect(trace.parentNode).toBe(holder);
        expect(view.isVisible).toBe(false);
        await view.motif.show();
        expect(view.isVisible).toBe(true);
        expect(el.parentNode).toBe(holder);
        expect(el.ownerDocument).toBe(frame.contentDocument);
        expect(manager.element.contains(el)).toBe(false);
        expect(warned()).toBe(false);
    });

    test('a trace that was moved after hiding still rebuilds the component under its parent', async () => {
        const elsewhere = document.body.appendChild(document.createElement('div'));
        await view.motif.hide();
        elsewhere.appendChild(view.motif.options.placeholder as Node);
        await view.motif.show();
        expect(view.isVisible).toBe(true);
        expect(manager.element.contains(view.element as Node)).toBe(true);
        expect(warned()).toBe(true);
    });

    test('a trace whose holder left the document rebuilds the component under its parent', async () => {
        await view.motif.hide();
        holder.remove();
        await view.motif.show();
        expect(view.isVisible).toBe(true);
        expect(manager.element.contains(view.element as Node)).toBe(true);
    });

    test('a component moved inside a window of the app hides and shows in that window', async () => {
        const second = document.createElement('iframe');
        document.body.appendChild(second);
        const win = app.windows.attach(second.contentWindow!);
        const box = new Component('div');
        manager.controls.add(box);
        const corner = win.document.createElement('aside');
        win.document.body.appendChild(corner);
        corner.appendChild(box.element as Node);
        await box.motif.hide();
        expect(corner.contains(box.element as Node)).toBe(false);
        await box.motif.show();
        expect(corner.contains(box.element as Node)).toBe(true);
        expect(warned()).toBe(false);
        await win.close();
    });
});
