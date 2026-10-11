import { Component, ComponentBase, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function host() {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    return root;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('setup functions run once', () => {
    test('moving, hiding and showing a built element does not run its setup again', async () => {
        const log: string[] = [];
        const state = reactive({ on: true });
        const a = host();
        const b = host();
        const c = new Component('div', {
            initializeComponent: (s: ComponentBase) => { log.push('init'); s.bindings.display(() => state.on); },
            oninitializeComponent: () => log.push('oninit'),
        } as any);
        a.controls.add(c);
        b.controls.add(c);
        state.on = false;
        await settle();
        state.on = true;
        await settle();
        c.build();
        expect(log).toEqual(['init', 'oninit']);
        a.dispose();
        b.dispose();
    });

    test('a class method setup, a lone setup and extra setups run once in order', () => {
        const log: string[] = [];
        class Box extends Component {
            override initializeComponent() { log.push('method'); }
        }
        const root = host();
        const box = new Box('div', { initializeComponent: [() => log.push('p1'), () => log.push('p2')] } as any);
        root.controls.add(box);
        const plain = new Component('i', { initializeComponent: () => log.push('lone') } as any);
        root.controls.add(plain);
        plain.build();
        box.build();
        expect(log).toEqual(['method', 'p1', 'p2', 'lone']);
        root.dispose();
    });

    test('after build the element no longer holds its setup functions', () => {
        const root = host();
        const lone: any = new Component('i', { initializeComponent: () => { } } as any);
        const many: any = new Component('b', { initializeComponent: [() => { }, () => { }], oninitializeComponent: () => { } } as any);
        root.controls.add(lone);
        root.controls.add(many);
        expect(lone._init).toBeUndefined();
        expect(many._init).toBeUndefined();
        expect(many._baseCtx?._initializeComponentHandlers).toBeUndefined();
        expect(many._baseCtx?._onInitializeComponentHandlers).toBeUndefined();
        root.dispose();
    });
});
