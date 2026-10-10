import { Component, errorHandler } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function mount(host: HTMLElement = document.createElement('section'), attach = true) {
    if (attach) document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    return root;
}

function tree() {
    const root = mount();
    const outer: any = new Component('div');
    root.controls.add(outer);
    const inner: any = new Component('button');
    outer.controls.add(inner);
    return { root, outer, inner };
}

const click = (el: any) => (el as HTMLElement).click();

afterEach(() => { document.body.innerHTML = ''; });

describe('events of components inside a tree', () => {
    test('the handler gets the sender, the event, its own element as currentTarget and the real target', () => {
        const seen: any[] = [];
        const { root, outer, inner } = tree();
        const span: any = new Component('span');
        inner.controls.add(span);
        outer.motif.on('click', (s: any, e: any) => { seen.push(s === outer, e.currentTarget === outer.element, e.target === span.element, e.eventPhase); });
        inner.motif.on('click', (s: any, e: any) => { seen.push(s === inner, e.currentTarget === inner.element, e.eventPhase); });
        click(span.element);
        expect(seen).toEqual([true, true, Event.BUBBLING_PHASE, true, true, true, Event.BUBBLING_PHASE]);
        seen.length = 0;
        click(inner.element);
        expect(seen).toEqual([true, true, Event.AT_TARGET, true, true, false, Event.BUBBLING_PHASE]);
        root.dispose();
    });

    test('currentTarget is back to normal after the dispatch', () => {
        let kept: any = null;
        const { root, inner } = tree();
        inner.motif.on('click', (s: any, e: any) => { kept = e; });
        click(inner.element);
        expect(kept.currentTarget).toBeNull();
        root.dispose();
    });

    test('inner handlers run before outer ones and handlers of one element in order', () => {
        const log: string[] = [];
        const { root, outer, inner } = tree();
        outer.motif.on('click', () => log.push('outer'));
        inner.motif.on('click', () => log.push('inner-1'));
        inner.motif.on('click', () => log.push('inner-2'));
        root.motif.on('click', () => log.push('root'));
        click(inner.element);
        expect(log).toEqual(['inner-1', 'inner-2', 'outer', 'root']);
        root.dispose();
    });

    test('stopPropagation, :stop and { cancel: true } keep outer handlers and document listeners from running', () => {
        const log: string[] = [];
        const docLog: string[] = [];
        const onDoc = () => docLog.push('doc');
        document.addEventListener('click', onDoc);
        const { root, outer, inner } = tree();
        outer.motif.on('click', () => log.push('outer'));
        const stopper = (s: any, e: any) => { log.push('inner'); e.stopPropagation(); };
        inner.motif.on('click', stopper);
        click(inner.element);
        expect(log).toEqual(['inner']);
        expect(docLog).toEqual([]);

        inner.motif.off('click', stopper);
        inner.motif.on('click:stop', () => log.push('stop-mod'));
        click(inner.element);
        expect(log).toEqual(['inner', 'stop-mod']);
        expect(docLog).toEqual([]);

        const third: any = new Component('i');
        outer.controls.add(third);
        third.motif.on('click', () => ({ cancel: true }));
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        third.element.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
        expect(log).toEqual(['inner', 'stop-mod']);
        expect(docLog).toEqual([]);

        click(outer.element);
        expect(log).toEqual(['inner', 'stop-mod', 'outer']);
        expect(docLog).toEqual(['doc']);
        document.removeEventListener('click', onDoc);
        root.dispose();
    });

    test('stopImmediatePropagation stops the rest of the handlers', () => {
        const log: string[] = [];
        const { root, outer, inner } = tree();
        outer.motif.on('click', () => log.push('outer'));
        inner.motif.on('click', (s: any, e: any) => { log.push('first'); e.stopImmediatePropagation(); });
        inner.motif.on('click', () => log.push('second'));
        click(inner.element);
        expect(log).toEqual(['first']);
        root.dispose();
    });

    test('a document listener added before the components runs after them', () => {
        const log: string[] = [];
        const onDoc = () => log.push('doc');
        document.addEventListener('click', onDoc);
        const { root, inner } = tree();
        inner.motif.on('click', () => log.push('inner'));
        click(inner.element);
        expect(log).toEqual(['inner', 'doc']);
        document.removeEventListener('click', onDoc);
        root.dispose();
    });

    test('an element moved out of its root by hand still gets its events', () => {
        const log: string[] = [];
        const { root, outer, inner } = tree();
        inner.motif.on('click', () => log.push('inner'));
        outer.motif.on('click', () => log.push('outer'));
        const surface = document.createElement('div');
        document.body.appendChild(surface);
        surface.appendChild(outer.element);
        click(inner.element);
        expect(log).toEqual(['inner', 'outer']);
        root.dispose();
    });

    test('a tree that is not in the document still gets its events', () => {
        const log: string[] = [];
        const root = mount(document.createElement('section'), false);
        const outer: any = new Component('div');
        root.controls.add(outer);
        const inner: any = new Component('button');
        outer.controls.add(inner);
        inner.motif.on('click', () => log.push('inner'));
        outer.motif.on('click', () => log.push('outer'));
        click(inner.element);
        expect(log).toEqual(['inner', 'outer']);
        root.dispose();
    });

    test('a non-bubbling event reaches only the handlers of its target, once', () => {
        const log: string[] = [];
        const { root, outer, inner } = tree();
        inner.motif.on('click', () => log.push('inner'));
        outer.motif.on('click', () => log.push('outer'));
        inner.element.dispatchEvent(new Event('click'));
        expect(log).toEqual(['inner']);
        outer.element.dispatchEvent(new MouseEvent('click'));
        expect(log).toEqual(['inner', 'outer']);
        inner.element.dispatchEvent(new Event('input'));
        expect(log).toEqual(['inner', 'outer']);
        root.dispose();
    });

    test('a root inside another root runs each handler once', () => {
        const log: string[] = [];
        const { root, outer } = tree();
        const host = document.createElement('div');
        outer.element.appendChild(host);
        const second = mount(host, false);
        const leaf: any = new Component('b');
        second.controls.add(leaf);
        leaf.motif.on('click', () => log.push('leaf'));
        outer.motif.on('click', () => log.push('outer'));
        click(leaf.element);
        expect(log).toEqual(['leaf', 'outer']);
        second.dispose();
        root.dispose();
    });

    test('off and dispose stop the handlers', async () => {
        const log: string[] = [];
        const { root, outer, inner } = tree();
        const f = () => log.push('f');
        inner.motif.on('click', f);
        outer.motif.on('click', () => log.push('outer'));
        inner.motif.off('click', f);
        click(inner.element);
        expect(log).toEqual(['outer']);
        inner.motif.on('click', f);
        const el = inner.element;
        await inner.dispose();
        click(el);
        expect(log).toEqual(['outer']);
        root.dispose();
    });

    test('a handler added in onBuilt and one on a component moved to another root keep working', async () => {
        const log: string[] = [];
        const { root, outer } = tree();
        const late: any = new Component('em', { onBuilt: (s: any) => s.motif.on('click', () => log.push('built')) } as any);
        outer.controls.add(late);
        click(late.element);
        expect(log).toEqual(['built']);
        const other = mount();
        await outer.controls.detach(late);
        other.controls.add(late);
        click(late.element);
        expect(log).toEqual(['built', 'built']);
        other.dispose();
        root.dispose();
    });

    test('self, once, capture and non-delegated events behave as before', () => {
        const log: string[] = [];
        const { root, outer, inner } = tree();
        outer.motif.on('click:self', () => log.push('self'));
        outer.motif.on('click:capture', () => log.push('capture'));
        inner.motif.on('click:once', () => log.push('once'));
        inner.motif.on('click', () => log.push('inner'));
        inner.motif.on('mouseenter', () => log.push('enter'));
        inner.motif.on('focus', () => log.push('focus'));
        click(inner.element);
        expect(log).toEqual(['capture', 'once', 'inner']);
        log.length = 0;
        click(inner.element);
        click(outer.element);
        expect(log).toEqual(['capture', 'inner', 'capture', 'self']);
        log.length = 0;
        inner.element.dispatchEvent(new MouseEvent('mouseenter'));
        inner.element.focus();
        expect(log).toEqual(['enter', 'focus']);
        root.dispose();
    });

    test('the same handler on two components runs for each and errors are reported', () => {
        const reported: any[] = [];
        const unbind = errorHandler.addListener(e => reported.push(e));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const seen: any[] = [];
        const { root, outer, inner } = tree();
        const f = (s: any, e: any) => seen.push(s);
        inner.motif.on('click', () => { throw new Error('boom'); });
        inner.motif.on('click', f);
        outer.motif.on('click', f);
        click(inner.element);
        expect(seen).toEqual([inner, outer]);
        expect(reported.some(e => e?.code === 'MJX123')).toBe(true);
        unbind();
        spy.mockRestore();
        root.dispose();
    });

    test('trigger and hasEvent work for handlers added inside a tree', async () => {
        const seen: any[] = [];
        const { root, inner } = tree();
        inner.motif.on('click', (s: any, e: any) => seen.push(e.tag));
        expect(inner.motif.options.hasEvent('click')).toBe(true);
        await inner.motif.trigger('click', { tag: 't' });
        expect(seen).toEqual(['t']);
        root.dispose();
    });

    test('input, change, keydown and submit reach their handlers', async () => {
        const log: string[] = [];
        const root = mount();
        const form: any = new Component('form');
        root.controls.add(form);
        const field: any = new Component('input');
        form.controls.add(field);
        field.motif.on('input', () => log.push('input'));
        field.motif.on('change', () => log.push('change'));
        field.motif.on('keydown', (s: any, e: any) => log.push('key:' + e.key));
        form.motif.on('submit', (s: any, e: any) => { e.preventDefault(); log.push('submit'); });
        field.element.dispatchEvent(new Event('input', { bubbles: true }));
        field.element.dispatchEvent(new Event('change', { bubbles: true }));
        field.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        form.element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect(log).toEqual(['input', 'change', 'key:a', 'submit']);
        await settle();
        root.dispose();
    });
});
