/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

describe('devtools tree inspection', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    function run() {
        const root = new Component('main');
        const list = new Component('ul');
        const item = new Component('li');
        (item.element as HTMLElement).appendChild(document.createTextNode('text'));
        list.controls.add(item);
        root.controls.add(new Component('header'), list);
        app.run(host, root);
        return { root, list, item };
    }

    test('getTree returns the shell with its fields and children', () => {
        run();
        const tree = hook().getTree();
        expect(tree).toMatchObject({ path: [], type: 'Component', tag: 'div', built: true, visible: true, waiting: false, disposed: false, connected: true, childCount: 1 });
        const main = tree.children[0];
        expect(main).toMatchObject({ path: [0], tag: 'main', childCount: 2 });
        expect(main.children.map((n: any) => [n.path, n.tag])).toEqual([[[0, 0], 'header'], [[0, 1], 'ul']]);
        expect(main.children[1].children[0]).toMatchObject({ path: [0, 1, 0], tag: 'li', childCount: 0, children: [] });
    });

    test('depth stops at the given level but keeps childCount', () => {
        run();
        const tree = hook().getTree([], 1);
        expect(tree.children[0].childCount).toBe(2);
        expect('children' in tree.children[0]).toBe(false);
    });

    test('getTree with a path returns that subtree, an unknown path returns null', () => {
        run();
        expect(hook().getTree([0, 1])).toMatchObject({ path: [0, 1], tag: 'ul', childCount: 1 });
        expect(hook().getTree([0, 7])).toBeNull();
        expect(hook().getTree([0, 1, 0, 3])).toBeNull();
    });

    test('getElement returns the node of the component at the path', () => {
        const { item } = run();
        expect(hook().getElement([0, 1, 0])).toBe(item.element);
        expect(hook().getElement([9])).toBeNull();
    });

    test('pathOfElement finds the component of an element, of a node inside it, and nothing outside the app', () => {
        const { item } = run();
        const li = item.element as HTMLElement;
        expect(hook().pathOfElement(li)).toEqual([0, 1, 0]);
        expect(hook().pathOfElement(li.firstChild)).toEqual([0, 1, 0]);
        const outside = document.createElement('p');
        document.body.appendChild(outside);
        expect(hook().pathOfElement(outside)).toBeNull();
        outside.remove();
    });

    test('connected follows hide and show', async () => {
        const { list } = run();
        await list.motif.hide();
        expect(hook().getTree([0, 1]).connected).toBe(false);
        expect(hook().getTree([0, 1]).visible).toBe(false);
        await list.motif.show();
        expect(hook().getTree([0, 1]).connected).toBe(true);
    });

    test('after the app is disposed there is no tree', async () => {
        run();
        const hookBefore = hook();
        await app.dispose();
        expect(hookBefore.getTree()).toBeNull();
        expect(hookBefore.pathOfElement(host)).toBeNull();
    });
});
