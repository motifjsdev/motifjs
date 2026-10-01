import { Component } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

function mount(c: Component) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(c);
    return root;
}

describe('isInitialized', () => {
    test('is false in onInitializing, true in onInitialized and after construction', () => {
        const seen: Array<[string, boolean]> = [];
        class C extends Component {
            constructor() { super('div'); }
            onInitializing() { seen.push(['initializing', this.isInitialized]); }
            onInitialized() { seen.push(['initialized', this.isInitialized]); }
        }
        const c = new C();
        expect(c.isInitialized).toBe(true);
        expect(new Component('span').isInitialized).toBe(true);
        expect(seen).toEqual([['initializing', false], ['initialized', true]]);
    });
});

describe('transition css: false', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    const withTransition = (css: boolean, duration: number) => {
        const c = new Component('div');
        c.motif.options.transition.classes = { name: 'fx', duration, css } as any;
        return c;
    };

    test('hides at once without transition classes', async () => {
        const c = withTransition(false, 60000);
        const root = mount(c);
        await tick();
        const el = c.element as HTMLElement;
        const added: string[] = [];
        const add = el.classList.add.bind(el.classList);
        el.classList.add = (...names: string[]) => { added.push(...names); add(...names); };
        await c.motif.hide();
        expect(c.isVisible).toBe(false);
        expect(added).toEqual([]);
        await root.dispose();
    });

    test('with css true the leave classes are applied', async () => {
        const c = withTransition(true, 30);
        const root = mount(c);
        await tick();
        const hidden = c.motif.hide();
        await tick();
        expect((c.element as HTMLElement).classList.contains('fx-leave-active')).toBe(true);
        await hidden;
        await root.dispose();
    });
});
