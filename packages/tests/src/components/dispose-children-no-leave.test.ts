import { Component, reactive } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function animated(id: string) {
    const c = new Component('div');
    (c.element as HTMLElement).id = id;
    c.motif.options.transition.classes = { name: 'fade', duration: 300 } as any;
    return c;
}

describe('children disposed with their parent do not play a leave transition', () => {
    let host: HTMLElement;
    let root: Component;

    const mount = (c: Component) => {
        root.controls.add(c);
        return c;
    };

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = new Component('main');
        host.appendChild(root.element as any);
        root.build();
    });

    afterEach(() => {
        host.remove();
    });

    test('disposeAsync called directly does not wait for a leave transition', async () => {
        const c = mount(animated('direct'));
        await tick(20);
        let leaveSeen = false;
        const observer = new MutationObserver(() => {
            if ((c.element as HTMLElement)?.classList?.contains('fade-leave-active')) leaveSeen = true;
        });
        observer.observe(c.element as any, { attributes: true });
        const started = Date.now();
        await c.disposeAsync();
        observer.disconnect();
        expect(Date.now() - started).toBeLessThan(150);
        expect(leaveSeen).toBe(false);
        expect(document.getElementById('direct')).toBeNull();
    });

    test('a parent without its own transition is not held back by an animated child', async () => {
        const parent = new Component('section');
        parent.controls.add(animated('child'));
        mount(parent);
        await tick(20);
        const started = Date.now();
        await parent.dispose();
        expect(Date.now() - started).toBeLessThan(150);
        expect(document.getElementById('child')).toBeNull();
    });

    test('a branch switch does not leave the place empty while an animated child is disposed', async () => {
        const state = reactive({ on: true });
        const owner = new Component('div');
        (owner.bindings as any).ternary(() => state.on, (frame: any) => {
            const a = new Component('section');
            (a.element as HTMLElement).id = 'branch-a';
            a.controls.add(animated('toast'));
            frame.navigate(a);
        }, (frame: any) => {
            const b = new Component('section');
            (b.element as HTMLElement).id = 'branch-b';
            frame.navigate(b);
        });
        mount(owner);
        await tick(20);
        expect(host.querySelector('#branch-a')).not.toBeNull();
        state.on = false;
        await tick(120);
        expect(host.querySelector('#branch-a')).toBeNull();
        expect(host.querySelector('#branch-b')).not.toBeNull();
    });

    test('a component disposed on its own still plays its leave transition', async () => {
        const c = mount(animated('own'));
        await tick(20);
        let leaveSeen = false;
        const observer = new MutationObserver(() => {
            if ((c.element as HTMLElement)?.classList?.contains('fade-leave-active')) leaveSeen = true;
        });
        observer.observe(c.element as any, { attributes: true });
        await c.dispose();
        observer.disconnect();
        expect(leaveSeen).toBe(true);
    });
});
