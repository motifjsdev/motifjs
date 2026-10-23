/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';

const nextTask = () => new Promise(r => setTimeout(r, 0));
const afterTasks = async (n = 4) => { for (let i = 0; i < n; i++) await nextTask(); };
const until = async (done: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!done() && Date.now() < end) await nextTask();
};

let host: HTMLElement;
let root: Component;
const log: string[] = [];

class Row extends Component<HTMLDivElement> {
    constructor(public tag: string) { super('div'); }
    onMounted() { log.push(this.tag); }
}

class Slow extends Component<HTMLDivElement> {
    constructor(public tag: string) { super('div'); }
    onMounted() {
        const end = Date.now() + 3;
        while (Date.now() < end) { }
        log.push(this.tag);
    }
}

beforeEach(() => {
    log.length = 0;
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host);
    root.build();
});

afterEach(async () => {
    root.dispose();
    host.remove();
    await afterTasks();
});

describe('onMounted kurulumla aynı görevde değil, sonraki görevde ve dilimler hâlinde çalışır', () => {
    test('kanca eklemeyle aynı görevde ve onun microtask aşamasında çalışmaz, sonraki görevde çalışır', async () => {
        root.controls.add(new Row('a'));
        expect(log).toEqual([]);
        await Promise.resolve();
        await Promise.resolve();
        expect(log).toEqual([]);
        await until(() => log.length === 1);
        expect(log).toEqual(['a']);
    });

    test('sayfadaki bir eleman üzerinde kurulan bileşenin kancası da sonraki görevde çalışır', async () => {
        const row = new Row('direct');
        host.appendChild(row.element as Node);
        row.build();
        expect(log).toEqual([]);
        await nextTask();
        expect(log).toEqual(['direct']);
        await row.dispose();
    });

    test('çok sayıda kanca dilimlere bölünür, sıra korunur', async () => {
        for (let i = 0; i < 40; i++) root.controls.add(new Slow('s' + i));
        await nextTask();
        await nextTask();
        expect(log.length).toBeGreaterThan(0);
        expect(log.length).toBeLessThan(40);
        await until(() => log.length === 40);
        expect(log).toEqual(Array.from({ length: 40 }, (_, i) => 's' + i));
    });

    test('sırada bekleyen kanca, bileşen bertaraf edilince çalışmaz', async () => {
        const rows = Array.from({ length: 40 }, (_, i) => new Slow('s' + i));
        for (const row of rows) root.controls.add(row);
        await until(() => log.length > 0);
        const ran = log.length;
        expect(ran).toBeLessThan(40);
        for (const row of rows.slice(ran)) row.dispose();
        await afterTasks(10);
        expect(log.length).toBe(ran);
    });

    test('sırası gelmeden kaldırılan x:mounted dinleyicisi çağrılmaz', async () => {
        const kept = jest.fn();
        const removed = jest.fn();
        const a = new Component('div');
        const b = new Component('div');
        a.motif.on('x:mounted' as any, kept);
        b.motif.on('x:mounted' as any, removed);
        root.controls.add(a, b);
        await Promise.resolve();
        await b.motif.off('x:mounted' as any, removed);
        await until(() => kept.mock.calls.length === 1);
        await afterTasks();
        expect(kept).toHaveBeenCalledTimes(1);
        expect(removed).not.toHaveBeenCalled();
    });

    test('elle appendChild ile sayfaya konan bileşenin kancası yine çalışır', async () => {
        const row = new Row('manual');
        row.build();
        host.appendChild(row.element as Node);
        await until(() => log.length === 1);
        expect(log).toEqual(['manual']);
        await row.dispose();
    });

    test('iç içe bileşenlerde alt bileşen üstten önce çalışır', async () => {
        class Outer extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            view() { return new Row('inner'); }
            onMounted() { log.push('outer'); }
        }
        root.controls.add(new Outer());
        await until(() => log.length === 2);
        expect(log).toEqual(['inner', 'outer']);
    });

    test('fırlatan bir kanca diğerlerini durdurmaz', async () => {
        const error = jest.spyOn(console, 'error').mockImplementation(() => { });
        class Bad extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            onMounted() { throw new Error('boom'); }
        }
        root.controls.add(new Row('before'), new Bad(), new Row('after'));
        await until(() => log.length === 2);
        expect(log).toEqual(['before', 'after']);
        error.mockRestore();
    });

    test('kanca içinde eklenen bileşenin de kancası çalışır', async () => {
        class Spawner extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            onMounted(sender: ComponentBase) {
                log.push('spawner');
                (sender as Component).controls.add(new Row('spawned'));
            }
        }
        root.controls.add(new Spawner());
        await until(() => log.length === 2);
        expect(log).toEqual(['spawner', 'spawned']);
    });
});
