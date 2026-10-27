/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

function frameWindow(): Window {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentWindow!;
}

describe('devtools window roots', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let root: Component;
    let strip: Component;
    let a: Component;
    let b: Component;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        root = new Component('main');
        strip = new Component('ul');
        a = new Component('li');
        b = new Component('li');
        strip.controls.add(a, b);
        root.controls.add(strip);
        app.run(host, root);
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        document.body.innerHTML = '';
        delete (globalThis as any).__MOTIF_DEV__;
    });

    test('the tree starts with a forest node whose first root is the shell', () => {
        const tree = hook().getTree();
        expect(tree).toMatchObject({ path: [], type: 'Application', tag: '#roots', built: true, visible: true, connected: true, childCount: 1 });
        expect(tree.children[0]).toMatchObject({ path: [0], tag: 'div', childCount: 1 });
        expect(tree.children[0].children[0]).toMatchObject({ path: [0, 0], tag: 'main' });
        expect(hook().getTree([0, 0, 0])).toMatchObject({ path: [0, 0, 0], tag: 'ul', childCount: 2 });
        expect(hook().getTree([1])).toBeNull();
        expect(hook().inspect([])).toBeNull();
        expect(hook().getElement([])).toBeNull();
    });

    test('an open window is a root after the shell and its content gets window paths', () => {
        const win = app.windows.attach(frameWindow());
        win.add(b);
        const tree = hook().getTree([], 1);
        expect(tree.childCount).toBe(2);
        expect(tree.children[1]).toMatchObject({ path: [1], type: 'Window', tag: 'body', childCount: 1 });
        expect(hook().getTree([1, 0])).toMatchObject({ path: [1, 0], tag: 'li', connected: true });
        expect(hook().getElement([1, 0])).toBe(b.element);
        expect(hook().pathOfElement(b.element)).toEqual([1, 0]);
        expect(hook().pathOfElement(a.element)).toEqual([0, 0, 0, 0]);
        expect(hook().inspect([1, 0])).toMatchObject({ path: [1, 0], tag: 'li' });
    });

    test('inspecting a window root tells the kind, title and state of the window', async () => {
        const win = app.windows.attach(frameWindow(), { title: 'Notlar' });
        win.add(b);
        expect(hook().inspect([1])).toMatchObject({ type: 'Window', window: { kind: 'attached', title: 'Notlar', open: true, components: 1 } });
        expect(hook().inspect([0]).window).toBeUndefined();
        await win.close();
        expect(hook().getTree([], 0).childCount).toBe(1);
        expect(hook().pathOfElement(b.element)).toEqual([0, 0, 0, 1]);
    });

    test('opening and closing a window publishes tree:changed for the forest', async () => {
        const events: number[][][] = [];
        const off = hook().on((ev: any) => { if (ev.type === 'tree:changed') events.push(ev.payload.parents); });
        try {
            await tick();
            events.length = 0;
            const win = app.windows.attach(frameWindow());
            await tick();
            expect(events.some(parents => parents.some(p => p.length === 0))).toBe(true);
            events.length = 0;
            win.add(b);
            await tick();
            expect(events).toContainEqual(expect.arrayContaining([[1]]));
            events.length = 0;
            await win.close();
            await tick();
            expect(events.some(parents => parents.some(p => p.length === 0))).toBe(true);
        } finally {
            off();
        }
    });

    test('a component outside every root has no path', async () => {
        const built: any[] = [];
        const off = hook().on((ev: any) => { if (ev.type === 'component:built') built.push(ev.payload); });
        try {
            const loose = new Component('section');
            loose.build();
            expect(built.map(p => p.path)).toEqual([null]);
            const win = app.windows.attach(frameWindow(), { orphans: 'keep' });
            win.add(a);
            await strip.dispose();
            await win.close();
            expect(a.isDisposed).toBe(false);
            expect(a.parent).toBeNull();
            expect(hook().pathOfElement(a.element)).toBeNull();
            await a.dispose();
            await loose.dispose();
        } finally {
            off();
        }
    });

    test('counters see the components inside windows as part of the tree', () => {
        const before = hook().getCounters().components;
        const win = app.windows.attach(frameWindow());
        win.add(b);
        const after = hook().getCounters().components;
        expect(after.inTree).toBe(before.inTree + 1);
        expect(after.notInTree).toBe(before.notInTree);
    });

    test('every node says which document holds its element and a window root carries its title', () => {
        const win = app.windows.attach(frameWindow(), { title: 'Notlar' });
        win.add(b);
        const tree = hook().getTree();
        expect(tree.document).toBe(0);
        expect(tree.children[0]).toMatchObject({ path: [0], document: 0 });
        expect(hook().getTree([0, 0, 0, 0])).toMatchObject({ tag: 'li', document: 0 });
        expect(tree.children[1]).toMatchObject({ path: [1], type: 'Window', document: 1, title: 'Notlar' });
        expect(hook().getTree([1, 0])).toMatchObject({ tag: 'li', document: 1 });
        expect('title' in hook().getTree([1, 0])).toBe(false);
        expect('title' in tree.children[0]).toBe(false);
    });

    test('a component whose element lives in a connected frame points at that document while it stays in the page tree', () => {
        const frame = document.createElement('iframe');
        document.body.appendChild(frame);
        const doc = frame.contentDocument!;
        const release = app.connectDocument(doc);
        const away = new Component('p');
        strip.controls.add(away);
        doc.body.appendChild(away.element as Node);
        expect((away.element as Node).ownerDocument).toBe(doc);
        expect(hook().getDocuments().indexOf(doc)).toBe(1);
        expect(hook().getTree([0, 0, 0, 2])).toMatchObject({ tag: 'p', document: 1 });
        expect(hook().getTree([0, 0, 0, 0]).document).toBe(0);
        release();
        expect(hook().getTree([0, 0, 0, 2]).document).toBe(0);
    });

    test('a root cannot be hidden: neither the shell nor a window', async () => {
        const win = app.windows.attach(frameWindow());
        win.add(b);
        expect(await hook().setVisible([1], false)).toEqual({ ok: false, error: 'a root is placed by the page and cannot be hidden' });
        expect(win.document.body.isConnected).toBe(true);
        expect(await hook().setVisible([0], false)).toEqual({ ok: false, error: 'a root is placed by the page and cannot be hidden' });
        expect(host.isConnected).toBe(true);
        expect(await hook().setVisible([1, 0], false)).toEqual({ ok: true, value: false });
        expect(await hook().setVisible([1, 0], true)).toEqual({ ok: true, value: true });
    });

    test('the contract is version 2', () => {
        expect(hook().version).toBe(2);
    });
});
