import { Component, ComponentBase, Virtualization, effect, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

interface Row { id: number; h: number; title: string }

function setup(data: Row[]) {
    let built = 0;
    const virt = new Virtualization<Row>({
        itemHeight: (row) => row.h,
        autoRefresh: false,
        dataRequest: async () => ({ items: data, totalCount: data.length, hasMore: false }),
        itemTemplate: (row) => new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                built++;
                s.class.add('row');
                (s.element as HTMLElement).textContent = row.title;
            },
        }),
    });
    const el = virt.element as HTMLElement;
    let top = 0;
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 200 });
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(virt);
    return { virt, root, built: () => built };
}

function makeRows(n: number): Row[] {
    return reactive(Array.from({ length: n }, (_, i) => ({ id: i, h: 20, title: 'row ' + i }))) as Row[];
}

describe('Virtualization methods called from an effect', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('setData does not subscribe the caller to heights or row reads', async () => {
        const data = makeRows(500);
        const h = setup(data);
        await settle();
        const tick = reactive({ n: 0 });
        let runs = 0;
        const stop = effect(() => { runs++; tick.n; h.virt.setData(data); });
        await settle();
        const built = h.built();

        data[400].h = 50;
        data[0].title = 'changed';
        await settle();
        expect(runs).toBe(1);
        expect(h.built()).toBe(built);

        tick.n++;
        await settle();
        expect(runs).toBe(2);
        stop();
        await h.root.dispose();
    });

    test('scrollToIndex does not subscribe the caller to the rows it builds', async () => {
        const data = makeRows(500);
        const h = setup(data);
        await settle();
        h.virt.setData(data);
        let runs = 0;
        const stop = effect(() => { runs++; h.virt.scrollToIndex(300); });
        await settle();

        data[300].title = 'changed';
        data[450].h = 50;
        await settle();
        expect(runs).toBe(1);
        stop();
        await h.root.dispose();
    });

    test('refresh does not subscribe the caller to the loaded rows', async () => {
        const data = makeRows(500);
        const h = setup(data);
        await settle();
        let runs = 0;
        const stop = effect(() => { runs++; void h.virt.refresh(); });
        await settle();

        data[0].title = 'changed';
        data[400].h = 50;
        await settle();
        expect(runs).toBe(1);
        stop();
        await h.root.dispose();
    });
});
