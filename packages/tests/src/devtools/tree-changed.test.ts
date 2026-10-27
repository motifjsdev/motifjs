/**
 * @jest-environment jsdom
 */
import { Application, Component, ComponentBase, Transporter } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('devtools tree:changed', () => {
    let app: Application;
    let events: number[][][];
    let off: () => void;
    let host: HTMLElement;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        events = [];
        off = (globalThis as any).__MOTIF_DEVTOOLS__.on((ev: any) => { if (ev.type === 'tree:changed') events.push(ev.payload.parents); });
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        off();
        app.useDevelopment(false);
        app.dispose();
        host.remove();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    function mount() {
        const root = new Component('div');
        const list = new Component('ul');
        root.controls.add(new Component('header'), list);
        app.run(host, root);
        return { root, list };
    }

    async function settle() {
        await tick();
        events.length = 0;
    }

    test('adding many children in one go publishes one event with the parent path', async () => {
        const { list } = mount();
        await settle();
        for (let i = 0; i < 100; i++) list.controls.add(new Component('li'));
        await tick();
        expect(events).toEqual([[[0, 0, 1]]]);
    });

    test.each<[string, (list: ComponentBase, a: ComponentBase, b: ComponentBase) => void]>([
        ['insert at index', (l) => { l.controls.add(0, new Component('li')); }],
        ['remove', (l, a) => { l.controls.remove(a); }],
        ['detach', (l, a) => { l.controls.detach(a); }],
        ['silentDetach', (l, a) => { l.controls.silentDetach(a); }],
        ['silentUnlink', (l, a) => { l.controls.silentUnlink(a); }],
        ['clear', (l) => { l.controls.clear(); }],
        ['clearAsync', (l) => { l.controls.clearAsync(); }],
        ['move', (l, a, b) => { l.controls.move(b, a); }],
        ['moveToIndex', (l, _a, b) => { l.controls.moveToIndex(b, 0); }],
        ['reorder', (l, a, b) => { (l.controls as any)._reorder([b, a], new Set<number>()); }],
    ])('%s publishes the parent path', async (_name, act) => {
        const { list } = mount();
        const a = new Component('li');
        const b = new Component('li');
        list.controls.add(a, b);
        await settle();
        act(list, a, b);
        await tick();
        expect(events.flat()).toContainEqual([0, 0, 1]);
    });

    test('a transport into an index publishes both parents with their paths after the change', async () => {
        const { list, root } = mount();
        const a = new Component('li');
        list.controls.add(a);
        await settle();
        Transporter.transport(a, root, { index: 0 });
        await tick();
        expect(root.controls.items[2]).toBe(list);
        const all = events.flat();
        expect(all).toContainEqual([0, 0]);
        expect(all).toContainEqual([0, 0, 2]);
    });

    test('after useDevelopment(false) nothing is published', async () => {
        const { list } = mount();
        await settle();
        app.useDevelopment(false);
        list.controls.add(new Component('li'));
        await tick();
        expect(events).toEqual([]);
    });
});
