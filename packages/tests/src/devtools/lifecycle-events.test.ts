/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('devtools lifecycle events', () => {
    let app: Application;
    let events: { type: string; payload: any }[];
    let off: () => void;
    let host: HTMLElement;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        events = [];
        off = (globalThis as any).__MOTIF_DEVTOOLS__.on((ev: any) => { if (ev.type.startsWith('component:')) events.push(ev); });
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

    function tree() {
        const root = new Component('div');
        const list = new Component('ul');
        const item = new Component('li');
        list.controls.add(item);
        root.controls.add(new Component('header'), list);
        return { root, list, item };
    }

    const of = (type: string) => events.filter(e => e.type === type).map(e => e.payload);

    test('built is published once per component with its path, type, tag and duration, children first', () => {
        const { root } = tree();
        app.run(host, root);
        const built = of('component:built').filter(p => p.path?.length !== 1);
        expect(built.map(p => [p.path, p.tag])).toEqual([
            [[0, 0, 0], 'header'],
            [[0, 0, 1, 0], 'li'],
            [[0, 0, 1], 'ul'],
            [[0, 0], 'div'],
        ]);
        for (const p of built) {
            expect(p.type).toBe('Component');
            expect(typeof p.duration).toBe('number');
            expect(p.duration).toBeGreaterThanOrEqual(0);
            expect('id' in p).toBe(false);
        }
        root.build();
        expect(of('component:built').filter(p => p.path?.length !== 1).length).toBe(4);
    });

    test('mounted is not published', async () => {
        const { root } = tree();
        app.run(host, root);
        await tick();
        expect(of('component:mounted')).toEqual([]);
    });

    test('visibility is published only when it changes', async () => {
        const { root, list } = tree();
        app.run(host, root);
        events.length = 0;
        await list.motif.hide();
        await list.motif.hide();
        await list.motif.show();
        await list.motif.show();
        expect(of('component:visibility')).toEqual([
            { path: [0, 0, 1], type: 'Component', tag: 'ul', visible: false },
            { path: [0, 0, 1], type: 'Component', tag: 'ul', visible: true },
        ]);
    });

    test('wait is published only when it changes', async () => {
        const { root, list } = tree();
        app.run(host, root);
        events.length = 0;
        list.isWait = true;
        list.isWait = true;
        await tick();
        list.isWait = false;
        list.isWait = false;
        await tick();
        expect(of('component:wait')).toEqual([
            { path: [0, 0, 1], type: 'Component', tag: 'ul', waiting: true },
            { path: [0, 0, 1], type: 'Component', tag: 'ul', waiting: false },
        ]);
    });

    test('disposing and disposed carry the path the component had when its dispose began', async () => {
        const { root, item } = tree();
        app.run(host, root);
        events.length = 0;
        await item.dispose();
        expect(of('component:disposing')).toEqual([{ path: [0, 0, 1, 0], type: 'Component', tag: 'li' }]);
        const disposed = of('component:disposed');
        expect(disposed.length).toBe(1);
        expect(disposed[0]).toMatchObject({ path: [0, 0, 1, 0], type: 'Component', tag: 'li' });
        expect(typeof disposed[0].duration).toBe('number');
        expect('id' in disposed[0]).toBe(false);
    });

    test('after useDevelopment(false) nothing is published', async () => {
        app.useDevelopment(false);
        const { root, list, item } = tree();
        app.run(host, root);
        await list.motif.hide();
        list.isWait = true;
        await item.dispose();
        await tick();
        expect(events).toEqual([]);
    });
});
