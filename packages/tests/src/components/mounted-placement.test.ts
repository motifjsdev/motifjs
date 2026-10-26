/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0));
const until = async (done: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!done() && Date.now() < end) await settle();
};

let host: HTMLElement;
let root: Component;
const log: string[] = [];

class Row extends Component<HTMLDivElement> {
    constructor(public tag: string, element?: HTMLDivElement) { super((element ?? 'div') as any); }
    onMounted() { log.push(this.tag); }
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
    await settle();
});

describe('onMounted yerleşme izi', () => {
    test('çok sayıda bileşen kayıt sırasıyla ve birer kez bağlanır', async () => {
        for (let i = 0; i < 300; i++) root.controls.add(new Row('r' + i));
        await until(() => log.length === 300);
        expect(log).toEqual(Array.from({ length: 300 }, (_, i) => 'r' + i));
        await settle();
        expect(log.length).toBe(300);
    });

    test('kanca eklemeyle aynı görevde ve onun microtask aşamasında değil, sonraki görevde çalışır', async () => {
        root.controls.add(new Row('a'));
        expect(log).toEqual([]);
        await Promise.resolve();
        expect(log).toEqual([]);
        await until(() => log.length === 1);
        expect(log).toEqual(['a']);
    });

    test('iç içe bileşenlerde alt bileşen üstten önce bağlanır', async () => {
        class Outer extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            view() { return new Row('inner'); }
            onMounted() { log.push('outer'); }
        }
        root.controls.add(new Outer());
        await until(() => log.length === 2);
        expect(log).toEqual(['inner', 'outer']);
    });

    test('kopuk kurulan alt ağaç sonradan sayfaya verilince bekleyen kancalar alt-önce sırasıyla çalışır', async () => {
        class Outer extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            view() { return new Row('inner'); }
            onMounted() { log.push('outer'); }
        }
        const outer = new Outer();
        outer.build();
        await settle();
        expect(log).toEqual([]);
        root.controls.add(outer);
        await until(() => log.length === 2);
        expect(log).toEqual(['inner', 'outer']);
    });

    test('bağlanmadan serbest bırakılan bileşenin kancası çalışmaz', async () => {
        const row = new Row('gone');
        row.build();
        const element = row.element as Node;
        await row.dispose();
        host.appendChild(element);
        await settle();
        await settle();
        expect(log).toEqual([]);
    });

    test('çekirdek dışından appendChild ile belgeye konan bileşen bağlanmaz, controls.add ile verilince bağlanır', async () => {
        const row = new Row('manual');
        row.build();
        host.appendChild(row.element as Node);
        await settle();
        await settle();
        expect(log).toEqual([]);
        root.controls.add(row);
        await until(() => log.length === 1);
        expect(log).toEqual(['manual']);
    });

    test('sayfadaki hazır elemanı saran bileşen kök sayılır, kancası sonraki görevde çalışır', async () => {
        const row = new Row('direct', host.appendChild(document.createElement('div')));
        row.build();
        expect(log).toEqual([]);
        await settle();
        expect(log).toEqual(['direct']);
    });

    test('kopuk bir elemanı saran bileşen, eleman belgede değilken bağlanmaz', async () => {
        const row = new Row('loose', document.createElement('div'));
        row.build();
        await settle();
        await settle();
        expect(log).toEqual([]);
    });

    test('ayrılan alt ağaca eklenen çocuk, ağaç yeniden takılınca bağlanır', async () => {
        const page = new Component('section');
        root.controls.add(page);
        await settle();
        await root.controls.detach(page);
        page.controls.add(new Row('late'));
        await settle();
        await settle();
        expect(log).toEqual([]);
        root.controls.add(page);
        await until(() => log.length === 1);
        expect(log).toEqual(['late']);
    });

    test('x:mounted dinleyicisi çalışır, off ile kaldırılan çalışmaz', async () => {
        const kept = jest.fn();
        const removed = jest.fn();
        const a = new Component('div');
        const b = new Component('div');
        a.motif.on('x:mounted' as any, kept);
        b.motif.on('x:mounted' as any, removed);
        await b.motif.off('x:mounted' as any, removed);
        root.controls.add(a, b);
        await until(() => kept.mock.calls.length === 1);
        await settle();
        expect(kept).toHaveBeenCalledTimes(1);
        expect(removed).not.toHaveBeenCalled();
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

    test('kanca içinde eklenen bileşen de bağlanır', async () => {
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
