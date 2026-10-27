/**
 * @jest-environment jsdom
 */
import { Application, Component, MotifError, useApplication } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

class Notes { items: string[] = []; }

class Toast extends Component<HTMLDivElement> {
    mounted = 0;
    activated = 0;
    deactivated = 0;
    constructor() { super('div'); }
    onMounted() { this.mounted++; }
    onActivated() { this.activated++; }
    onDeactivated() { this.deactivated++; }
}

function frameWindow(): Window {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentWindow!;
}

describe('app.layer', () => {
    let app: Application;
    let host: HTMLElement;
    let root: Component;

    beforeEach(() => {
        host = document.createElement('div');
        host.id = 'app';
        document.body.appendChild(host);
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(Notes, Notes);
        app = builder.build();
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/b', control: () => new Component('p') }], mode: 'hash' });
        root = new Component('main');
        app.run(host, root);
    });

    afterEach(async () => {
        await app.dispose();
        document.body.innerHTML = '';
        window.location.hash = '';
    });

    test('the layer is a div at the end of body after the host and the same component every time', () => {
        const layer = app.layer;
        expect(app.layer).toBe(layer);
        const element = layer.element as HTMLElement;
        expect(element.tagName).toBe('DIV');
        expect(element.parentNode).toBe(document.body);
        expect(document.body.lastElementChild).toBe(element);
        expect(host.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
        expect(element.attributes.length).toBe(0);
        expect(element.className).toBe('');
        expect(layer.parent).toBeNull();
    });

    test('content placed in the layer mounts once, sees the app services and the router, and goes with the app', async () => {
        const toast = new Toast();
        app.layer.controls.add(toast);
        expect(app.layer.element.contains(toast.element as Node)).toBe(true);
        await tick(30);
        expect(toast.mounted).toBe(1);
        expect(toast.getService(Notes)).toBeInstanceOf(Notes);
        expect(toast.getService(Notes)).toBe(app.provider.get(Notes));
        expect(toast.context.router).toBe(app.router);
        await toast.context.navigate('/b');
        expect(app.router.uri).toBe('/b');
        const element = app.layer.element as HTMLElement;
        await app.dispose();
        expect(toast.isDisposed).toBe(true);
        expect(element.isConnected).toBe(false);
    });

    test('remove disposes, detach keeps and a new add activates again', async () => {
        const toast = new Toast();
        app.layer.controls.add(toast);
        await app.layer.controls.detach(toast);
        expect(toast.isDisposed).toBe(false);
        expect(toast.deactivated).toBe(1);
        app.layer.controls.add(toast);
        expect(toast.activated).toBe(1);
        expect(app.layer.element.contains(toast.element as Node)).toBe(true);
        app.layer.controls.remove(toast);
        await tick();
        expect(toast.isDisposed).toBe(true);
    });

    test('the layer can be styled and marked like any component', () => {
        app.layer.class.add('app-overlays');
        app.layer.attr.add({ 'aria-live': 'polite' });
        const element = app.layer.element as HTMLElement;
        expect(element.className).toBe('app-overlays');
        expect(element.getAttribute('aria-live')).toBe('polite');
    });

    test('layerOf finds the layer of the document that holds the target', async () => {
        const inPage = new Component('p');
        root.controls.add(inPage);
        expect(app.layerOf()).toBe(app.layer);
        expect(app.layerOf(null)).toBe(app.layer);
        expect(app.layerOf(inPage)).toBe(app.layer);
        expect(app.layerOf(inPage.element as Node)).toBe(app.layer);
        expect(app.layerOf(document)).toBe(app.layer);
        expect(app.layerOf(app.layer)).toBe(app.layer);
        const win = app.windows.attach(frameWindow());
        const inWindow = new Component('p');
        root.controls.add(inWindow);
        win.add(inWindow);
        expect(app.layerOf(inWindow)).toBe(win.host);
        expect(app.layerOf(win.document.body)).toBe(win.host);
        expect(app.layerOf(win.host)).toBe(win.host);
        const moved = new Component('p');
        root.controls.add(moved);
        win.document.body.appendChild(moved.element as Node);
        expect(app.layerOf(moved)).toBe(win.host);
        await win.close();
        expect(app.layerOf(inWindow)).toBe(app.layer);
    });

    test('layerOf adds the components given after the target and treats a parentless first component as content', () => {
        const anchor = new Component('p');
        root.controls.add(anchor);
        const a = new Toast(), b = new Toast(), c = new Toast();
        expect(app.layerOf(anchor, a, b)).toBe(app.layer);
        expect(app.layer.controls.items).toEqual([a, b]);
        expect(app.layerOf(c)).toBe(app.layer);
        expect(app.layer.controls.items).toEqual([a, b, c]);
        const win = app.windows.attach(frameWindow());
        const inWindow = new Component('p');
        root.controls.add(inWindow);
        win.add(inWindow);
        const d = new Toast();
        expect(app.layerOf(inWindow, d)).toBe(win.host);
        expect(win.host.controls.items).toEqual([inWindow, d]);
        expect(() => app.layerOf('x' as any)).toThrow(MotifError);
        try { app.layerOf('x' as any); } catch (error) { expect((error as MotifError).code).toBe('MJX424'); }
    });

    test('a parentless component whose element is in a document is a target and stays where it is', async () => {
        const div = document.body.appendChild(document.createElement('div'));
        const own = new Component<HTMLDivElement>(div);
        own.build();
        const toast = new Toast();
        expect(app.layerOf(own, toast)).toBe(app.layer);
        expect(own.parent).toBeNull();
        expect(div.parentElement).toBe(document.body);
        expect(toast.parent).toBe(app.layer);
        const detached = new Component('p');
        detached.build();
        expect(app.layerOf(detached)).toBe(app.layer);
        expect(detached.parent).toBe(app.layer);
        const frameDocument = frameWindow().document;
        const body = new Component<HTMLElement>(frameDocument.body);
        body.build();
        expect(app.layerOf(body, new Toast())).toBe(app.layer);
        expect(body.parent).toBeNull();
        await app.dispose();
        expect(frameDocument.body).not.toBeNull();
        expect(document.body.contains(div)).toBe(true);
    });

    test('a component reaches the layer through its context and useApplication', () => {
        const view = new Component('section');
        root.controls.add(view);
        const toast = new Toast();
        expect(view.context.layerOf(view, toast)).toBe(app.layer);
        expect(app.layer.controls.items).toEqual([toast]);
        expect(useApplication().layer).toBe(app.layer);
        const other = new Toast();
        expect(useApplication().layerOf(other)).toBe(app.layer);
        expect(app.layer.controls.items).toEqual([toast, other]);
    });
});

describe('app.layer before run', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        window.location.hash = '';
    });

    test('the layer works as soon as the app is built and run() puts the host before it', async () => {
        const app = Application.CreateBuilder().build();
        const toast = new Toast();
        app.layer.controls.add(toast);
        expect(document.body.lastElementChild).toBe(app.layer.element);
        await tick(30);
        expect(toast.mounted).toBe(1);
        const host = document.body.appendChild(document.createElement('div'));
        app.run(host, new Component('main'));
        expect(document.body.lastElementChild).toBe(app.layer.element);
        expect(host.compareDocumentPosition(app.layer.element as Node) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
        await app.dispose();
        expect(toast.isDisposed).toBe(true);
    });

    test('without a body the layer waits and joins at DOMContentLoaded, mounting what it holds', async () => {
        const body = document.body;
        document.documentElement.removeChild(body);
        expect(document.body).toBeNull();
        const app = Application.CreateBuilder().build();
        const toast = new Toast();
        app.layer.controls.add(toast);
        expect((app.layer.element as Node).isConnected).toBe(false);
        await tick(30);
        expect(toast.mounted).toBe(0);
        document.documentElement.appendChild(body);
        document.dispatchEvent(new Event('DOMContentLoaded'));
        expect(document.body.lastElementChild).toBe(app.layer.element);
        await tick(30);
        expect(toast.mounted).toBe(1);
        await app.dispose();
    });

    test('disposing before the body arrives leaves nothing behind', async () => {
        const body = document.body;
        document.documentElement.removeChild(body);
        const app = Application.CreateBuilder().build();
        const element = app.layer.element as Node;
        await app.dispose();
        document.documentElement.appendChild(body);
        document.dispatchEvent(new Event('DOMContentLoaded'));
        expect(element.isConnected).toBe(false);
    });
});
