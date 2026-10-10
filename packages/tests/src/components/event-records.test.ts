import { Component, errorHandler } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

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

describe('component DOM events', () => {
    test('handlers of one name run in the order they were added and off removes the first match', () => {
        const log: string[] = [];
        const a = () => log.push('a');
        const b = () => log.push('b');
        const c = new Component('button');
        c.motif.on('click', a);
        c.motif.on('click', b);
        c.motif.on('click', a);
        const root = mount(c);
        click(c.element);
        expect(log).toEqual(['a', 'b', 'a']);
        c.motif.off('click', a);
        log.length = 0;
        click(c.element);
        expect(log).toEqual(['b', 'a']);
        c.motif.off('click', a);
        c.motif.off('click', b);
        log.length = 0;
        click(c.element);
        expect(log).toEqual([]);
        root.dispose();
    });

    test('a two-argument handler gets the sender and the event, a one-argument handler the event', () => {
        const seen: any[] = [];
        const c = new Component('button');
        c.motif.on('click', (s: any, e: any) => { seen.push(s, e.type); });
        c.motif.on('click', ((e: any) => { seen.push(e.type); }) as any);
        const root = mount(c);
        click(c.element);
        expect(seen).toEqual([c, 'click', 'click']);
        root.dispose();
    });

    test('on, off and trigger return a promise of the component', async () => {
        const c = new Component('button');
        const f = () => { };
        const on = c.motif.on('click', f);
        expect(on).toBeInstanceOf(Promise);
        expect(await on).toBe(c);
        expect(await c.motif.trigger('click', {})).toBe(c);
        expect(await c.motif.off('click', f)).toBe(c);
        expect(await c.motif.off('nothing' as any, f)).toBe(c);
    });

    test('self, prevent, stop, once, capture and trusted modifiers', () => {
        const log: string[] = [];
        const outer: any = new Component('div');
        const inner: any = new Component('span');
        outer.controls.add(inner);
        outer.motif.on('click:self', () => log.push('self'));
        outer.motif.on('click:capture', () => log.push('capture'));
        inner.motif.on('click', () => log.push('inner'));
        inner.motif.on('click:once', () => log.push('once'));
        inner.motif.on('click:trusted', () => log.push('trusted'));
        const root = mount(outer);
        click(inner.element);
        expect(log).toEqual(['capture', 'inner', 'once']);
        log.length = 0;
        click(inner.element);
        expect(log).toEqual(['capture', 'inner']);
        expect(inner.motif.options.hasEvent('click:once')).toBe(true);
        log.length = 0;
        click(outer.element);
        expect(log).toEqual(['capture', 'self']);

        const parentSeen: string[] = [];
        (outer.element as HTMLElement).addEventListener('click', () => parentSeen.push('parent'));
        inner.motif.on('click:stop:prevent', () => log.push('stop'));
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        (inner.element as HTMLElement).dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
        expect(parentSeen).toEqual([]);
        root.dispose();
    });

    test('a handler returning { cancel: true } prevents and stops the event', () => {
        const parentSeen: string[] = [];
        const outer = new Component('div');
        const inner = new Component('a');
        outer.controls.add(inner);
        inner.motif.on('click', () => ({ cancel: true }));
        inner.motif.on('click', () => false);
        const root = mount(outer);
        (outer.element as HTMLElement).addEventListener('click', () => parentSeen.push('parent'));
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        (inner.element as HTMLElement).dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
        expect(parentSeen).toEqual([]);
        root.dispose();
    });

    test('onClick and click are kept under different names', () => {
        const log: string[] = [];
        const a = () => log.push('a');
        const c: any = new Component('button');
        c.motif.on('onClick', a);
        const root = mount(c);
        expect(c.motif.options.hasEvent('onclick')).toBe(true);
        expect(c.motif.options.hasEvent('click')).toBe(false);
        expect(c.motif.options.hasEvent('onClick')).toBe(false);
        c.motif.off('click', a);
        click(c.element);
        expect(log).toEqual(['a']);
        c.motif.off('ONCLICK', a);
        click(c.element);
        expect(log).toEqual(['a']);
        expect(c.motif.options.hasEvent('onclick')).toBe(false);
        root.dispose();
    });

    test('hasEvent follows on and off', () => {
        const c: any = new Component('button');
        const a = () => { };
        const b = () => { };
        expect(c.motif.options.hasEvent('click')).toBe(false);
        c.motif.on('click', a);
        c.motif.on('click', b);
        c.motif.on('input', a);
        c.motif.off('click', a);
        expect(c.motif.options.hasEvent('click')).toBe(true);
        c.motif.off('click', b);
        expect(c.motif.options.hasEvent('click')).toBe(false);
        expect(c.motif.options.hasEvent('input')).toBe(true);
    });

    test('dispose removes the DOM listeners', async () => {
        const log: string[] = [];
        const c = new Component('button');
        c.motif.on('click', () => log.push('a'));
        c.motif.on('click:capture', () => log.push('b'));
        const root = mount(c);
        const el = c.element as HTMLElement;
        await c.dispose();
        click(el);
        expect(log).toEqual([]);
        root.dispose();
    });

    test('off removes a capture listener', () => {
        const log: string[] = [];
        const f = () => log.push('a');
        const c = new Component('button');
        c.motif.on('click:capture', f);
        const root = mount(c);
        c.motif.off('click:capture', f);
        click(c.element);
        expect(log).toEqual([]);
        root.dispose();
    });

    test('on and off on a disposed component do nothing', async () => {
        const c = new Component('button');
        const root = mount(c);
        await c.dispose();
        await settle();
        expect(await c.motif.on('click', () => { })).toBe(c);
        expect(await c.motif.off('click', () => { })).toBe(c);
        root.dispose();
    });

    test('a throwing handler does not stop the next one and is reported', () => {
        const reported: any[] = [];
        const unbind = errorHandler.addListener(e => reported.push(e));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const log: string[] = [];
        const c = new Component('button');
        c.motif.on('click', () => { throw new Error('boom'); });
        c.motif.on('click', () => log.push('next'));
        const root = mount(c);
        click(c.element);
        expect(log).toEqual(['next']);
        expect(reported.some(e => e?.code === 'MJX123')).toBe(true);
        unbind();
        spy.mockRestore();
        root.dispose();
    });
});

describe('component trigger', () => {
    test('a non-DOM handler runs only on trigger and gets the given argument', async () => {
        const seen: any[] = [];
        const c = new Component('div');
        c.motif.on('picked' as any, (s: any, e: any) => { seen.push(s, e.value); }, false);
        const root = mount(c);
        (c.element as HTMLElement).dispatchEvent(new Event('picked', { bubbles: true }));
        expect(seen).toEqual([]);
        await c.motif.trigger('picked', { value: 7 });
        expect(seen).toEqual([c, 7]);
        await c.motif.trigger('PICKED', { value: 8 });
        expect(seen).toEqual([c, 7, c, 8]);
        root.dispose();
    });

    test('trigger also runs DOM handlers of that name', async () => {
        const seen: any[] = [];
        const c = new Component('div');
        c.motif.on('click', (s: any, e: any) => { seen.push(e.tag); });
        await c.motif.trigger('click', { tag: 't' });
        expect(seen).toEqual(['t']);
    });

    test('a handler removed while triggering is skipped and one added is called', async () => {
        const log: string[] = [];
        const c = new Component('div');
        const b = () => log.push('b');
        const late = () => log.push('late');
        c.motif.on('go' as any, () => { log.push('a'); c.motif.off('go' as any, b); c.motif.on('go' as any, late, false); }, false);
        c.motif.on('go' as any, b, false);
        await c.motif.trigger('go', {});
        expect(log).toEqual(['a', 'late']);
    });

    test('a handler removing itself while triggering lets the rest run', async () => {
        const log: string[] = [];
        const c = new Component('div');
        const a = () => { log.push('a'); c.motif.off('go' as any, a); };
        c.motif.on('go' as any, a, false);
        c.motif.on('go' as any, () => log.push('b'), false);
        c.motif.on('go' as any, () => log.push('c'), false);
        await c.motif.trigger('go', {});
        expect(log).toEqual(['a', 'b', 'c']);
        log.length = 0;
        await c.motif.trigger('go', {});
        expect(log).toEqual(['b', 'c']);
    });

    test('the other handlers still run when one disposes the component while triggering', async () => {
        const log: string[] = [];
        const c = new Component('div');
        const root = mount(c);
        c.motif.on('go' as any, () => { log.push('a'); c.dispose(); }, false);
        c.motif.on('go' as any, () => log.push('b'), false);
        await c.motif.trigger('go', {});
        expect(log).toEqual(['a', 'b']);
        await settle();
        root.dispose();
    });

    test('a throwing handler is swallowed and the next one runs', async () => {
        const reported: any[] = [];
        const unbind = errorHandler.addListener(e => reported.push(e));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const log: string[] = [];
        const c = new Component('div');
        c.motif.on('go' as any, () => { throw new Error('boom'); }, false);
        c.motif.on('go' as any, () => log.push('b'), false);
        await c.motif.trigger('go', {});
        expect(log).toEqual(['b']);
        expect(reported.some(e => e?.code === 'MJX123')).toBe(true);
        unbind();
        spy.mockRestore();
    });

    test('controladded and controlremoved reach their handlers', async () => {
        const log: string[] = [];
        const host = new Component('div');
        host.motif.on('controladded' as any, (s: any, e: any) => log.push('added:' + e.control.element.nodeName), false);
        host.motif.on('controlremoved' as any, (s: any, e: any) => log.push('removed:' + e.control.element.nodeName), false);
        const root = mount(host);
        const child = new Component('i');
        host.controls.add(child);
        await host.controls.detach(child);
        expect(log).toEqual(['added:I', 'removed:I']);
        root.dispose();
    });
});
