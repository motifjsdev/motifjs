import { Component, ComponentBase, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function host() {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    return { root, el };
}

const bindingCount = (c: ComponentBase) => ((c as any)._bindings?._items?.length ?? 0) as number;

afterEach(() => { document.body.innerHTML = ''; });

describe('a visibility binding made inside the setup', () => {
    test('display set up in the setup builds once and keeps one binding', async () => {
        const state = reactive({ on: true });
        let runs = 0;
        const { root, el } = host();
        const c = new Component('div', { initializeComponent: (s: ComponentBase) => { runs++; s.bindings.display(() => state.on); } } as any);
        root.controls.add(c);
        expect(runs).toBe(1);
        expect(bindingCount(c)).toBe(1);
        expect(el.innerHTML).toBe('<div></div>');
        state.on = false;
        await settle();
        expect(el.querySelector('div')).toBeNull();
        state.on = true;
        await settle();
        expect(el.innerHTML).toBe('<div></div>');
        expect(runs).toBe(1);
        root.dispose();
    });

    test('wait and a direct isWait write in the setup also build once', () => {
        let a = 0, b = 0;
        const { root, el } = host();
        const w = new Component('i', { initializeComponent: (s: ComponentBase) => { a++; s.bindings.wait(() => false); } } as any);
        const d: any = new Component('b', { initializeComponent: (s: any) => { b++; s.isWait = false; } } as any);
        root.controls.add(w);
        root.controls.add(d);
        expect([a, b]).toEqual([1, 1]);
        expect(el.innerHTML).toBe('<i></i><b></b>');
        root.dispose();
    });

    test('a hidden start inside the setup leaves a trace and shows later', async () => {
        const state = reactive({ on: false });
        let runs = 0;
        const { root, el } = host();
        const c = new Component('div', { initializeComponent: (s: ComponentBase) => { runs++; s.bindings.display(() => state.on); } } as any);
        root.controls.add(c);
        state.on = true;
        await settle();
        expect(el.querySelectorAll('div').length).toBe(1);
        expect(runs).toBe(1);
        root.dispose();
    });
});

describe('visibility bindings made before build keep their behaviour', () => {
    test('a preconfig display places the element once and toggles it', async () => {
        const state = reactive({ on: true });
        let runs = 0;
        const { root, el } = host();
        const c = new Component('div', {
            preconfig: (s: ComponentBase) => s.bindings.display(() => state.on),
            initializeComponent: () => { runs++; },
        } as any);
        root.controls.add(c);
        expect(el.innerHTML).toBe('<div></div>');
        state.on = false;
        await settle();
        expect(el.querySelector('div')).toBeNull();
        state.on = true;
        await settle();
        expect(el.querySelectorAll('div').length).toBe(1);
        expect(runs).toBe(1);
        root.dispose();
    });

    test('a child with a preconfig display built by its parent is placed in order', () => {
        const state = reactive({ on: true });
        const outer = new Component('ul');
        const items = ['a', 'b', 'c'].map(t => new Component('li', {
            preconfig: (s: ComponentBase) => s.bindings.display(() => state.on),
            initializeComponent: (s: ComponentBase) => s.setText(t),
        } as any));
        items.forEach(i => outer.controls.add(i));
        const { root, el } = host();
        root.controls.add(outer);
        expect(el.innerHTML).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
        root.dispose();
    });

    test('building a child of a built parent directly still places it when its preconfig shows it', () => {
        const state = reactive({ on: true });
        const { root, el } = host();
        const c = new Component('p', { preconfig: (s: ComponentBase) => s.bindings.display(() => state.on) } as any);
        (root.controls as any).items.push(c);
        c.parent = root;
        c.build();
        expect(c.isBuilt).toBe(true);
        expect(el.innerHTML).toBe('<p></p>');
        root.dispose();
    });

    test('a component added while waiting is built when the wait ends', async () => {
        const state = reactive({ waiting: true });
        let runs = 0;
        const { root, el } = host();
        const c = new Component('div', {
            preconfig: (s: ComponentBase) => s.bindings.wait(() => state.waiting),
            initializeComponent: () => { runs++; },
        } as any);
        root.controls.add(c);
        expect(runs).toBe(0);
        state.waiting = false;
        await settle();
        expect(runs).toBe(1);
        expect(el.querySelectorAll('div').length).toBe(1);
        root.dispose();
    });
});
