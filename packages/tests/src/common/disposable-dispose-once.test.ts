import { Component, Disposable, disposableCore, errorHandler } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0));

let marks: Map<any, number>;
let warn: jest.SpyInstance;

beforeEach(() => {
    marks = new Map();
    disposableCore.disposableTracker = {
        trackDisposable() { },
        markAsDisposed(x: any) { marks.set(x, (marks.get(x) ?? 0) + 1); },
        setParent() { },
        markAsSingleton() { },
    };
    warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    disposableCore.disposableTracker = null;
    warn.mockRestore();
    errorHandler.setDevelopmentMode(false);
    document.body.innerHTML = '';
});

class Service extends Disposable {
    constructor(private log: string[]) { super(); }
    add(name: string) { (this as any)._register({ dispose: () => this.log.push(name) }); }
}

describe('Disposable.dispose runs once', () => {
    test('a second call does not mark the object again', () => {
        const s = new Service([]);
        s.add('a');
        s.dispose();
        s.dispose();
        expect(marks.get(s)).toBe(1);
    });

    test('a second call on an object without registrations does not mark it again', () => {
        const s = new (class extends Disposable { })();
        s.dispose();
        s.dispose();
        expect(marks.get(s)).toBe(1);
    });

    test('registrations run once', () => {
        const log: string[] = [];
        const s = new Service(log);
        s.add('a');
        s.add('b');
        s.dispose();
        s.dispose();
        expect(log).toEqual(['a', 'b']);
    });

    test('one call marks the object once', () => {
        const s = new Service([]);
        s.dispose();
        expect(marks.get(s)).toBe(1);
    });

    test('a component disposed twice is marked once', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const c = new Component(host);
        c.build();
        c.dispose();
        c.dispose();
        await settle();
        expect(c.isDisposed).toBe(true);
        expect(marks.get(c)).toBe(1);
    });

    test('calling the base dispose on a cleaned component warns MJX501', async () => {
        errorHandler.setDevelopmentMode(true);
        const host = document.createElement('div');
        document.body.appendChild(host);
        const c = new Component(host);
        c.build();
        await c.dispose();
        Disposable.prototype.dispose.call(c);
        expect(warn.mock.calls.some(call => String(call[0]).includes('MJX501'))).toBe(true);
    });

    test('calling the base dispose on a cleaned component does not mark it again', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const c = new Component(host);
        c.build();
        await c.dispose();
        Disposable.prototype.dispose.call(c);
        expect(marks.get(c)).toBe(1);
    });
});
