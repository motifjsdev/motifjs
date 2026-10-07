/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';

const NativeObserver = window.MutationObserver;
let created = 0;
let active = 0;

class CountingObserver extends NativeObserver {
    private live = false;
    constructor(cb: MutationCallback) { super(cb); created++; }
    observe(target: Node, options?: MutationObserverInit) {
        if (!this.live) { this.live = true; active++; }
        super.observe(target, options);
    }
    disconnect() {
        if (this.live) { this.live = false; active--; }
        super.disconnect();
    }
}

const settle = () => new Promise(r => setTimeout(r, 0));

let host: HTMLElement;
let root: Component;
const log: string[] = [];

class Row extends Component<HTMLDivElement> {
    constructor(public tag: string) { super('div'); }
    onMounted() { log.push(this.tag); }
}

beforeAll(() => {
    (window as any).MutationObserver = CountingObserver;
    (globalThis as any).MutationObserver = CountingObserver;
});

afterAll(() => {
    (window as any).MutationObserver = NativeObserver;
    (globalThis as any).MutationObserver = NativeObserver;
});

beforeEach(() => {
    log.length = 0;
    created = 0;
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host);
    root.build();
});

afterEach(async () => {
    root.dispose();
    host.remove();
    await settle();
});

describe('onMounted bekleyişi', () => {
    test('çok sayıda bileşen tek bir gözlemciyle, kayıt sırasıyla ve birer kez bağlanır', async () => {
        for (let i = 0; i < 300; i++) root.controls.add(new Row('r' + i));
        expect(created).toBe(1);
        await settle();
        expect(log).toEqual(Array.from({ length: 300 }, (_, i) => 'r' + i));
        expect(active).toBe(0);
    });

    test('kanca eklemeyle aynı anda değil, aynı görevin microtask aşamasında çalışır', async () => {
        root.controls.add(new Row('a'));
        expect(log).toEqual([]);
        await Promise.resolve();
        expect(log).toEqual(['a']);
    });

    test('iç içe bileşenlerde alt bileşen üstten önce bağlanır', async () => {
        class Outer extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            view() { return new Row('inner'); }
            onMounted() { log.push('outer'); }
        }
        root.controls.add(new Outer());
        await settle();
        expect(log).toEqual(['inner', 'outer']);
    });

    test('bağlanmadan bertaraf edilen bileşenin kancası çalışmaz ve gözlemci kapanır', async () => {
        const row = new Row('gone');
        row.build();
        const element = row.element as Node;
        expect(active).toBe(1);
        await row.dispose();
        expect(active).toBe(0);
        host.appendChild(element);
        await settle();
        expect(log).toEqual([]);
    });

    test('elle appendChild ile belgeye eklenen bileşen de bağlanır', async () => {
        const row = new Row('manual');
        row.build();
        await settle();
        expect(log).toEqual([]);
        host.appendChild(row.element as Node);
        await settle();
        expect(log).toEqual(['manual']);
        await row.dispose();
    });

    test('kurulum sonunda zaten bağlı olan bileşen hemen bağlanır, gözlemci açılmaz', () => {
        const row = new Row('direct');
        host.appendChild(row.element as Node);
        row.build();
        expect(log).toEqual(['direct']);
        expect(created).toBe(0);
    });

    test('x:mounted dinleyicisi ve off aynı gözlemciyi paylaşır', async () => {
        const kept = jest.fn();
        const removed = jest.fn();
        const a = new Component('div');
        const b = new Component('div');
        a.motif.on('x:mounted' as any, kept);
        b.motif.on('x:mounted' as any, removed);
        await b.motif.off('x:mounted' as any, removed);
        root.controls.add(a, b);
        await settle();
        expect(created).toBe(1);
        expect(kept).toHaveBeenCalledTimes(1);
        expect(removed).not.toHaveBeenCalled();
        expect(active).toBe(0);
    });

    test('fırlatan bir kanca diğerlerini durdurmaz', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => { });
        class Bad extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            onMounted() { throw new Error('boom'); }
        }
        root.controls.add(new Row('before'), new Bad(), new Row('after'));
        await settle();
        expect(log).toEqual(['before', 'after']);
        error.mockRestore();
    });

    test('kanca içinde eklenen bileşen de bağlanır', async () => {
        class Spawner extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            onMounted(sender: ComponentBase) {
                log.push('spawner');
                (sender as Component).controls.add(new Row('spawned'));
            }
        }
        root.controls.add(new Spawner());
        await settle();
        expect(log).toEqual(['spawner', 'spawned']);
        expect(active).toBe(0);
    });
});
