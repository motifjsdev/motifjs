import { Application, Component, ComponentBase, reactive } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

const item = (cls: string, props: any = {}) => {
    const c = new Component('i', props);
    (c.element as HTMLElement).className = cls;
    return c;
};

const markup = (el: Element) => Array.from(el.childNodes).map(n => n.nodeType === 8 ? '<!--h-->' : (n as HTMLElement).className).join(',');

describe('a display or wait binding set up in initializeComponent', () => {
    let app: Application;
    let host: HTMLElement;
    let root: Component;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = new Component('div');
        app.run(host, root);
    });

    afterEach(() => {
        app.dispose();
        host.remove();
    });

    test('a child added to a built parent starts hidden with a trace and appears in its place', async () => {
        const s = reactive({ open: false });
        const parent = new Component('div');
        parent.controls.add(item('a'), item('b'));
        root.controls.add(parent);
        await tick();

        const late = item('late', { initializeComponent: (c: ComponentBase) => c.bindings.display(() => s.open) });
        parent.controls.insert(1, late);
        await tick();
        expect(late.isWait).toBe(true);
        expect(markup(parent.element as HTMLElement)).toBe('a,<!--h-->,b');

        s.open = true;
        await tick();
        expect(markup(parent.element as HTMLElement)).toBe('a,late,b');

        s.open = false;
        await tick();
        expect(markup(parent.element as HTMLElement)).toBe('a,<!--h-->,b');
    });

    test('a child added while its parent is set up starts hidden and appears when the condition turns true', async () => {
        const s = reactive({ open: false });
        const parent = new Component('div', {
            initializeComponent: (p: ComponentBase) => p.controls.add(
                item('a'),
                item('late', { initializeComponent: (c: ComponentBase) => c.bindings.display(() => s.open) }),
                item('b'))
        });
        root.controls.add(parent);
        await tick();
        expect(markup(parent.element as HTMLElement)).toBe('a,<!--h-->,b');

        s.open = true;
        await tick();
        expect(markup(parent.element as HTMLElement)).toBe('a,late,b');
    });

    test('wait behaves the same way', async () => {
        const s = reactive({ busy: true });
        const parent = new Component('div');
        root.controls.add(parent);
        await tick();

        const late = item('late', { initializeComponent: (c: ComponentBase) => c.bindings.wait(() => s.busy) });
        parent.controls.add(late);
        await tick();
        expect(markup(parent.element as HTMLElement)).toBe('<!--h-->');

        s.busy = false;
        await tick();
        expect(markup(parent.element as HTMLElement)).toBe('late');
    });

    test('a binding that starts true leaves the child in place', async () => {
        const s = reactive({ open: true });
        const parent = new Component('div');
        root.controls.add(parent);
        await tick();

        parent.controls.add(item('late', { initializeComponent: (c: ComponentBase) => c.bindings.display(() => s.open) }));
        await tick();
        expect(markup(parent.element as HTMLElement)).toBe('late');

        s.open = false;
        await tick();
        expect(markup(parent.element as HTMLElement)).toBe('<!--h-->');
    });
});
