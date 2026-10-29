import { Component, ComponentBase, Virtualization, reactive } from '@motifx/core';

const H = 20;
const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

async function waitFor(check: () => boolean, ms = 2000) {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error('waitFor timed out');
        await new Promise(r => setTimeout(r, 5));
    }
}

interface Row { id: number; h?: number }

function makeRows(n: number, from = 0): Row[] {
    return Array.from({ length: n }, (_, i) => ({ id: from + i }));
}

function setup(opts: { height?: (row: Row) => number; data?: () => Row[]; model?: { tick: number } } = {}) {
    const virt = new Virtualization<Row>({
        itemHeight: opts.height ?? H,
        autoRefresh: !!opts.model,
        dataRequest: async () => {
            if (opts.model) opts.model.tick;
            const items = opts.data ? opts.data().slice() : [];
            return { items, totalCount: items.length, hasMore: false };
        },
        itemTemplate: (row) => new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                s.class.add('row');
                (s.element as HTMLElement).dataset.id = String(row.id);
            },
        }),
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
    const ids = () => Array.from(el.querySelectorAll<HTMLElement>('.row')).map(r => Number(r.dataset.id));
    return {
        virt, root, el, ids,
        async scrollTo(px: number) { el.scrollTop = px; el.dispatchEvent(new Event('scroll')); await settle(); },
    };
}

describe('Virtualization keeps the row at the top of the screen in place when the data changes', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('an item added above moves the scroll by its height', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * H + 7);
        h.virt.setData([{ id: -1 }, ...data]);
        expect(h.el.scrollTop).toBe(101 * H + 7);
        expect(h.ids()).toContain(100);
        await h.root.dispose();
    });

    test('items removed above move the scroll back by their heights', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * H + 7);
        h.virt.setData(data.filter(r => r.id < 10 || r.id >= 20));
        expect(h.el.scrollTop).toBe(90 * H + 7);
        await h.root.dispose();
    });

    test('at the top the list stays at the top and shows the added item', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        h.virt.setData([{ id: -1 }, ...data]);
        expect(h.el.scrollTop).toBe(0);
        expect(h.ids()[0]).toBe(-1);
        await h.root.dispose();
    });

    test('when the item at the top is removed the next visible row keeps its place on screen', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * H + 7);
        h.virt.setData(data.filter(r => r.id !== 100));
        expect(h.el.scrollTop).toBe(100 * H - (H - 7));
        expect(h.ids()).toContain(101);
        await h.root.dispose();
    });

    test('when every visible row is removed a rendered row above the screen keeps its place', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * H);
        h.virt.setData(data.filter(r => r.id < 100 || r.id >= 105));
        expect(h.el.scrollTop).toBe(100 * H);
        expect(h.ids()).toContain(99);
        expect(h.ids()).toContain(105);
        await h.root.dispose();
    });

    test('a row partly above the screen that becomes shorter stays partly visible', async () => {
        const height = (row: Row) => row.h ?? 20;
        const data = makeRows(500);
        const h = setup({ height });
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * H + 15);
        data[100].h = 10;
        h.virt.setData(data);
        expect(h.el.scrollTop).toBe(100 * H + 9);
        expect(h.ids()).toContain(100);
        await h.root.dispose();
    });

    test('an array changed in place and given again keeps the item on screen', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * H + 7);
        data.splice(10, 5);
        h.virt.setData(data);
        expect(h.el.scrollTop).toBe(95 * H + 7);
        await h.root.dispose();
    });

    test('with item heights the scroll moves by the height of the added item', async () => {
        const height = (row: Row) => row.h ?? (row.id % 2 === 0 ? 20 : 40);
        const data = makeRows(500);
        const h = setup({ height });
        await settle();
        h.virt.setData(data);
        const topOf100 = data.slice(0, 100).reduce((sum, r) => sum + height(r), 0);
        await h.scrollTo(topOf100 + 5);
        h.virt.setData([{ id: -1, h: 33 }, ...data]);
        expect(h.el.scrollTop).toBe(topOf100 + 33 + 5);
        await h.root.dispose();
    });

    test('a new order takes the scroll to the new position of the item', async () => {
        const data = makeRows(500);
        const h = setup();
        await settle();
        h.virt.setData(data);
        await h.scrollTo(100 * H + 7);
        h.virt.setData(data.slice().reverse());
        expect(h.el.scrollTop).toBe(399 * H + 7);
        expect(h.ids()).toContain(100);
        await h.root.dispose();
    });

    test('a next page that a sorting filter places above keeps the row on screen in place', async () => {
        interface Keyed { id: number; key: number }
        const pool: Keyed[] = Array.from({ length: 40 }, (_, i) => ({ id: i, key: (i % 20) * 10 + (i < 20 ? 0 : 5) }));
        const virt = new Virtualization<Keyed>({
            itemHeight: H,
            pageSize: 20,
            autoRefresh: false,
            filter: (xs) => xs.slice().sort((a, b) => a.key - b.key),
            dataRequest: async ({ page, pageSize }) => {
                const items = pool.slice(page * pageSize, page * pageSize + pageSize);
                return { items, totalCount: pool.length, hasMore: (page + 1) * pageSize < pool.length };
            },
            itemTemplate: (row) => new Component('div', {
                initializeComponent: (s: ComponentBase) => {
                    s.class.add('row');
                    (s.element as HTMLElement).dataset.id = String(row.id);
                },
            }),
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
        await waitFor(() => virt.getState().data.length === 20);
        el.scrollTop = 10 * H + 7;
        el.dispatchEvent(new Event('scroll'));
        await waitFor(() => virt.getState().data.length === 40);
        expect(el.scrollTop).toBe(20 * H + 7);
        await root.dispose();
    });

    test('a primitive list keeps the value on screen in place when values are added above', async () => {
        const virt = new Virtualization<string>({
            itemHeight: H,
            autoRefresh: false,
            dataRequest: async () => ({ items: [], totalCount: 0, hasMore: false }),
            itemTemplate: (value) => new Component('div', {
                initializeComponent: (s: ComponentBase) => {
                    s.class.add('row');
                    (s.element as HTMLElement).dataset.id = value;
                },
            }),
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
        await settle();
        const values = Array.from({ length: 500 }, (_, i) => 'v' + i);
        virt.setData(values);
        el.scrollTop = 100 * H + 7;
        el.dispatchEvent(new Event('scroll'));
        await settle();
        virt.setData(['p1', 'p2', 'p3', ...values]);
        expect(el.scrollTop).toBe(103 * H + 7);
        const rows = Array.from(el.querySelectorAll<HTMLElement>('.row')).map(r => r.dataset.id);
        expect(rows).toContain('v100');
        await root.dispose();
    });

    test('a row that the filter drops when the next page arrives is released', async () => {
        const first = { id: 1, v: 'old' }, others = Array.from({ length: 19 }, (_, i) => ({ id: i + 2, v: 'x' }));
        const replaced = { id: 1, v: 'new' };
        const pages = [[first, ...others], [replaced]];
        const built: { item: any; c: ComponentBase }[] = [];
        const virt = new Virtualization<any>({
            itemHeight: H,
            pageSize: 20,
            autoRefresh: false,
            filter: (xs) => xs.filter(x => !(x === first && xs.includes(replaced))),
            dataRequest: async ({ page }) => ({ items: pages[page] ?? [], totalCount: 21, hasMore: page === 0 }),
            itemTemplate: (row) => {
                const c = new Component('div', { initializeComponent: (s: ComponentBase) => { s.class.add('row'); } });
                built.push({ item: row, c });
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
        await waitFor(() => virt.getState().data.length === 20);
        const firstRow = built.find(b => b.item === first)!.c;
        el.scrollTop = 15 * H;
        el.dispatchEvent(new Event('scroll'));
        await waitFor(() => virt.getState().data.length === 21);
        await waitFor(() => firstRow.isDisposed);
        expect(built.filter(b => b.c.isDisposed).length).toBe(1);
        await root.dispose();
    });

    test('an autoRefresh reload keeps the item at the top in place', async () => {
        const data = makeRows(500);
        const model = reactive({ tick: 0 });
        const h = setup({ data: () => data, model });
        await waitFor(() => h.ids().length > 0);
        await h.scrollTo(100 * H + 7);
        data.unshift({ id: -1 }, { id: -2 });
        model.tick++;
        await waitFor(() => h.el.scrollTop !== 100 * H + 7);
        expect(h.el.scrollTop).toBe(102 * H + 7);
        await h.root.dispose();
    });
});
