import { Application, Component, motifCompiled } from '@motifx/core';

describe('devtools warnings buffer', () => {
    const g = globalThis as any;
    const hook = () => g.__MOTIF_DEVTOOLS__;
    const control = () => new Component('div');
    let app: Application;
    let warn: jest.SpyInstance;
    let events: any[];
    let off: () => void;

    beforeEach(() => {
        warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        events = [];
        off = hook().on((ev: any) => { if (ev.type === 'warning') events.push(ev.payload); });
    });

    afterEach(() => {
        off();
        app.useDevelopment(false);
        app.dispose();
        warn.mockRestore();
        delete g.__MOTIF_DEV__;
    });

    const duplicateRoutes = (path: string, times: number) => {
        const routes = Array.from({ length: times }, () => ({ path, control }));
        app.useRouter({ routes });
    };
    const find = (message: string) => hook().getWarnings().filter((w: any) => w.message === message);

    test('the same warning is kept once with a count, the details of its first arrival and its times', () => {
        duplicateRoutes('/same', 4);
        const message = 'Multiple routes resolve to the same full path: "/same".';
        const records = find(message);
        expect(records.length).toBe(1);
        expect(records[0].code).toBe('MJX313');
        expect(records[0].count).toBe(3);
        expect(records[0].details).toBe(events[0].details);
        expect(typeof records[0].firstAt).toBe('number');
        expect(records[0].lastAt).toBeGreaterThanOrEqual(records[0].firstAt);
    });

    test('every arrival is still published and printed', () => {
        duplicateRoutes('/printed', 4);
        const message = 'Multiple routes resolve to the same full path: "/printed".';
        expect(events.filter(e => e.message === message).length).toBe(3);
        expect(events[0]).toEqual({ code: 'MJX313', message, details: { full: '/printed' } });
        expect(warn.mock.calls.filter(c => String(c[0]).includes('"/printed"')).length).toBe(3);
    });

    test('different messages are kept as different records', () => {
        duplicateRoutes('/one', 2);
        duplicateRoutes('/two', 2);
        expect(find('Multiple routes resolve to the same full path: "/one".').length).toBe(1);
        expect(find('Multiple routes resolve to the same full path: "/two".').length).toBe(1);
    });

    test('at most 200 records are kept and the least recently seen ones are dropped', () => {
        const repeated = 'Multiple routes resolve to the same full path: "/lru".';
        const contract = (n: number) => `This code was compiled for compiler contract ${n},`;
        const has = (n: number) => hook().getWarnings().some((w: any) => w.message.startsWith(contract(n)));
        duplicateRoutes('/lru', 2);
        for (let n = 1000; n < 1100; n++) motifCompiled(n);
        duplicateRoutes('/lru', 2);
        for (let n = 1100; n < 1250; n++) motifCompiled(n);
        const list = hook().getWarnings();
        expect(list.length).toBe(200);
        expect(has(1000)).toBe(false);
        expect(has(1050)).toBe(false);
        expect(has(1051)).toBe(true);
        expect(has(1249)).toBe(true);
        expect(find(repeated)[0].count).toBe(2);
    });
});
