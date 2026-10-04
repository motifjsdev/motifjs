import { Application, Component, ContentBlock, ContentBody, Transport, TransportTo } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

const item = (cls: string) => {
    const c = new Component('i');
    (c.element as HTMLElement).className = cls;
    return c;
};

describe('ContentBody registry', () => {
    let app: Application;
    let host: HTMLElement;
    let root: Component;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = new Component('div');
        app.run(host, root);
    });

    afterEach(() => {
        app.dispose();
        host.remove();
    });

    test('disposing a replaced body keeps the newer body with the same name registered', async () => {
        const first = new Component('div', { class: 'first' } as any);
        const firstBody = new ContentBody({ name: 'slot' });
        first.controls.add(firstBody);
        root.controls.add(first);

        const second = new Component('div', { class: 'second' } as any);
        const secondBody = new ContentBody({ name: 'slot' });
        second.controls.add(secondBody);
        root.controls.add(second);
        await tick();

        await first.dispose();
        await tick();

        const block = new ContentBlock({ target: 'slot', childs: [item('x')] } as any);
        root.controls.add(block);
        await tick();

        expect(host.querySelectorAll('.second i.x').length).toBe(1);
        expect(host.querySelectorAll('.first').length).toBe(0);
        expect(secondBody.isDisposed).toBe(false);
    });

    test('ContentBlock raises controladded for children it forwards to the body', async () => {
        const body = new Component('div', { class: 'body' } as any);
        body.controls.add(new ContentBody({ name: 'ev' }));
        root.controls.add(body);
        await tick();

        const block = new ContentBlock({ target: 'ev' } as any);
        const added: Component[] = [];
        block.motif.on('controladded' as any, (_s: any, e: any) => { added.push(e.control); });
        root.controls.add(block);
        const child = item('y');
        block.controls.add(child);
        await tick();

        expect(added).toContain(child);
        expect(host.querySelectorAll('.body i.y').length).toBe(1);
    });

    test('TransportTo raises controladded for children it transports', async () => {
        const slot = new Transport({ name: 'tp' } as any);
        const slotHost = new Component('div', { class: 'slot' } as any);
        slotHost.controls.add(slot);
        root.controls.add(slotHost);
        await tick();

        const to = new TransportTo({ name: 'tp' });
        const added: Component[] = [];
        to.motif.on('controladded' as any, (_s: any, e: any) => { added.push(e.control); });
        root.controls.add(to);
        await tick();
        const child = item('z');
        to.controls.add(child);
        await tick();

        expect(added).toContain(child);
        expect(host.querySelectorAll('.slot i.z').length).toBe(1);
    });
});
