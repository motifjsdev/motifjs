/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, VisibilityChangedEventArgs } from '@motifx/core';

type Seen = { via: string; visible: boolean; before: boolean };

class Box extends Component<HTMLSpanElement> {
    seen: Seen[] = [];
    constructor(props?: any) { super('span', props); }
    onVisibilityChanged(_sender: ComponentBase, e: VisibilityChangedEventArgs) {
        this.seen.push({ via: 'method', visible: e.visible, before: this.isVisible });
    }
}

let host: HTMLElement;
let root: Component;

beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host);
    root.build();
});

afterEach(() => {
    root.dispose();
    host.remove();
});

describe('onVisibilityChanged olay argümanı', () => {
    test.each(['placeholder', 'detach'])('%s: e.visible yeni durumu, isVisible önceki durumu verir', async (strategy) => {
        const box = new Box({ options: { hideStrategy: strategy } });
        root.controls.add(box);
        await box.motif.hide();
        expect(box.isVisible).toBe(false);
        await box.motif.show();
        expect(box.isVisible).toBe(true);
        expect(box.seen).toEqual([
            { via: 'method', visible: false, before: true },
            { via: 'method', visible: true, before: false },
        ]);
    });

    test('prop işleyicisi ve x:visibilityChanged dinleyicisi aynı değeri alır', async () => {
        const seen: Seen[] = [];
        const box: Box = new Box({
            onVisibilityChanged: (_s: ComponentBase, e: VisibilityChangedEventArgs) => seen.push({ via: 'prop', visible: e.visible, before: box.isVisible }),
        });
        box.motif.on('x:visibilityChanged', (_s, e) => { seen.push({ via: 'listener', visible: e.visible, before: box.isVisible }); });
        root.controls.add(box);
        await box.motif.toggle();
        await box.motif.toggle();
        expect(box.seen.map(s => s.visible)).toEqual([false, true]);
        expect(seen).toEqual([
            { via: 'prop', visible: false, before: true },
            { via: 'listener', visible: false, before: true },
            { via: 'prop', visible: true, before: false },
            { via: 'listener', visible: true, before: false },
        ]);
    });

    test('fragment köklü bileşende e.visible yeni durumu verir', async () => {
        const seen: boolean[] = [];
        const frag = new Component({ onVisibilityChanged: (_s: ComponentBase, e: VisibilityChangedEventArgs) => seen.push(e.visible) } as any);
        frag.controls.add(new Box());
        root.controls.add(frag);
        await frag.motif.hide();
        await frag.motif.show();
        expect(seen).toEqual([false, true]);
        expect(frag.isVisible).toBe(true);
    });

    test('yer tutucu başka bir üste taşınmışken gösterme de kancayı çağırır', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis as any).__MOTIF_DEV__ = true;
        const elsewhere = document.body.appendChild(document.createElement('div'));
        try {
            const box = new Box();
            root.controls.add(box);
            await box.motif.hide();
            elsewhere.appendChild(box.motif.options.placeholder as Node);
            await box.motif.show();
            expect(warn.mock.calls.some(call => String(call[0]).includes('MJX106'))).toBe(true);
            expect(box.isVisible).toBe(true);
            expect(box.seen).toEqual([
                { via: 'method', visible: false, before: true },
                { via: 'method', visible: true, before: false },
            ]);
        } finally {
            delete (globalThis as any).__MOTIF_DEV__;
            elsewhere.remove();
            warn.mockRestore();
        }
    });
});
