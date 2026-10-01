import { Component, ComponentBase, Virtualization } from '@motifx/core';

const H = 20;
const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function setup(data: any[]) {
    let first!: () => void;
    const loaded = new Promise<void>(r => { first = r; });
    const virt = new Virtualization<any>({
        itemHeight: H,
        pageSize: 1000,
        autoRefresh: false,
        dataRequest: async () => { first(); return { items: data, totalCount: data.length, hasMore: false }; },
        itemTemplate: (row: any) => new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                s.class.add('row');
                (s.element as HTMLElement).dataset.id = String(row.id);
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
    const rows = () => Array.from(el.querySelectorAll<HTMLElement>('.row'));
    return {
        root,
        loaded,
        rows,
        ids: () => rows().map(r => r.dataset.id).join(','),
        async scrollTo(px: number) { el.scrollTop = px; el.dispatchEvent(new Event('scroll')); await settle(); },
    };
}

describe('Virtualization with the same object more than once', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('every occurrence gets its own row', async () => {
        const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
        const h = setup([a, b, a, c, a]);
        await h.loaded;
        await settle();
        expect(h.ids()).toBe('a,b,a,c,a');
        expect(new Set(h.rows()).size).toBe(5);
        await h.root.dispose();
    });

    test('scrolling away and back keeps each occurrence on its own cached row', async () => {
        const shared = { id: 'shared' };
        const data = Array.from({ length: 200 }, (_, i) => (i === 0 || i === 150 ? shared : { id: String(i) }));
        const h = setup(data);
        await h.loaded;
        await settle();
        const topNode = h.rows()[0];
        expect(topNode.dataset.id).toBe('shared');

        await h.scrollTo(150 * H);
        const bottomNode = h.rows().find(r => r.dataset.id === 'shared')!;
        expect(bottomNode).toBeDefined();
        expect(bottomNode).not.toBe(topNode);

        await h.scrollTo(0);
        expect(h.rows()[0]).toBe(topNode);
        expect(h.rows().filter(r => r.dataset.id === 'shared')).toHaveLength(1);
        await h.root.dispose();
    });
});
