import { Component, ComponentBase, motifFragment } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { await tick(); await tick(); };

describe('a built child added to a hidden fragment', () => {
    let hostEl: HTMLElement;
    let host: Component;
    let other: Component;
    let frag: ComponentBase;

    const shape = () => hostEl.innerHTML.replace(/<!--\[-->|<!--\]-->/g, '').replace(/<!--h-->/g, '#');

    beforeEach(async () => {
        hostEl = document.body.appendChild(document.createElement('section'));
        host = new Component(hostEl);
        host.build();
        other = new Component('aside');
        frag = motifFragment({});
        host.controls.add(other, frag);
        frag.controls.add(new Component('i'), new Component('b'));
        await settle();
    });
    afterEach(() => { host.dispose(); document.body.innerHTML = ''; });

    const moveIn = (child: ComponentBase, index?: number) => {
        other.controls.detach(child);
        if (index === undefined) frag.controls.add(child); else frag.controls.add(index, child);
    };

    test('a component moved in while the fragment is hidden by motif.hide() is placed when it is shown', async () => {
        const moved = new Component('u');
        other.controls.add(moved);
        await settle();
        await frag.motif.hide();
        moveIn(moved);
        expect(shape()).toBe('<aside></aside>##');
        expect(moved.element.isConnected).toBe(false);
        await frag.motif.show();
        await settle();
        expect(shape()).toBe('<aside></aside><i></i><b></b><u></u>');
        expect(moved.parent).toBe(frag);
    });

    test('it keeps its place in controls when it is moved between existing children', async () => {
        const moved = new Component('u');
        other.controls.add(moved);
        await settle();
        await frag.motif.hide();
        moveIn(moved, 1);
        await frag.motif.show();
        await settle();
        expect(shape()).toBe('<aside></aside><i></i><u></u><b></b>');
    });

    test('a component built on its own and then added is placed too', async () => {
        await frag.motif.hide();
        const built = new Component('u');
        built.build();
        frag.controls.add(built);
        await frag.motif.show();
        await settle();
        expect(shape()).toBe('<aside></aside><i></i><b></b><u></u>');
    });

    test('a moved fragment brings its own children', async () => {
        const moved = motifFragment({});
        other.controls.add(moved);
        moved.controls.add(new Component('s'), new Component('q'));
        await settle();
        await frag.motif.hide();
        moveIn(moved);
        await frag.motif.show();
        await settle();
        expect(shape()).toBe('<aside></aside><i></i><b></b><s></s><q></q>');
    });

    test('a moved child that is hidden itself stays hidden and leaves its trace', async () => {
        const moved = new Component('u');
        other.controls.add(moved);
        await settle();
        await moved.motif.hide();
        await frag.motif.hide();
        moveIn(moved);
        await frag.motif.show();
        await settle();
        expect(shape()).toBe('<aside></aside><i></i><b></b>#');
        expect(moved.isVisible).toBe(false);
        await moved.motif.show();
        await settle();
        expect(shape()).toBe('<aside></aside><i></i><b></b><u></u>');
    });

    test('hideStrategy "detach" on the child does not drop it, new or moved', async () => {
        const moved = new Component('u', { options: { hideStrategy: 'detach' } } as any);
        other.controls.add(moved);
        await settle();
        await frag.motif.hide();
        moveIn(moved);
        frag.controls.add(new Component('em', { options: { hideStrategy: 'detach' } } as any));
        await frag.motif.show();
        await settle();
        expect(shape()).toBe('<aside></aside><i></i><b></b><u></u><em></em>');
    });

    test('a fragment hidden by isWait places the moved child when the wait ends', async () => {
        const moved = new Component('u');
        other.controls.add(moved);
        await settle();
        frag.isWait = true;
        await settle();
        moveIn(moved);
        expect(shape()).toBe('<aside></aside>##');
        frag.isWait = false;
        await settle();
        expect(shape()).toBe('<aside></aside><i></i><b></b><u></u>');
    });

    test('the moved child is deactivated when it leaves and activated when the fragment is shown', async () => {
        const log: string[] = [];
        class Part extends Component {
            onActivated() { log.push('activated'); }
            onDeactivated() { log.push('deactivated'); }
        }
        const moved = new Part('u');
        other.controls.add(moved);
        await settle();
        await frag.motif.hide();
        moveIn(moved);
        expect(log).toEqual(['deactivated']);
        await frag.motif.show();
        await settle();
        expect(log).toEqual(['deactivated', 'activated']);
    });
});
