import { Component, ComponentBase, FragmentNode } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

function track(c: ComponentBase, log: string[], tag: string) {
    c.motif.on('x:activated' as any, () => log.push(`${tag}:activated`));
    c.motif.on('x:deactivated' as any, () => log.push(`${tag}:deactivated`));
    c.motif.on('x:mounted' as any, () => log.push(`${tag}:mounted`));
}

describe('x:activated / x:deactivated on re-attachment', () => {
    let container: HTMLElement;
    let root: Component;
    beforeEach(() => {
        container = createTestContainer();
        root = new Component(container);
        root.build();
    });
    afterEach(() => cleanupTestContainer(container));

    test('the first appearance does not fire activated', async () => {
        const log: string[] = [];
        const c = new Component('p');
        track(c, log, 'c');
        root.controls.add(c);
        await wait(20);
        expect(log).toEqual(['c:mounted']);
    });

    test('controls.detach then controls.add elsewhere', async () => {
        const log: string[] = [];
        const other = new Component('div');
        root.controls.add(other);
        const c = new Component('p');
        track(c, log, 'c');
        root.controls.add(c);
        await wait(20);
        await root.controls.detach(c);
        expect(log).toEqual(['c:mounted', 'c:deactivated']);
        other.controls.add(c);
        await wait(20);
        expect(log).toEqual(['c:mounted', 'c:deactivated', 'c:activated']);
        expect(document.contains(c.element as Node)).toBe(true);
    });

    test('silentDetach then controls.add', async () => {
        const log: string[] = [];
        const c = new Component('p');
        track(c, log, 'c');
        root.controls.add(c);
        await wait(20);
        root.controls.silentDetach(c);
        root.controls.add(c);
        await wait(20);
        expect(log).toEqual(['c:mounted', 'c:deactivated', 'c:activated']);
    });

    test('moving with controls.add fires deactivated then activated once', async () => {
        const log: string[] = [];
        const a = new Component('div');
        const b = new Component('div');
        root.controls.add(a, b);
        const c = new Component('p');
        track(c, log, 'c');
        a.controls.add(c);
        await wait(20);
        b.controls.add(c);
        await wait(20);
        expect(log).toEqual(['c:mounted', 'c:deactivated', 'c:activated']);
        expect((b.element as HTMLElement).contains(c.element as Node)).toBe(true);
    });

    test.each(['placeholder', 'detach'])('hide/show with the %s strategy', async (strategy) => {
        const log: string[] = [];
        const c = new Component('p');
        c.motif.options.hideStrategy = strategy as any;
        track(c, log, 'c');
        root.controls.add(c);
        await wait(20);
        await c.motif.hide();
        await wait(20);
        await c.motif.show();
        await wait(20);
        expect(log).toEqual(['c:mounted', 'c:deactivated', 'c:activated']);
    });

    test('isWait toggling behaves like hide/show', async () => {
        const log: string[] = [];
        const c = new Component('p');
        track(c, log, 'c');
        root.controls.add(c);
        await wait(20);
        c.isWait = true;
        await wait(20);
        c.isWait = false;
        await wait(20);
        expect(log).toEqual(['c:mounted', 'c:deactivated', 'c:activated']);
    });

    test('the subtree is notified, parent first', async () => {
        const log: string[] = [];
        const parent = new Component('div');
        const child = new Component('span');
        const grandChild = new Component('b');
        child.controls.add(grandChild);
        parent.controls.add(child);
        root.controls.add(parent);
        track(parent, log, 'p');
        track(child, log, 'c');
        track(grandChild, log, 'g');
        await wait(20);
        log.length = 0;
        root.controls.silentDetach(parent);
        root.controls.add(parent);
        await wait(20);
        expect(log).toEqual(['p:deactivated', 'c:deactivated', 'g:deactivated', 'p:activated', 'c:activated', 'g:activated']);
    });

    test('a hidden child is not activated with its parent and gets activated when shown', async () => {
        const log: string[] = [];
        const parent = new Component('div');
        const child = new Component('span');
        parent.controls.add(child);
        root.controls.add(parent);
        track(child, log, 'c');
        await wait(20);
        await child.motif.hide();
        await wait(20);
        root.controls.silentDetach(parent);
        root.controls.add(parent);
        await wait(20);
        expect(log.filter(l => l !== 'c:mounted')).toEqual(['c:deactivated']);
        await child.motif.show();
        await wait(20);
        expect(log.filter(l => l !== 'c:mounted')).toEqual(['c:deactivated', 'c:activated']);
    });

    test('a fragment root and its children each fire once on hide/show', async () => {
        const log: string[] = [];
        const a = new Component('div');
        const b = new Component('div');
        const frag = new FragmentNode({ initializeComponent: (s: ComponentBase) => { s.controls.add(a, b); } });
        root.controls.add(frag);
        track(frag, log, 'f');
        track(a, log, 'a');
        track(b, log, 'b');
        await wait(20);
        log.length = 0;
        await frag.motif.hide();
        await wait(20);
        await frag.motif.show();
        await wait(20);
        const count = (s: string) => log.filter(l => l === s).length;
        for (const tag of ['f', 'a', 'b']) {
            expect(count(`${tag}:deactivated`)).toBe(1);
            expect(count(`${tag}:activated`)).toBe(1);
        }
    });

    test('class hooks onActivated / onDeactivated are called too', async () => {
        const calls: string[] = [];
        class Probe extends Component {
            constructor() { super('p'); }
            onActivated() { calls.push('activated'); }
            onDeactivated() { calls.push('deactivated'); }
        }
        const c = new Probe();
        root.controls.add(c);
        await wait(20);
        await c.motif.hide();
        await c.motif.show();
        expect(calls).toEqual(['deactivated', 'activated']);
    });
});
