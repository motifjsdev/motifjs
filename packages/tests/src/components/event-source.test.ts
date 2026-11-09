import { Component, motifFragment } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { await tick(); await tick(); await tick(); };

function mount(child: any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root: any = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

describe('motif.isEventFrom tells whether an event started in the component', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    function click(el: Element) {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    }

    test('a component with an element, a component without one, and the rest of the container', async () => {
        const dialog: any = new Component('div');
        const inside: any = new Component('button');
        dialog.controls.add(inside);
        const group: any = motifFragment();
        const grouped: any = new Component('button');
        group.controls.add(grouped);
        const outside: any = new Component('button');
        const box: any = new Component('div');
        box.controls.add(dialog); box.controls.add(group); box.controls.add(outside);
        mount(box);
        await settle();
        const seen: boolean[][] = [];
        let last: any = null;
        box.motif.on('click:capture', (_sender: any, e: Event) => {
            last = e;
            seen.push([dialog.motif.isEventFrom(e), group.motif.isEventFrom(e), box.motif.isEventFrom(e), e.composedPath().includes(group.element)]);
        });

        click(inside.element);
        click(grouped.element);
        click(outside.element);
        await settle();
        expect(seen).toEqual([
            [true, false, true, false],
            [false, true, true, false],
            [false, false, true, false]
        ]);

        expect(last.composedPath().length).toBe(0);
        expect(box.motif.isEventFrom(last)).toBe(true);
        expect(dialog.motif.isEventFrom(last)).toBe(false);
        expect(box.motif.isEventFrom({ any: 1 } as any)).toBe(false);
        expect(box.motif.isEventFrom(null as any)).toBe(false);
        await dialog.dispose();
        await settle();
        expect(dialog.motif.isEventFrom(last)).toBe(false);
    });

    test('across a shadow root, from either side', async () => {
        const outerEl = document.createElement('div');
        const hostEl = document.createElement('div');
        outerEl.appendChild(hostEl);
        document.body.appendChild(outerEl);
        const shadow = hostEl.attachShadow({ mode: 'open' });
        const buttonEl = document.createElement('button');
        shadow.appendChild(buttonEl);
        const otherEl = document.createElement('p');
        document.body.appendChild(otherEl);
        const outer: any = new Component(outerEl);
        const inner: any = new Component(buttonEl);
        const other: any = new Component(otherEl);

        const seen: Record<string, boolean[]> = {};
        let kept: any = null;
        buttonEl.addEventListener('click', e => {
            kept = e;
            seen.inside = [outer.motif.isEventFrom(e), inner.motif.isEventFrom(e), other.motif.isEventFrom(e)];
        });
        const listen = (e: Event) => { seen.outside = [outer.motif.isEventFrom(e), inner.motif.isEventFrom(e), other.motif.isEventFrom(e)]; };
        document.addEventListener('click', listen);
        click(buttonEl);
        document.removeEventListener('click', listen);

        expect(seen.inside).toEqual([true, true, false]);
        expect(seen.outside).toEqual([true, true, false]);
        expect(outer.motif.isEventFrom(kept)).toBe(true);
    });
});
