import { Component, ComponentBase, Virtualization } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

interface Row { id: number; title: string }
const H = 36;
const makeRows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: 'row ' + (i + 1) }));

function fakeLayout(el: HTMLElement, clientHeight = 360) {
    let top = 0;
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight });
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
}

function makeVirt(all: Row[], options: { itemHeight?: any; filter?: (rows: Row[]) => Row[]; totalCount?: (n: number) => number } = {}) {
    const pages: number[] = [];
    const virt = new Virtualization<Row>({
        itemHeight: options.itemHeight ?? H,
        pageSize: 20,
        overscan: 2,
        filter: options.filter,
        dataRequest: async ({ page, pageSize }) => {
            pages.push(page);
            const start = page * pageSize;
            return { items: all.slice(start, start + pageSize), totalCount: options.totalCount ? options.totalCount(all.length) : all.length, hasMore: start + pageSize < all.length };
        },
        itemTemplate: (row) => new Component('div', { initializeComponent: (s: ComponentBase) => { s.class.add('row'); (s.element as HTMLElement).textContent = row.title; } }),
    });
    fakeLayout(virt.element as HTMLElement);
    return { virt, pages };
}

const spacers = (virt: Virtualization<any>) => {
    const el = virt.element as HTMLElement;
    const px = (cls: string) => parseFloat((el.querySelector(cls) as HTMLElement).style.height) || 0;
    return { top: px('.motif-virtualization-top-spacer'), bottom: px('.motif-virtualization-bottom-spacer') };
};

const rowsInDom = (virt: Virtualization<any>) => (virt.element as HTMLElement).querySelectorAll('.row').length;

describe('Virtualization sizes its scroll area from totalCount while more pages exist', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    const mount = async (virt: Virtualization<any>) => {
        const root = new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(virt); } });
        root.build();
        container.appendChild(root.element as Node);
        await wait(20);
    };

    test('the scroll area covers every item reported by totalCount', async () => {
        const { virt } = makeVirt(makeRows(1000));
        await mount(virt);
        const { top, bottom } = spacers(virt);
        expect(top + rowsInDom(virt) * H + bottom).toBe(1000 * H);
    });

    test('scrolling into the part not loaded yet loads the pages up to it', async () => {
        const { virt, pages } = makeVirt(makeRows(1000));
        await mount(virt);
        const el = virt.element as HTMLElement;
        el.scrollTop = 150 * H;
        el.dispatchEvent(new Event('scroll'));
        await wait(200);
        expect(Math.max(...pages)).toBeGreaterThanOrEqual(7);
        const titles = Array.from(el.querySelectorAll('.row')).map(r => r.textContent);
        expect(titles).toContain('row 151');
        const { top, bottom } = spacers(virt);
        expect(top + rowsInDom(virt) * H + bottom).toBe(1000 * H);
    });

    test('when hasMore is false the loaded items decide the size', async () => {
        const { virt } = makeVirt(makeRows(30), { totalCount: () => 500 });
        await mount(virt);
        const el = virt.element as HTMLElement;
        el.scrollTop = 20 * H;
        el.dispatchEvent(new Event('scroll'));
        await wait(60);
        const { top, bottom } = spacers(virt);
        expect(top + rowsInDom(virt) * H + bottom).toBe(30 * H);
    });

    test('a totalCount smaller than the loaded items does not shrink the area', async () => {
        const { virt } = makeVirt(makeRows(200), { totalCount: () => 0 });
        await mount(virt);
        const { top, bottom } = spacers(virt);
        expect(top + rowsInDom(virt) * H + bottom).toBe(20 * H);
    });

    test('with variable heights the part not loaded yet is estimated from the loaded rows', async () => {
        const { virt } = makeVirt(makeRows(100), { itemHeight: (row: Row) => (row.id % 2 ? 30 : 50) });
        await mount(virt);
        const { top, bottom } = spacers(virt);
        const loaded = 20;
        const loadedHeight = 10 * 30 + 10 * 50;
        const shown = Array.from((virt.element as HTMLElement).querySelectorAll('.row')).length;
        expect(shown).toBeGreaterThan(0);
        expect(Math.round(top + bottom)).toBeGreaterThan(loadedHeight);
        expect(Math.round(top + bottom + 0)).toBeLessThanOrEqual(Math.round(loadedHeight / loaded * 100));
    });
});
