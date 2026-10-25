import { Application, Component, MotifError } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

const nodes = (el: Element) => Array.from(el.childNodes).map(n => n.nodeType === 8 ? `<!--${n.textContent}-->` : n.nodeType === 3 ? `"${n.textContent}"` : ((n as HTMLElement).className || (n as HTMLElement).tagName.toLowerCase())).join(' ');

describe('app.run on a comment or text node mounts the application in its place', () => {
    let page: HTMLElement;

    beforeEach(() => {
        page = document.createElement('div');
        page.innerHTML = '<p class="before"></p><!--app--><p class="after"></p>';
        document.body.appendChild(page);
    });

    afterEach(() => {
        page.remove();
    });

    test('the root is placed before the comment and the comment stays as the mount point', async () => {
        const app = Application.CreateBuilder().build();
        const root = new Component('main');
        (root.element as HTMLElement).className = 'root';
        app.run(page.childNodes[1], root);
        await tick();
        expect(nodes(page)).toBe('before root <!--app--> after');
        await app.dispose();
        expect(nodes(page)).toBe('before <!--app--> after');
    });

    test('a fragment root keeps its children in order before the comment', async () => {
        const app = Application.CreateBuilder().build();
        const a = new Component('i'); (a.element as HTMLElement).className = 'a';
        const b = new Component('i'); (b.element as HTMLElement).className = 'b';
        const root = new Component({ childs: [a, b] } as any);
        app.run(page.childNodes[1], root);
        await tick();
        expect(nodes(page)).toBe('before <!--[--> a b <!--]--> <!--app--> after');
        await app.dispose();
    });

    test('children added to the shell later and a hidden root keep the place', async () => {
        const app = Application.CreateBuilder().build();
        const root = new Component('main');
        (root.element as HTMLElement).className = 'root';
        app.run(page.childNodes[1], root);
        await tick();
        await root.motif.hide();
        await tick();
        expect(nodes(page)).toBe('before <!--h--> <!--app--> after');
        await root.motif.show();
        await tick();
        expect(nodes(page)).toBe('before root <!--app--> after');
        const late = new Component('aside'); (late.element as HTMLElement).className = 'late';
        root.parent!.controls.add(late);
        await tick();
        expect(nodes(page)).toBe('before root late <!--app--> after');
        await app.dispose();
    });

    test('a text node works the same way', async () => {
        page.innerHTML = '<p class="before"></p>mount<p class="after"></p>';
        const app = Application.CreateBuilder().build();
        const root = new Component('main');
        (root.element as HTMLElement).className = 'root';
        app.run(page.childNodes[1], root);
        await tick();
        expect(nodes(page)).toBe('before root "mount" after');
        await app.dispose();
    });

    test('a comment that is not attached to a parent throws MJX416', () => {
        const app = Application.CreateBuilder().build();
        let caught: unknown;
        try { app.run(document.createComment('loose'), new Component('main')); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(MotifError);
        expect((caught as MotifError).code).toBe('MJX416');
    });
});
