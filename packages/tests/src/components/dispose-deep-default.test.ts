/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, IDisposeOptions } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async () => { await tick(); await tick(); };

function host() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = new Component(el);
    app.build();
    return { el, app };
}

class InvoiceRow extends Component<HTMLLIElement> {
    invoice = { no: 'INV-42', total: 120 };
    constructor() { super('li', {}); }
}

class DraftRow extends InvoiceRow {
    override async disposeAsync(options?: IDisposeOptions): Promise<void> {
        await super.disposeAsync(options);
    }
}

function invoiceList(Row: new () => InvoiceRow = InvoiceRow) {
    const list = new Component('ul', {});
    const row = new Row();
    const badge = new Component('span', {});
    row.controls.add(badge);
    list.controls.add(row);
    return { list, row, badge };
}

const released = (c: ComponentBase) => c.element == null && c.props === undefined;

describe('dispose options: a missing deep counts as deep: true', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('dispose({ skipLeaveTransition: true }) releases the descendants like dispose()', async () => {
        const { el, app } = host();
        const t = invoiceList();
        app.controls.add(t.list);
        await settle();
        await t.list.dispose({ skipLeaveTransition: true });
        expect(el.childNodes.length).toBe(0);
        for (const c of [t.list, t.row, t.badge]) {
            expect(c.isDisposed).toBe(true);
            expect(released(c)).toBe(true);
        }
        expect(t.row.invoice).toBeUndefined();
    });

    test('dispose({}) releases the descendants', async () => {
        const { app } = host();
        const t = invoiceList();
        app.controls.add(t.list);
        await settle();
        await t.list.dispose({});
        expect(released(t.row)).toBe(true);
        expect(released(t.badge)).toBe(true);
        expect(t.row.invoice).toBeUndefined();
    });

    test('a descendant with its own disposeAsync is released too', async () => {
        const { app } = host();
        const t = invoiceList(DraftRow);
        app.controls.add(t.list);
        await settle();
        await t.list.dispose({ skipLeaveTransition: true });
        expect(released(t.row)).toBe(true);
        expect(released(t.badge)).toBe(true);
        expect(t.row.invoice).toBeUndefined();
    });

    test('disposeAsync({}) releases the component and its descendants', async () => {
        const { app } = host();
        const t = invoiceList();
        app.controls.add(t.list);
        await settle();
        await t.list.disposeAsync({});
        for (const c of [t.list, t.row, t.badge]) {
            expect(c.isDisposed).toBe(true);
            expect(released(c)).toBe(true);
        }
    });

    test('deep: false still keeps the fields', async () => {
        const { app } = host();
        const a = invoiceList();
        const b = invoiceList();
        app.controls.add(a.list, b.list);
        await settle();
        await a.list.dispose({ deep: false });
        await b.list.disposeAsync({ deep: false });
        expect(released(a.list)).toBe(true);
        expect(released(a.row)).toBe(false);
        expect(released(a.badge)).toBe(false);
        expect(a.row.invoice).toEqual({ no: 'INV-42', total: 120 });
        expect(released(b.list)).toBe(false);
        expect(released(b.row)).toBe(false);
        expect(b.row.invoice).toEqual({ no: 'INV-42', total: 120 });
        for (const c of [a.list, a.row, a.badge, b.list, b.row, b.badge]) expect(c.isDisposed).toBe(true);
    });
});
