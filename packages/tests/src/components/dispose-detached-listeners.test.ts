/**
 * @jest-environment jsdom
 */
import { Component } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async () => { await tick(); await tick(); };

const errors: string[] = [];
const origError = console.error;
beforeEach(() => { errors.length = 0; console.error = (...a: any[]) => { errors.push(a.map(String).join(' ')); }; });
afterEach(() => { console.error = origError; document.body.innerHTML = ''; });

function host() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = new Component(el);
    app.build();
    return { el, app };
}

function row(log: string[]) {
    const root = new Component('div');
    const link = new Component('a');
    const label = new Component('span', { onclick: () => { log.push('label'); } } as any);
    const icon = new Component('i');
    link.motif.on('click', () => { log.push('link'); });
    link.motif.on('click:capture', () => { log.push('link-capture'); });
    icon.motif.on('click:self', () => { log.push('icon-self'); });
    icon.motif.on('mousedown', (_s: any, _e: any) => { log.push('icon-down'); });
    link.controls.add(label, icon);
    root.controls.add(link);
    return { root, link, label, icon };
}

describe('listeners inside a disposed subtree', () => {
    test.each(['dispose', 'disposeAsync'] as const)('%s: handlers stay silent when the detached elements get events', async (how) => {
        const log: string[] = [];
        const { app } = host();
        const t = row(log);
        app.controls.add(t.root);
        await settle();
        (t.icon.element as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        (t.icon.element as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        expect(log).toEqual(['link-capture', 'icon-self', 'link', 'icon-down']);
        log.length = 0;
        const linkEl = t.link.element as HTMLElement, labelEl = t.label.element as HTMLElement, iconEl = t.icon.element as HTMLElement;
        await t.root[how]();
        for (const el of [linkEl, labelEl, iconEl]) {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        }
        expect(log).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('handlers stay silent after the detached elements are put back into the document', async () => {
        const log: string[] = [];
        const { app } = host();
        const t = row(log);
        app.controls.add(t.root);
        await settle();
        const linkEl = t.link.element as HTMLElement, iconEl = t.icon.element as HTMLElement;
        await t.root.dispose();
        document.body.appendChild(linkEl);
        iconEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        linkEl.click();
        expect(log).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a child whose element still sits in the document has its listeners removed from that element', async () => {
        const log: string[] = [];
        const { app } = host();
        const t = row(log);
        app.controls.add(t.root);
        await settle();
        const elsewhere = document.createElement('section');
        document.body.appendChild(elsewhere);
        const linkEl = t.link.element as HTMLElement;
        elsewhere.appendChild(linkEl);
        const removed: string[] = [];
        const orig = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, l: any, o?: any) {
            if (this === linkEl) removed.push(type);
            return orig.call(this, type, l, o);
        };
        try {
            await t.root.dispose();
        } finally {
            EventTarget.prototype.removeEventListener = orig;
        }

        expect(removed.sort()).toEqual(['click', 'click']);
        linkEl.click();
        expect(log).toEqual([]);
    });

    test('a handler that throws after dispose is never reached, so nothing is reported', async () => {
        const { app } = host();
        const root = new Component('div');
        const child = new Component('b');
        let calls = 0;
        child.motif.on('click', () => { calls++; throw new Error('boom'); });
        root.controls.add(child);
        app.controls.add(root);
        await settle();
        const el = child.element as HTMLElement;
        await root.dispose();
        el.dispatchEvent(new MouseEvent('click'));
        expect(calls).toBe(0);
        expect(errors).toEqual([]);
    });

    test('off() on a disposed child does nothing and does not throw', async () => {
        const { app } = host();
        const root = new Component('div');
        const child = new Component('b');
        const f = () => { };
        child.motif.on('click', f);
        root.controls.add(child);
        app.controls.add(root);
        await settle();
        await root.dispose();
        expect(() => child.motif.off('click', f)).not.toThrow();
        expect(errors).toEqual([]);
    });

    test('listeners added in onDisposing of a child are removed with the others', async () => {
        const log: string[] = [];
        const { app } = host();
        const root = new Component('div');
        const child = new Component('b', { onDisposing: () => { child.motif.on('click', () => { log.push('late'); }); } } as any);
        child.motif.on('click', () => { log.push('early'); });
        root.controls.add(child);
        app.controls.add(root);
        await settle();
        const el = child.element as HTMLElement;
        await root.dispose();
        el.dispatchEvent(new MouseEvent('click'));
        expect(log).toEqual([]);
    });
});
