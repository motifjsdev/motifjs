/**
 * @jest-environment jsdom
 */
import { Application, Component, Transport, TransportTo, reactive } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));
const until = async (done: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!done() && Date.now() < end) await tick();
};

function otherDocument(): Document {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentDocument!;
}

const log: string[] = [];

class Row extends Component<HTMLDivElement> {
    constructor(public tag: string) { super('div'); }
    onMounted() { log.push(this.tag + ':' + ((this.element as Node).isConnected ? 'in' : 'out')); }
}

describe('başka belgede ve her yerleşme yolunda onMounted', () => {
    let host: HTMLElement;
    let root: Component;
    let other: Document;

    beforeEach(() => {
        log.length = 0;
        host = document.body.appendChild(document.createElement('div'));
        root = new Component(host);
        root.build();
        other = otherDocument();
    });

    afterEach(async () => {
        root.dispose();
        document.body.innerHTML = '';
        await tick();
    });

    test('başka belgenin gövdesini saran köke eklenen bileşen o belgede bağlanır', async () => {
        const popupRoot = new Component(other.body);
        popupRoot.build();
        const grid = new Row('grid');
        popupRoot.controls.add(grid);
        await until(() => log.length === 1);
        expect(log).toEqual(['grid:in']);
        expect((grid.element as Node).ownerDocument).toBe(other);
    });

    test('sayfada bağlanmış bileşen başka belgeye taşınınca kancası bir daha çalışmaz', async () => {
        const row = new Row('moved');
        root.controls.add(row);
        await until(() => log.length === 1);
        const popupRoot = new Component(other.body);
        popupRoot.build();
        popupRoot.controls.add(row);
        await tick();
        await tick();
        expect(log).toEqual(['moved:in']);
        expect((row.element as Node).ownerDocument).toBe(other);
    });

    test('kopuk kurulan alt ağaç başka belgenin köküne verilince bekleyen kancalar orada, alt-önce çalışır', async () => {
        class Outer extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            view() { return new Row('inner'); }
            onMounted() { log.push('outer'); }
        }
        const outer = new Outer();
        outer.build();
        await tick();
        expect(log).toEqual([]);
        const popupRoot = new Component(other.body);
        popupRoot.build();
        popupRoot.controls.add(outer);
        await until(() => log.length === 2);
        expect(log).toEqual(['inner:in', 'outer']);
    });

    test('kanca sırası elemanın penceresinin zamanlayıcısıyla çalışır', async () => {
        const win: any = other.defaultView;
        const popupRoot = new Component(other.body);
        popupRoot.build();
        const theirs = jest.spyOn(win, 'setTimeout');
        const page = jest.spyOn(window, 'setTimeout');
        try {
            popupRoot.controls.add(new Row('timed'));
            expect(theirs.mock.calls.some(args => args[1] === 0)).toBe(true);
            expect(page.mock.calls.some(args => args[1] === 0)).toBe(false);
        } finally {
            theirs.mockRestore();
            page.mockRestore();
        }
        await until(() => log.length === 1);
        expect(log).toEqual(['timed:in']);
    });

    test('gizli eklenen bileşen gösterilince bağlanır', async () => {
        const row = new Row('hidden');
        await row.motif.hide();
        root.controls.add(row);
        await tick();
        await tick();
        expect(log).toEqual([]);
        await row.motif.show();
        await until(() => log.length === 1);
        expect(log).toEqual(['hidden:in']);
    });

    test('x-wait ile bekleyen bileşen bekleme bitince bağlanır', async () => {
        const gate = reactive({ wait: true });
        const row = new Row('waited');
        row.bindings.wait(() => gate.wait);
        root.controls.add(row);
        await tick();
        await tick();
        expect(log).toEqual([]);
        gate.wait = false;
        await until(() => log.length === 1);
        expect(log).toEqual(['waited:in']);
    });

    test('gizli bir ebeveynin altına eklenen çocuk, ebeveyn gösterilince bağlanır', async () => {
        const panel = new Component('div');
        root.controls.add(panel);
        await tick();
        await panel.motif.hide();
        panel.controls.add(new Row('child'));
        await tick();
        await tick();
        expect(log).toEqual([]);
        await panel.motif.show();
        await until(() => log.length === 1);
        expect(log).toEqual(['child:in']);
    });

    test('yuvası gizliyken taşınan içerik yuva gösterilince bağlanır', async () => {
        const app = Application.CreateBuilder().build();
        const appHost = document.body.appendChild(document.createElement('div'));
        const appRoot = new Component('div');
        app.run(appHost, appRoot);
        try {
            const region = new Component('div');
            region.controls.add(new Transport({ name: 'tp' } as any));
            appRoot.controls.add(region);
            await tick();
            await region.motif.hide();
            const to = new TransportTo({ name: 'tp' });
            appRoot.controls.add(to);
            to.controls.add(new Row('item'));
            await tick();
            await tick();
            expect(log).toEqual([]);
            await region.motif.show();
            await until(() => log.length === 1);
            expect(log).toEqual(['item:in']);
        } finally {
            await app.dispose();
        }
    });

    test('çekirdek dışından appendChild ile başka belgeye konan bileşen bağlanmaz', async () => {
        const row = new Row('raw');
        row.build();
        other.body.appendChild(row.element as Node);
        await tick();
        await tick();
        await tick();
        expect(log).toEqual([]);
    });
});
