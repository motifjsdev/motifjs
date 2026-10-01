import { Component } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe("on('x:mounted') handler signature", () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    test('a single-parameter handler receives the event args', async () => {
        const c = new Component('div');
        const calls: any[] = [];
        c.motif.on('x:mounted' as any, (e: any) => { calls.push(e); });
        c.build();
        container.appendChild(c.element as Node);
        await wait(20);

        expect(calls.length).toBe(1);
        expect(calls[0]).not.toBe(c);
        expect(calls[0]).toEqual({ cancel: false });
    });

    test('a two-parameter handler receives sender and event args', async () => {
        const c = new Component('div');
        const calls: any[] = [];
        c.motif.on('x:mounted' as any, (s: any, e: any) => { calls.push([s, e]); });
        c.build();
        container.appendChild(c.element as Node);
        await wait(20);

        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe(c);
        expect(calls[0][1]).toEqual({ cancel: false });
    });

    test('matches the other x: lifecycle events', async () => {
        const c = new Component('div');
        let built: any, mounted: any;
        c.motif.on('x:built' as any, (e: any) => { built = e; });
        c.motif.on('x:mounted' as any, (e: any) => { mounted = e; });
        c.build();
        container.appendChild(c.element as Node);
        await wait(20);

        expect(built).toEqual({ cancel: false });
        expect(mounted).toEqual(built);
    });
});
