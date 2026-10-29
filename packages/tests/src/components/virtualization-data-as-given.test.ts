import { Component, ComponentBase, Virtualization, reactive } from '@motifx/core';

const H = 20;
const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

interface Row { id: number; title: string }

function makeRows(n: number): Row[] {
    return Array.from({ length: n }, (_, i) => ({ id: i, title: 'row ' + i }));
}

function setup(opts: { pages?: Row[][]; withMain?: boolean } = {}) {
    const templateItems: Row[] = [];
    const heightItems: Row[] = [];
    const virt = new Virtualization<Row>({
        itemHeight: (row) => { heightItems.push(row); return H; },
        pageSize: 10,
        autoRefresh: false,
        dataRequest: async ({ page }) => {
            const pages = opts.pages ?? [];
            const items = pages[page] ?? [];
            return { items, totalCount: pages.reduce((n, p) => n + p.length, 0), hasMore: page + 1 < pages.length };
        },
        itemTemplate: (row) => {
            templateItems.push(row);
            return new Component('div', {
                initializeComponent: (s: ComponentBase) => {
                    s.class.add('row');
                    s.bindings.text(() => row.title);
                },
            });
        },
        mainTemplate: opts.withMain
            ? (content, state) => new Component('div', {
                initializeComponent: (s: ComponentBase) => {
                    const count = new Component('span');
                    count.class.add('count');
                    count.bindings.text(() => String(state.data.length));
                    const body = new Component('div');
                    s.controls.add(count, body);
                    body.controls.add(content);
                },
            })
            : undefined,
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(virt);
    const scroller = () => virt.wrapper.element as HTMLElement;
    const layout = () => {
        const el = scroller();
        let top = 0;
        Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 100 });
        Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
    };
    if (!opts.withMain) layout();
    const rows = () => Array.from(host.querySelectorAll<HTMLElement>('.row'));
    return { virt, root, host, rows, layout, templateItems, heightItems };
}

describe('Virtualization keeps the data as it is given', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('plain items reach itemTemplate, itemHeight and getState unchanged', async () => {
        const h = setup();
        await settle();
        const data = makeRows(30);
        h.virt.setData(data);
        expect(h.templateItems.length).toBeGreaterThan(0);
        expect(h.templateItems.every(item => data.includes(item))).toBe(true);
        expect(h.heightItems.every(item => data.includes(item))).toBe(true);
        expect(h.virt.getState().data).toBe(data);
        await h.root.dispose();
    });

    test('a plain item stays plain: writing to it does not update its row', async () => {
        const h = setup();
        await settle();
        const data = makeRows(5);
        h.virt.setData(data);
        expect(h.rows()[0].textContent).toBe('row 0');
        h.templateItems[0].title = 'changed';
        await settle();
        expect(h.rows()[0].textContent).toBe('row 0');
        await h.root.dispose();
    });

    test('reactive items stay reactive and keep updating their rows', async () => {
        const h = setup();
        await settle();
        const data = reactive(makeRows(5)) as Row[];
        h.virt.setData(data);
        expect(h.templateItems[0]).toBe(data[0]);
        data[0].title = 'changed';
        await settle();
        expect(h.rows()[0].textContent).toBe('changed');
        await h.root.dispose();
    });

    test('next pages do not write into the array of the first page', async () => {
        const first = makeRows(10);
        const second = makeRows(10).map(r => ({ ...r, id: r.id + 10 }));
        const h = setup({ pages: [first, second], withMain: true });
        h.layout();
        await settle();
        await settle();
        expect(h.virt.getState().data.length).toBe(20);
        expect(first.length).toBe(10);
        expect(h.host.querySelector('.count')!.textContent).toBe('20');
        await h.root.dispose();
    });
});
