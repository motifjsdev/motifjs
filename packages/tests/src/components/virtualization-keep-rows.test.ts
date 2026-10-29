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

interface Row { id: number }

function setup<T>(opts: { data?: () => T[]; model?: { tick: number }; empty?: boolean } = {}) {
    const created: ComponentBase[] = [];
    const virt = new Virtualization<T>({
        itemHeight: H,
        autoRefresh: !!opts.model,
        dataRequest: async () => {
            if (opts.model) opts.model.tick;
            const items = opts.data ? opts.data() : [];
            return { items, totalCount: items.length, hasMore: false };
        },
        emptyTemplate: opts.empty ? () => new Component('p', { initializeComponent: (s: ComponentBase) => { s.class.add('empty'); } }) : undefined,
        itemTemplate: (item: any) => {
            const c = new Component('div', {
                initializeComponent: (s: ComponentBase) => {
                    s.class.add('row');
                    (s.element as HTMLElement).dataset.id = String(typeof item === 'object' ? item.id : item);
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
    const rows = () => Array.from(el.querySelectorAll<HTMLElement>('.row'));
    return {
        virt, root, el, created, rows,
        ids: () => rows().map(r => r.dataset.id).join(','),
        disposed: () => created.filter(c => c.isDisposed).length,
        async scrollTo(px: number) { el.scrollTop = px; el.dispatchEvent(new Event('scroll')); await settle(); },
    };
}

function makeRows(n: number): Row[] {
    return Array.from({ length: n }, (_, i) => ({ id: i }));
}

describe('Virtualization keeps the rows of items that stay', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('setData with the same items builds and releases nothing', async () => {
        const data = makeRows(100);
        const h = setup<Row>();
        await settle();
        h.virt.setData(data);
        const before = h.rows();
        const built = h.created.length;
        h.virt.setData(data.slice());
        await settle();
        expect(h.created.length).toBe(built);
        expect(h.rows()).toEqual(before);
        expect(h.disposed()).toBe(0);
        await h.root.dispose();
    });

    test('only the row of a removed item is released; an added item gets a new row', async () => {
        const data = makeRows(100);
        const h = setup<Row>();
        await settle();
        h.virt.setData(data);
        const rows = h.rows();
        const removed = h.created.find(c => (c.element as HTMLElement).dataset.id === '2')!;
        const added = { id: 1000 };
        const next = data.filter(r => r.id !== 2);
        next.splice(3, 0, added);
        h.virt.setData(next);
        await waitFor(() => removed.isDisposed);
        expect(h.disposed()).toBe(1);
        expect(h.ids().split(',').slice(0, 5).join(',')).toBe('0,1,3,1000,4');
        expect(h.rows()[0]).toBe(rows[0]);
        expect(h.rows()[2]).toBe(rows[3]);
        await h.root.dispose();
    });

    test('a cached row off screen survives setData and comes back on scroll', async () => {
        const data = makeRows(500);
        const h = setup<Row>();
        await settle();
        h.virt.setData(data);
        const first = h.rows()[0];
        await h.scrollTo(300 * H);
        expect(first.isConnected).toBe(false);
        h.virt.setData(data.slice());
        await settle();
        await h.scrollTo(0);
        expect(h.rows()[0]).toBe(first);
        expect(h.disposed()).toBe(0);
        await h.root.dispose();
    });

    test('a primitive keeps its row only when the same value stays at the same position', async () => {
        const h = setup<string>();
        await settle();
        h.virt.setData(['a', 'b', 'c']);
        const [a, b, c] = h.rows();
        h.virt.setData(['a', 'x', 'c']);
        await waitFor(() => h.disposed() === 1);
        const now = h.rows();
        expect(now[0]).toBe(a);
        expect(now[1]).not.toBe(b);
        expect(now[1].dataset.id).toBe('x');
        expect(now[2]).toBe(c);
        await h.root.dispose();
    });

    test('each occurrence of the same object keeps its own row', async () => {
        const a = { id: 1 }, b = { id: 2 };
        const h = setup<Row>();
        await settle();
        h.virt.setData([a, b, a]);
        const [first, , second] = h.rows();
        h.virt.setData([a, b, a]);
        await settle();
        expect(h.rows()[0]).toBe(first);
        expect(h.rows()[2]).toBe(second);
        h.virt.setData([a, b]);
        await waitFor(() => h.disposed() === 1);
        expect(h.rows()[0]).toBe(first);
        expect(second.isConnected).toBe(false);
        await h.root.dispose();
    });

    test('a raw item and its reactive proxy find the same row', async () => {
        const raw = makeRows(5);
        const h = setup<Row>();
        await settle();
        h.virt.setData(raw);
        const before = h.rows();
        h.virt.setData(reactive(raw.slice()) as Row[]);
        await settle();
        expect(h.rows()).toEqual(before);
        expect(h.disposed()).toBe(0);
        await h.root.dispose();
    });

    test('an autoRefresh reload that returns the same objects keeps their rows', async () => {
        const data = makeRows(50);
        const model = reactive({ tick: 0 });
        const h = setup<Row>({ data: () => data, model });
        await waitFor(() => h.rows().length > 0);
        const before = h.rows();
        const built = h.created.length;
        model.tick++;
        await settle();
        await settle();
        expect(h.created.length).toBe(built);
        expect(h.rows()).toEqual(before);
        expect(h.disposed()).toBe(0);
        await h.root.dispose();
    });

    test('the empty view is replaced when items arrive', async () => {
        const h = setup<Row>({ empty: true });
        await settle();
        h.virt.setData([]);
        expect(h.el.querySelector('.empty')).not.toBeNull();
        h.virt.setData(makeRows(3));
        expect(h.el.querySelector('.empty')).toBeNull();
        expect(h.ids()).toBe('0,1,2');
        await h.root.dispose();
    });
});
