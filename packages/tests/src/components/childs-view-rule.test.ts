/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, motifComponent, reactive } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async () => { await tick(); await tick(); };

const gate = reactive({ wait: true, show: false });

function kid(log: string[]) {
    return motifComponent('p', {
        onBuilt: (s: ComponentBase) => log.push('built in ' + ((s.parent?.element as any)?.nodeName ?? '?')),
        initializeComponent: (p: ComponentBase) => { p.class.add('kid'); p.controls.add(motifComponent('text', (n: any) => n.setText('K'))); },
    });
}

class SlotInWaitingInit extends Component {
    view() {
        return motifComponent('section', (section: ComponentBase) => {
            const body = motifComponent('div', {
                preconfig: (b: ComponentBase) => b.bindings.wait(() => gate.wait),
                initializeComponent: (b: ComponentBase) => { b.class.add('body'); b.controls.add(...(this.childs ?? [])); },
            });
            section.controls.add(body);
        });
    }
}

class SlotInHiddenInit extends Component {
    view() {
        return motifComponent('section', (section: ComponentBase) => {
            const body = motifComponent('div', {
                preconfig: (b: ComponentBase) => b.bindings.display(() => gate.show),
                initializeComponent: (b: ComponentBase) => { b.class.add('body'); b.controls.add(...(this.childs ?? [])); },
            });
            section.controls.add(body);
        });
    }
}

class SlotInWaitingInitWithTag extends Component<HTMLDivElement> {
    static elementTag = 'div';
    view() {
        return motifComponent('div', {
            preconfig: (b: ComponentBase) => b.bindings.wait(() => gate.wait),
            initializeComponent: (b: ComponentBase) => { b.class.add('body'); b.controls.add(...(this.childs ?? [])); },
        });
    }
}

class SlotDirectInView extends Component {
    view() {
        const body = motifComponent('div', {
            preconfig: (b: ComponentBase) => b.bindings.wait(() => gate.wait),
            initializeComponent: (b: ComponentBase) => { b.class.add('body'); },
        });
        body.controls.add(...(this.childs ?? []));
        return motifComponent('section', (section: ComponentBase) => { section.controls.add(body); });
    }
}

class ViewWithoutPlacement extends Component {
    view() {
        return motifComponent('section', (section: ComponentBase) => { section.controls.add(motifComponent('h2', (h: any) => h.setText('T'))); });
    }
}

class WrapperWithoutView extends Component<HTMLDivElement> { static elementTag = 'div'; }

class FragmentWithoutView extends Component { }

function mount(Ctor: any) {
    const log: string[] = [];
    gate.wait = true;
    gate.show = false;
    const host = document.body.appendChild(document.createElement('div'));
    const root = new Component(host);
    root.build();
    const k = kid(log);
    const owner = motifComponent(Ctor, { childs: [k] });
    const parentAtCtor = k.parent === owner ? 'owner' : k.parent ? 'other' : 'none';
    root.controls.add(owner);
    return { log, host, root, k, owner, parentAtCtor };
}

describe('childs placement follows one rule: a class with view() places them itself, a class without view() gets them at its root', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test.each([
        ['slot placed in a waiting init function', SlotInWaitingInit, () => { gate.wait = false; }],
        ['slot placed in a hidden init function', SlotInHiddenInit, () => { gate.show = true; }],
        ['slot in a waiting init function on a class with elementTag', SlotInWaitingInitWithTag, () => { gate.wait = false; }],
        ['slot placed directly in view()', SlotDirectInView, () => { gate.wait = false; }],
    ])('%s: the child waits with the slot instead of showing at the root', async (_n, Ctor, open) => {
        const t = mount(Ctor);
        await settle();
        expect(t.parentAtCtor).toBe('none');
        expect(t.host.querySelector('.kid')).toBeNull();
        expect(t.log).toEqual([]);
        open();
        await settle();
        const placed = t.host.querySelector('.body .kid');
        expect(placed).not.toBeNull();
        expect(t.log).toEqual(['built in DIV']);
        await t.root.dispose();
    });

    test('a class with view() that never places its childs leaves them unplaced and disposes them with itself', async () => {
        const t = mount(ViewWithoutPlacement);
        await settle();
        expect(t.host.querySelector('.kid')).toBeNull();
        expect(t.k.parent).toBeNull();
        expect(t.k.isBuilt).toBe(false);
        await t.root.dispose();
        expect(t.k.isDisposed).toBe(true);
    });

    test('a class without view() and with an element gets the childs inside that element', async () => {
        const t = mount(WrapperWithoutView);
        await settle();
        expect(t.host.innerHTML).toBe('<div><p class="kid">K</p></div>');
        expect(t.log).toEqual(['built in DIV']);
        await t.root.dispose();
    });

    test('a class without view() and without an element gets the childs as its content', async () => {
        const t = mount(FragmentWithoutView);
        await settle();
        expect(t.host.querySelectorAll('.kid').length).toBe(1);
        expect(t.k.parent).toBe(t.owner);
        await t.root.dispose();
    });
});
