import { Application, Component, Transporter } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

const item = (cls: string) => {
    const c = new Component('i');
    (c.element as HTMLElement).className = cls;
    return c;
};

const classes = (el: Element) => Array.from(el.children).map(e => e.className).join(',');

describe('Transporter with an index', () => {
    let app: Application;
    let host: HTMLElement;
    let root: Component;
    let from: Component;
    let slot: Component;

    beforeEach(async () => {
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = new Component('div');
        app.run(host, root);
        from = new Component('div');
        slot = new Component('div');
        slot.controls.add(item('a'), item('b'));
        root.controls.add(from, slot);
        await tick();
    });

    afterEach(() => {
        app.dispose();
        host.remove();
    });

    test('transport places the child at the index in the new parent element and takes it out of the old one', async () => {
        const x = item('x');
        from.controls.add(x);
        await tick();

        Transporter.transport(x, slot, { index: 1 });
        await tick();

        expect(slot.controls.items.map(c => (c.element as HTMLElement).className).join(',')).toBe('a,x,b');
        expect(classes(slot.element as HTMLElement)).toBe('a,x,b');
        expect(classes(from.element as HTMLElement)).toBe('');
        expect(x.parent).toBe(slot);
    });

    test('index 0 puts the child first', async () => {
        const x = item('x');
        from.controls.add(x);
        await tick();

        Transporter.transport(x, slot, { index: 0 });
        await tick();

        expect(classes(slot.element as HTMLElement)).toBe('x,a,b');
    });

    test('transportMany with an index keeps the given order', async () => {
        const x = item('x');
        const y = item('y');
        from.controls.add(x, y);
        await tick();

        Transporter.transportMany([x, y], slot, { index: 1 });
        await tick();

        expect(slot.controls.items.map(c => (c.element as HTMLElement).className).join(',')).toBe('a,x,y,b');
        expect(classes(slot.element as HTMLElement)).toBe('a,x,y,b');
        expect(classes(from.element as HTMLElement)).toBe('');
    });

    test('a child that was never placed is built at the index', async () => {
        const x = item('x');

        Transporter.transport(x, slot, { index: 1 });
        await tick();

        expect(classes(slot.element as HTMLElement)).toBe('a,x,b');
        expect(x.isBuilt).toBe(true);
    });
});
