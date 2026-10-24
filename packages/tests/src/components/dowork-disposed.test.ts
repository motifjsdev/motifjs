/**
 * @jest-environment jsdom
 */
import { Component, errorHandler, MotifError } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

type Note = { id: number; title: string };

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

describe('doWork', () => {
    let offs: (() => void)[] = [];
    let reported: any[] = [];

    beforeEach(() => {
        reported = [];
        offs = [errorHandler.addListener((error) => reported.push(error))];
    });

    afterEach(() => offs.forEach(off => off()));

    test('gives the value while the component lives, typed with MotifError beside it', async () => {
        const c = new Component('p');
        const notes: Promise<Note[]> = Promise.resolve([{ id: 1, title: 'Alışveriş' }]);

        const result = await c.doWork(notes);
        const titles = result instanceof MotifError ? [] : result.map(n => n.title);

        expect(titles).toEqual(['Alışveriş']);
    });

    test('passes a rejection on while the component lives', async () => {
        const c = new Component('p');
        const failure = new Error('request failed');

        await expect(c.doWork(Promise.reject(failure))).rejects.toBe(failure);
    });

    test('resolves to MJX108 when the component is disposed before the value arrives', async () => {
        const c = new Component('p');
        const d = deferred<number>();

        const work = c.doWork(d.promise);
        await c.dispose();
        d.resolve(1);
        const result = await work;

        expect(result).toBeInstanceOf(MotifError);
        expect((result as MotifError).code).toBe('MJX108');
        expect(reported).toEqual([]);
    });

    test('resolves to MJX108 with the rejection as cause when the component is disposed, and catch does not run', async () => {
        const c = new Component('p');
        const d = deferred<number>();
        const failure = new Error('request failed');
        const caught: unknown[] = [];

        const work = c.doWork(d.promise).catch((error) => { caught.push(error); return undefined; });
        await c.dispose();
        d.reject(failure);
        const result = await work;
        await tick();

        expect(caught).toEqual([]);
        expect(result).toBeInstanceOf(MotifError);
        expect((result as MotifError).code).toBe('MJX108');
        expect((result as MotifError & { cause?: unknown }).cause).toBe(failure);
        expect(reported).toEqual([]);
    });

    test('takes a thenable', async () => {
        const c = new Component('p');

        const thenable = { then(res: (v: number) => void) { setTimeout(() => res(9), 1); } } as PromiseLike<number>;
        const result = await c.doWork(thenable);

        expect(result).toBe(9);
    });
});
