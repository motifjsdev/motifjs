/**
 * @jest-environment jsdom
 */
import { Component, reactive, errorHandler } from '@motifx/core';

const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

let reported: any[];
let unbind: () => void;
let log: jest.SpyInstance;
let host: HTMLElement;
let root: Component;

beforeEach(() => {
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    log = jest.spyOn(console, 'error').mockImplementation(() => { });
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host as any);
    root.build();
});

afterEach(() => {
    root.dispose();
    host.remove();
    unbind();
    log.mockRestore();
});

const codes = () => reported.map(e => e.code);
const causes = () => reported.map(e => e.cause && e.cause.message);

describe('a class getter that throws is reported like every other binding getter', () => {
    test('getter form: MJX208 with the cause, the previous classes stay, the next good value applies', async () => {
        const s = reactive({ n: 1 });
        const p = new Component('p', { initializeComponent: (x: any) => x.class.add(() => { if (s.n === 2) throw new Error('class patladi'); return 'note cls-' + s.n; }) });
        root.controls.add(p);
        await settle();
        expect((p.element as HTMLElement).className).toBe('note cls-1');

        s.n = 2;
        await settle();
        expect(codes()).toEqual(['MJX208']);
        expect(causes()).toEqual(['class patladi']);
        expect((p.element as HTMLElement).className).toBe('note cls-1');

        s.n = 3;
        await settle();
        expect((p.element as HTMLElement).className).toBe('note cls-3');
        expect(codes()).toEqual(['MJX208']);
    });

    test('object form: a throwing condition is reported and the class keeps its previous state', async () => {
        const s = reactive({ n: 1 });
        const p = new Component('p', { initializeComponent: (x: any) => x.class.add([{ on: () => { if (s.n === 2) throw new Error('kosul patladi'); return s.n > 0; } }]) });
        root.controls.add(p);
        await settle();
        expect((p.element as HTMLElement).classList.contains('on')).toBe(true);

        s.n = 2;
        await settle();
        expect(causes()).toEqual(['kosul patladi']);
        expect((p.element as HTMLElement).classList.contains('on')).toBe(true);

        s.n = -1;
        await settle();
        expect((p.element as HTMLElement).classList.contains('on')).toBe(false);
    });

    test('a getter that throws on its first evaluation is reported and writes no class', async () => {
        const p = new Component('p', { initializeComponent: (x: any) => { x.class.add('base'); x.class.add(() => { throw new Error('ilk patladi'); }); } });
        root.controls.add(p);
        await settle();
        expect(causes()).toEqual(['ilk patladi']);
        expect((p.element as HTMLElement).className).toBe('base');
    });

    test('a getter that never throws reports nothing', async () => {
        const s = reactive({ on: false });
        const p = new Component('p', { initializeComponent: (x: any) => x.class.add(() => (s.on ? 'open' : 'closed')) });
        root.controls.add(p);
        await settle();
        s.on = true;
        await settle();
        expect((p.element as HTMLElement).className).toBe('open');
        expect(reported).toEqual([]);
    });
});
