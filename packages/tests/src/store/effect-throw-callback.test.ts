/**
 * @jest-environment jsdom
 */
import { Component, reactive, effect, errorHandler } from '@motifx/core';

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
const label = (text: string) => { const b = new Component('b'); (b.element as HTMLElement).textContent = text; return b; };

describe('a getter that throws produces no value: onValue is not called and the branch keeps its content', () => {
    test('effect(getter, onValue): a throwing first run calls onValue with nothing', () => {
        const seen: any[] = [];
        const stop = effect(() => { throw new Error('ilk kosu patladi'); }, (v) => seen.push(v));
        expect(seen).toStrictEqual([]);
        expect(codes()).toEqual(['MJX208']);
        expect(causes()).toEqual(['ilk kosu patladi']);
        stop();
    });

    test('effect(getter, onValue): the throwing run is skipped, the effect keeps tracking and the next good value arrives', async () => {
        const s = reactive({ n: 1 });
        const seen: any[] = [];
        const stop = effect(() => { if (s.n === 2) throw new Error('getter patladi'); return s.n; }, (v) => seen.push(v));
        expect(seen).toStrictEqual([1]);

        s.n = 2;
        await settle();
        expect(seen).toStrictEqual([1]);
        expect(codes()).toEqual(['MJX208']);

        s.n = 3;
        await settle();
        expect(seen).toStrictEqual([1, 3]);
        expect(codes()).toEqual(['MJX208']);
        stop();
    });

    test('bindings.when: the shown branch stays when the condition throws', async () => {
        const s = reactive({ open: true, n: 1 });
        const box = new Component('div', { initializeComponent: (x: any) => x.bindings.when(() => { if (s.n === 2) throw new Error('when patladi'); return s.open; }, (v: boolean) => label(v ? 'YES' : 'NO')) });
        root.controls.add(box);
        await settle();
        expect((box.element as HTMLElement).textContent).toBe('YES');

        s.n = 2;
        await settle();
        expect(codes()).toEqual(['MJX208']);
        expect((box.element as HTMLElement).textContent).toBe('YES');

        s.n = 3; s.open = false;
        await settle();
        expect((box.element as HTMLElement).textContent).toBe('');
        expect(codes()).toEqual(['MJX208']);
    });

    test('bindings.ternary: the current branch stays when the condition throws', async () => {
        const s = reactive({ open: true, n: 1 });
        const box = new Component('div', { initializeComponent: (x: any) => x.bindings.ternary(() => { if (s.n === 2) throw new Error('ternary patladi'); return s.open; }, (f: any) => f.navigate(label('T')), (f: any) => f.navigate(label('F'))) });
        root.controls.add(box);
        await settle();
        expect((box.element as HTMLElement).textContent).toBe('T');

        s.n = 2;
        await settle();
        expect(codes()).toEqual(['MJX208']);
        expect((box.element as HTMLElement).textContent).toBe('T');

        s.n = 3; s.open = false;
        await settle();
        expect((box.element as HTMLElement).textContent).toBe('F');
    });

    test('bindings.switchCase: the current case stays when the discriminator throws', async () => {
        const s = reactive({ k: 'a', n: 1 });
        const box = new Component('div', { initializeComponent: (x: any) => x.bindings.switchCase(() => { if (s.n === 2) throw new Error('switch patladi'); return s.k; }, { a: (f: any) => f.navigate(label('A')), b: (f: any) => f.navigate(label('B')) }, (f: any) => f.navigate(label('D'))) });
        root.controls.add(box);
        await settle();
        expect((box.element as HTMLElement).textContent).toBe('A');

        s.n = 2;
        await settle();
        expect(codes()).toEqual(['MJX208']);
        expect((box.element as HTMLElement).textContent).toBe('A');

        s.n = 3; s.k = 'b';
        await settle();
        expect((box.element as HTMLElement).textContent).toBe('B');
    });
});
