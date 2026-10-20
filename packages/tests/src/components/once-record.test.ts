/**
 * @jest-environment jsdom
 */
import { Component, errorHandler } from '@motifx/core';

function mount(...children: any[]) {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    for (const c of children) root.controls.add(c);
    return root;
}

const click = (el: any) => (el as HTMLElement).click();

afterEach(() => { document.body.innerHTML = ''; });

describe('a :once listener runs one time whichever way the event arrives, then it is gone', () => {
    test('a custom :once handler fired with trigger runs once and hasEvent turns false', async () => {
        const log: string[] = [];
        const c = new Component('div');
        const root = mount(c);
        await c.motif.on('save:once' as any, () => log.push('save'), false);
        expect(c.motif.options.hasEvent('save:once')).toBe(true);
        await c.motif.trigger('save:once', { id: 1 });
        await c.motif.trigger('save:once', { id: 2 });
        await c.motif.trigger('save:once', { id: 3 });
        expect(log).toEqual(['save']);
        expect(c.motif.options.hasEvent('save:once')).toBe(false);
        root.dispose();
    });

    test('a DOM :once handler runs once on click, is not reachable by trigger afterwards and hasEvent turns false', async () => {
        const log: string[] = [];
        const c = new Component('button');
        const root = mount(c);
        await c.motif.on('click:once', () => log.push('click'));
        click(c.element);
        click(c.element);
        expect(log).toEqual(['click']);
        await c.motif.trigger('click:once', {});
        expect(log).toEqual(['click']);
        expect(c.motif.options.hasEvent('click:once')).toBe(false);
        root.dispose();
    });

    test('a DOM :once handler consumed by trigger does not run on a later click', async () => {
        const log: string[] = [];
        const c = new Component('button');
        const root = mount(c);
        await c.motif.on('click:once', () => log.push('click'));
        await c.motif.trigger('click:once', {});
        click(c.element);
        expect(log).toEqual(['click']);
        expect(c.motif.options.hasEvent('click:once')).toBe(false);
        root.dispose();
    });

    test('once combined with capture is removed as well', async () => {
        const log: string[] = [];
        const outer = new Component('div');
        const inner = new Component('span');
        outer.controls.add(inner);
        const root = mount(outer);
        await outer.motif.on('click:once:capture' as any, () => log.push('capture'));
        click(inner.element);
        click(inner.element);
        expect(log).toEqual(['capture']);
        expect(outer.motif.options.hasEvent('click:once:capture')).toBe(false);
        root.dispose();
    });

    test('a throwing :once handler is reported once and still removed', async () => {
        const reported: any[] = [];
        const unbind = errorHandler.addListener(e => reported.push(e));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const c = new Component('button');
        const root = mount(c);
        await c.motif.on('click:once', () => { throw new Error('once boom'); });
        click(c.element);
        click(c.element);
        await c.motif.trigger('click:once', {});
        expect(reported.filter(e => e?.code === 'MJX123').length).toBe(1);
        expect(c.motif.options.hasEvent('click:once')).toBe(false);
        unbind();
        spy.mockRestore();
        root.dispose();
    });

    test('other listeners of the same event stay: two :once handlers run once each, a plain one keeps running', async () => {
        const log: string[] = [];
        const c = new Component('button');
        const root = mount(c);
        await c.motif.on('click:once', () => log.push('a'));
        await c.motif.on('click:once', () => log.push('b'));
        await c.motif.on('click', () => log.push('plain'));
        click(c.element);
        click(c.element);
        expect(log).toEqual(['a', 'b', 'plain', 'plain']);
        expect(c.motif.options.hasEvent('click:once')).toBe(false);
        expect(c.motif.options.hasEvent('click')).toBe(true);
        root.dispose();
    });

    test('off before the first run still cancels a :once handler', async () => {
        const log: string[] = [];
        const c = new Component('button');
        const root = mount(c);
        const fn = () => log.push('never');
        await c.motif.on('click:once', fn);
        await c.motif.off('click:once', fn);
        click(c.element);
        await c.motif.trigger('click:once', {});
        expect(log).toEqual([]);
        expect(c.motif.options.hasEvent('click:once')).toBe(false);
        root.dispose();
    });
});
