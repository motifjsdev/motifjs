/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, Virtualization } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

interface Row { id: number; tall: boolean }

const heightOf = (r: Row) => r.tall ? 60 : 20;

function makeRows(n: number): Row[] {
    return Array.from({ length: n }, (_, i) => ({ id: i + 1, tall: i % 3 === 0 }));
}

function offsetsOf(rows: Row[]): number[] {
    const o = [0];
    for (const r of rows) o.push(o[o.length - 1] + heightOf(r));
    return o;
}

class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    targets: Element[] = [];
    disconnected = false;
    constructor(public cb: () => void) { FakeResizeObserver.instances.push(this); }
    observe(el: Element) { this.targets.push(el); }
    disconnect() { this.disconnected = true; this.targets = []; }
    fire() { if (!this.disconnected) this.cb(); }
}

function setup(container: HTMLElement, data: Row[], opts: { itemHeight?: any; filter?: (xs: Row[]) => Row[]; overscan?: number; clientHeight?: number } = {}) {
    const box = { clientHeight: opts.clientHeight ?? 200, top: 0 };
    const virt = new Virtualization<Row>({
        itemHeight: opts.itemHeight ?? ((r: Row) => heightOf(r)),
        overscan: opts.overscan ?? 0,
        filter: opts.filter,
        dataRequest: async () => ({ items: data, totalCount: data.length, hasMore: false }),
        itemTemplate: (row) => new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                s.class.add('row');
                (s.element as HTMLElement).dataset.id = String(row.id);
            }
        }),
    });
    const el = virt.element as HTMLElement;
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => box.clientHeight });
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => box.top, set: (v: number) => { box.top = v; } });
    const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(virt); } });
    root.build();
    container.appendChild(root.element as Node);
    const rows = () => Array.from(el.querySelectorAll<HTMLElement>('.row'));
    return {
        virt, root, box, el,
        ids: () => rows().map(r => Number(r.dataset.id)),
        spacers: () => ({
            top: parseFloat(el.querySelector<HTMLElement>('.motif-virtualization-top-spacer')!.style.height),
            bottom: parseFloat(el.querySelector<HTMLElement>('.motif-virtualization-bottom-spacer')!.style.height),
        }),
        async scrollTo(px: number) {
            el.scrollTop = px;
            el.dispatchEvent(new Event('scroll'));
            await wait(5);
        },
    };
}

describe('Virtualization with variable item heights', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => { cleanupTestContainer(container); });

    test('first render covers the viewport and spacers add up to the total height', async () => {
        const data = makeRows(300);
        const offs = offsetsOf(data);
        const h = setup(container, data);
        await wait(10);

        const ids = h.ids();
        const expectedCount = offs.findIndex(o => o >= 200);
        expect(ids[0]).toBe(1);
        expect(ids.length).toBe(expectedCount);
        const rendered = ids.reduce((sum, id) => sum + heightOf(data[id - 1]), 0);
        const sp = h.spacers();
        expect(sp.top).toBe(0);
        expect(sp.top + rendered + sp.bottom).toBe(offs[300]);
        h.root.dispose();
    });

    test('scrolling renders the rows at that offset with an exact top spacer', async () => {
        const data = makeRows(300);
        const offs = offsetsOf(data);
        const h = setup(container, data, { overscan: 2 });
        await wait(10);

        await h.scrollTo(offs[120] + 5);
        const ids = h.ids();
        expect(ids[0]).toBe(120 - 2 + 1);
        expect(h.spacers().top).toBe(offs[118]);
        const rendered = ids.reduce((sum, id) => sum + heightOf(data[id - 1]), 0);
        expect(h.spacers().top + rendered + h.spacers().bottom).toBe(offs[300]);
        const lastShown = ids[ids.length - 1] - 1;
        expect(offs[lastShown + 1]).toBeGreaterThanOrEqual(offs[120] + 5 + 200);
        h.root.dispose();
    });

    test('end of the list: bottom spacer is zero and the last row is shown', async () => {
        const data = makeRows(300);
        const offs = offsetsOf(data);
        const h = setup(container, data, { overscan: 1 });
        await wait(10);

        await h.scrollTo(offs[300] - 200);
        const ids = h.ids();
        expect(ids[ids.length - 1]).toBe(300);
        expect(h.spacers().bottom).toBe(0);
        h.root.dispose();
    });

    test('scrollToIndex uses the item offset', async () => {
        const data = makeRows(300);
        const offs = offsetsOf(data);
        const h = setup(container, data);
        await wait(10);

        h.virt.scrollToIndex(77);
        expect(h.box.top).toBe(offs[77]);
        expect(h.ids()[0]).toBe(78);
        h.root.dispose();
    });

    test('filter is applied before measuring', async () => {
        const data = makeRows(300);
        const filter = (xs: Row[]) => xs.filter(r => r.tall);
        const view = filter(data);
        const h = setup(container, data, { filter });
        await wait(10);

        const ids = h.ids();
        expect(ids.every(id => data[id - 1].tall)).toBe(true);
        expect(h.spacers().top + ids.length * 60 + h.spacers().bottom).toBe(view.length * 60);
        h.root.dispose();
    });

    test('invalid heights count as zero and never loop', async () => {
        const data = makeRows(50);
        const h = setup(container, data, { itemHeight: (r: Row) => r.id % 2 ? NaN : 30 });
        await wait(10);

        const ids = h.ids();
        expect(ids.length).toBeGreaterThan(0);
        expect(h.spacers().top + h.spacers().bottom + ids.filter(id => id % 2 === 0).length * 30).toBe(25 * 30);
        h.root.dispose();
    });
});

describe('Virtualization reacts to viewport size changes', () => {
    let container: HTMLElement;
    const original = (globalThis as any).ResizeObserver;
    beforeEach(() => {
        container = createTestContainer();
        FakeResizeObserver.instances = [];
        (globalThis as any).ResizeObserver = FakeResizeObserver;
    });
    afterEach(() => {
        cleanupTestContainer(container);
        (globalThis as any).ResizeObserver = original;
    });

    test('fixed heights: growing the viewport renders more rows without scrolling', async () => {
        const data = makeRows(500);
        const h = setup(container, data, { itemHeight: 20, overscan: 0 });
        await wait(10);
        expect(h.ids().length).toBe(10);

        h.box.clientHeight = 400;
        FakeResizeObserver.instances.forEach(o => o.fire());
        expect(h.ids().length).toBe(20);
        h.root.dispose();
    });

    test('variable heights: shrinking the viewport renders fewer rows', async () => {
        const data = makeRows(500);
        const h = setup(container, data, { clientHeight: 400 });
        await wait(10);
        const before = h.ids().length;

        h.box.clientHeight = 100;
        FakeResizeObserver.instances.forEach(o => o.fire());
        expect(h.ids().length).toBeLessThan(before);
        h.root.dispose();
    });

    test('unchanged size does not re-render', async () => {
        const data = makeRows(500);
        const h = setup(container, data, { itemHeight: 20 });
        await wait(10);
        const spy = jest.spyOn(h.virt as any, 'renderViewport');
        FakeResizeObserver.instances.forEach(o => o.fire());
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
        h.root.dispose();
    });

    test('a single observer per list, disconnected on dispose', async () => {
        const data = makeRows(500);
        const h = setup(container, data, { itemHeight: 20 });
        await wait(10);
        await h.scrollTo(400);
        await h.scrollTo(800);

        expect(FakeResizeObserver.instances.length).toBe(1);
        expect(FakeResizeObserver.instances[0].targets).toEqual([h.el]);
        await h.root.dispose();
        expect(FakeResizeObserver.instances[0].disconnected).toBe(true);
    });

    test('without ResizeObserver nothing breaks', async () => {
        (globalThis as any).ResizeObserver = undefined;
        const data = makeRows(100);
        const h = setup(container, data, { itemHeight: 20 });
        await wait(10);
        expect(h.ids().length).toBe(10);
        h.root.dispose();
    });
});
