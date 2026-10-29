import { Component, ComponentBase, Virtualization } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

async function waitFor(check: () => boolean, ms = 2000) {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error('waitFor timed out');
        await new Promise(r => setTimeout(r, 5));
    }
}

interface Row { id: number }

async function disposedList() {
    let requests = 0;
    const virt = new Virtualization<Row>({
        itemHeight: 20,
        autoRefresh: false,
        dataRequest: async () => { requests++; return { items: [{ id: 1 }], totalCount: 1, hasMore: false }; },
        itemTemplate: () => new Component('div', { initializeComponent: (s: ComponentBase) => { s.class.add('row'); } }),
    });
    const el = virt.element as HTMLElement;
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 100 });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(virt);
    await settle();
    void root.dispose();
    await waitFor(() => virt.isDisposed);
    return { virt, requests: () => requests };
}

describe('Virtualization methods after the list is disposed', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('setData does nothing', async () => {
        const h = await disposedList();
        expect(() => h.virt.setData([{ id: 2 }])).not.toThrow();
    });

    test('refresh resolves without a request', async () => {
        const h = await disposedList();
        const before = h.requests();
        await expect(h.virt.refresh()).resolves.toBeUndefined();
        expect(h.requests()).toBe(before);
    });

    test('updateHeights, scrollToIndex and getState do not throw', async () => {
        const h = await disposedList();
        expect(() => h.virt.updateHeights()).not.toThrow();
        expect(() => h.virt.scrollToIndex(0)).not.toThrow();
        expect(() => h.virt.getState()).not.toThrow();
    });
});
