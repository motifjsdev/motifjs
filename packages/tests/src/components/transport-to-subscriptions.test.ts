/**
 * @jest-environment jsdom
 */
import { Application, Component, Transport, TransportTo, errorHandler } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

describe('TransportTo slot subscriptions', () => {
    let app: Application;
    let host: HTMLElement;
    let root: Component;
    let reported: any[];
    let unbind: () => void;
    let log: jest.SpyInstance;

    const listeners = (description: string) => {
        const events: Map<any, Set<any>> = (app as any).events;
        const key = Array.from(events.keys()).find(k => typeof k === 'symbol' && k.description === description);
        return key ? events.get(key)!.size : 0;
    };

    const toolbar = (name: string) => {
        const bar = new Component('header');
        const slot = new Transport({ name });
        bar.controls.add(slot);
        root.controls.add(bar);
        return slot;
    };

    const page = (name: string, command: string) => {
        const section = new Component('section');
        const sender = new TransportTo({ name });
        const button = new Component('button');
        button.element!.textContent = command;
        sender.controls.add(button);
        section.controls.add(sender);
        root.controls.add(section);
        return section;
    };

    const slotErrors = () => reported.filter(e => e?.code === 'MJX123');

    beforeEach(() => {
        reported = [];
        unbind = errorHandler.addListener(e => reported.push(e));
        log = jest.spyOn(console, 'error').mockImplementation(() => { });
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = new Component('div');
        app.run(host, root);
    });

    afterEach(async () => {
        try { await app.dispose(); } catch { }
        host.remove();
        unbind();
        log.mockRestore();
    });

    test('removing the slot after its sender is disposed reports nothing', async () => {
        const slot = toolbar('o2-commands');
        await tick();
        const orders = page('o2-commands', 'Refresh orders');
        await tick();
        expect(host.querySelector('header')!.textContent).toBe('Refresh orders');
        await orders.dispose();
        await tick();
        expect(host.querySelector('header')!.textContent).toBe('');
        await slot.dispose();
        await tick();
        expect(slotErrors()).toEqual([]);
    });

    test('a sender subscribes to both slot events once and removes both when disposed', async () => {
        toolbar('o2-toolbar');
        await tick();
        const registered = listeners('slotRegistered');
        const unregistered = listeners('slotUnregistered');
        for (const command of ['Refresh orders', 'Invite person', 'Export report']) {
            const visited = page('o2-toolbar', command);
            await tick();
            expect(listeners('slotRegistered')).toBe(registered + 1);
            expect(listeners('slotUnregistered')).toBe(unregistered + 1);
            await visited.dispose();
            await tick();
            expect(listeners('slotRegistered')).toBe(registered);
            expect(listeners('slotUnregistered')).toBe(unregistered);
        }
    });

    test('disposing the app after several pages reports nothing', async () => {
        toolbar('o2-actions');
        await tick();
        for (const command of ['Refresh orders', 'Invite person']) {
            const visited = page('o2-actions', command);
            await tick();
            await visited.dispose();
            await tick();
        }
        await app.dispose();
        await tick();
        expect(slotErrors()).toEqual([]);
    });
});
