/**
 * @jest-environment jsdom
 */
import { Component, errorHandler, MotifError } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

type Note = { id: number; title: string };

describe('using', () => {
    let offs: (() => void)[] = [];
    let errorSpy: jest.SpyInstance;
    let reported: any[] = [];

    beforeEach(() => {
        reported = [];
        offs = [errorHandler.addListener((error) => reported.push(error))];
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        offs.forEach(off => off());
        errorSpy.mockRestore();
    });

    test('reports an error thrown by onfulfilled as MJX129 with the error as cause', async () => {
        const c = new Component('p');
        const failure = new Error('handler failed');

        c.using(Promise.resolve(1), () => { throw failure; });
        await tick();

        expect(reported).toHaveLength(1);
        expect(reported[0]).toBeInstanceOf(MotifError);
        expect(reported[0].code).toBe('MJX129');
        expect(reported[0].message).toContain('onfulfilled');
        expect(reported[0].cause).toBe(failure);
    });

    test('reports the rejection of an async onfulfilled', async () => {
        const c = new Component('p');

        c.using(Promise.resolve(1), async () => { throw new Error('async handler failed'); });
        await tick();

        expect(reported.map(e => [e.code, e.cause?.message])).toEqual([['MJX129', 'async handler failed']]);
    });

    test('reports an error thrown by onrejected', async () => {
        const c = new Component('p');

        c.using(Promise.reject(new Error('request failed')), null, () => { throw new Error('onrejected failed'); });
        await tick();

        expect(reported.map(e => [e.code, e.message.includes('onrejected'), e.cause?.message])).toEqual([['MJX129', true, 'onrejected failed']]);
    });

    test('takes a block-bodied onfulfilled and an onrejected that returns nothing, typed from the promise', async () => {
        const c = new Component('p');
        const state = { items: [] as Note[], error: '' };
        const notes: Promise<Note[]> = Promise.resolve([{ id: 1, title: 'Alışveriş' }]);

        c.using(notes, (items) => { state.items = items; });
        c.using(Promise.reject(new Error('request failed')), null, (error) => { state.error = String(error); });
        await tick();

        expect(state.items.map(n => n.title)).toEqual(['Alışveriş']);
        expect(state.error).toBe('Error: request failed');
        expect(reported).toEqual([]);
    });

    test('calls nothing after dispose and stays silent on a rejection without onrejected', async () => {
        const c = new Component('p');
        const calls: string[] = [];
        let resolve!: (v: number) => void;
        let reject!: (e: Error) => void;

        c.using(new Promise<number>(r => (resolve = r)), () => { calls.push('fulfilled'); throw new Error('not reached'); });
        c.using(new Promise<number>((_, r) => (reject = r)), null, () => { calls.push('rejected'); });
        await c.dispose();
        resolve(1);
        reject(new Error('late'));
        await tick();

        const silent = new Component('p');
        silent.using(Promise.reject(new Error('nobody listens')));
        await tick();

        expect(calls).toEqual([]);
        expect(reported).toEqual([]);
    });
});
