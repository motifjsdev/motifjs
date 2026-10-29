import { Component, ComponentBase, Virtualization, effect, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

interface Row { id: number; h: number }

function makeRows(n: number, h = 20): Row[] {
    return Array.from({ length: n }, (_, i) => ({ id: i, h }));
}

function setup(opts: { itemHeight?: number | ((row: Row) => number); filter?: (rows: Row[]) => Row[] } = {}) {
    const created: ComponentBase[] = [];
    const virt = new Virtualization<Row>({
        itemHeight: opts.itemHeight ?? ((row: Row) => row.h),
        autoRefresh: false,
        filter: opts.filter,
        dataRequest: async () => ({ items: [], totalCount: 0, hasMore: false }),
        itemTemplate: (row) => {
            const c = new Component('div', {
                initializeComponent: (s: ComponentBase) => {
                    s.class.add('row');
                    (s.element as HTMLElement).dataset.id = String(row.id);
                },
            });
            created.push(c);
            return c;
        },
    });
    const el = virt.element as HTMLElement;
    let top = 0;
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 100 });
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(virt);
    const spacer = (name: string) => parseFloat(el.querySelector<HTMLElement>('.motif-virtualization-' + name + '-spacer')!.style.height);
    return {
        virt, root, el, created,
        ids: () => Array.from(el.querySelectorAll<HTMLElement>('.row')).map(r => Number(r.dataset.id)),
        disposed: () => created.filter(c => c.isDisposed).length,
        spacers: () => ({ top: spacer('top'), bottom: spacer('bottom') }),
        async scrollTo(px: number) { el.scrollTop = px; el.dispatchEvent(new Event('scroll')); await settle(); },
    };
}

describe('Virtualization.updateHeights', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a row above the screen that grows moves the scroll by the difference and keeps every row', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * 20 + 7);
        const built = h.created.length;
        data[50].h = 80;
        h.virt.updateHeights();
        await settle();
        expect(h.el.scrollTop).toBe(100 * 20 + 60 + 7);
        expect(h.ids()).toContain(100);
        expect(h.created.length).toBe(built);
        expect(h.disposed()).toBe(0);
        await h.root.dispose();
    });

    test('a row below the screen that grows leaves the scroll alone and resizes the bottom spacer', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * 20 + 7);
        const before = h.spacers().bottom;
        data[400].h = 80;
        h.virt.updateHeights();
        expect(h.el.scrollTop).toBe(100 * 20 + 7);
        expect(h.spacers().bottom).toBe(before + 60);
        await h.root.dispose();
    });

    test('the row at the top of the screen that grows keeps its top in place', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * 20 + 7);
        data[100].h = 80;
        h.virt.updateHeights();
        expect(h.el.scrollTop).toBe(100 * 20 + 7);
        await h.root.dispose();
    });

    test('a row sticking out above the screen that becomes shorter stays partly visible', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * 20 + 15);
        data[100].h = 10;
        h.virt.updateHeights();
        expect(h.el.scrollTop).toBe(100 * 20 + 9);
        expect(h.ids()).toContain(100);
        await h.root.dispose();
    });

    test('a fixed height changed through props keeps the row at the top in place', async () => {
        const h = setup({ itemHeight: 20 });
        await settle();
        h.virt.setData(makeRows(500));
        await h.scrollTo(100 * 20 + 7);
        (h.virt.props as any).itemHeight = 30;
        h.virt.updateHeights();
        expect(h.el.scrollTop).toBe(100 * 30 + 7);
        expect(h.spacers().top + h.ids().length * 30 + h.spacers().bottom).toBe(500 * 30);
        await h.root.dispose();
    });

    test('at the top the list stays at the top', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        data[0].h = 80;
        h.virt.updateHeights();
        expect(h.el.scrollTop).toBe(0);
        expect(h.ids()[0]).toBe(0);
        await h.root.dispose();
    });

    test('the filter is not run again', async () => {
        let runs = 0;
        const data = makeRows(100);
        const h = setup({ filter: (rows) => { runs++; return rows; } });
        await settle();
        h.virt.setData(data);
        const before = runs;
        data[3].h = 50;
        h.virt.updateHeights();
        expect(runs).toBe(before);
        await h.root.dispose();
    });

    test('called from an effect it does not subscribe the caller to the heights', async () => {
        const data = reactive(makeRows(500)) as Row[];
        const h = setup();
        await settle();
        h.virt.setData(data);
        const tick = reactive({ n: 0 });
        let runs = 0;
        const stop = effect(() => { runs++; tick.n; h.virt.updateHeights(); });
        await settle();
        data[400].h = 80;
        data[0].h = 30;
        await settle();
        expect(runs).toBe(1);
        stop();
        await h.root.dispose();
    });
});
