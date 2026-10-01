/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, errorHandler, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function mount(child: ComponentBase) {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    host.controls.add(child);
    return host;
}

function panel(data: { title: string; cls: string; color: string; label: string }) {
    return new Component('div', {
        initializeComponent: (s: ComponentBase) => {
            s.attr.add({ title: () => data.title });
            s.class.add(() => data.cls);
            s.style(() => ({ color: data.color }));
            s.bindings.add('textContent', () => data.label);
        }
    } as any);
}

const el = (c: ComponentBase) => c.element as unknown as HTMLElement;

describe('setState refreshes bindings that read plain data', () => {
    let reported: unknown[] = [];
    let unbind: () => void = () => { };

    beforeEach(() => {
        reported = [];
        unbind = errorHandler.addListener((error: unknown) => { reported.push(error); }) as any;
    });

    afterEach(() => {
        try { unbind(); } catch { }
        document.body.innerHTML = '';
    });

    it('re-reads attribute, class, style and text getters', async () => {
        const data = { title: 'a', cls: 'one', color: 'red', label: 'first' };
        const comp = panel(data);
        mount(comp);
        await tick();
        expect(el(comp).getAttribute('title')).toBe('a');
        expect(el(comp).classList.contains('one')).toBe(true);
        expect(el(comp).style.color).toBe('red');
        expect(el(comp).textContent).toBe('first');

        data.title = 'b';
        data.cls = 'two';
        data.color = 'blue';
        data.label = 'second';
        comp.setState();
        await tick();

        expect(el(comp).getAttribute('title')).toBe('b');
        expect(el(comp).classList.contains('two')).toBe(true);
        expect(el(comp).classList.contains('one')).toBe(false);
        expect(el(comp).style.color).toBe('blue');
        expect(el(comp).textContent).toBe('second');
        expect(reported).toEqual([]);
    });

    it('reaches child components through a parent setState', async () => {
        const data = { title: 'a', cls: 'one', color: 'red', label: 'first' };
        const child = panel(data);
        const parent = new Component('section');
        parent.controls.add(child);
        mount(parent);
        await tick();

        data.title = 'b';
        data.label = 'second';
        parent.setState();
        await tick();

        expect(el(child).getAttribute('title')).toBe('b');
        expect(el(child).textContent).toBe('second');
    });

    it('refreshes with reState as well', async () => {
        const data = { title: 'a', cls: 'one', color: 'red', label: 'first' };
        const comp = panel(data);
        mount(comp);
        await tick();

        data.title = 'c';
        data.cls = 'three';
        comp.reState();
        await tick();

        expect(el(comp).getAttribute('title')).toBe('c');
        expect(el(comp).classList.contains('three')).toBe(true);
    });

    it('keeps one effect per getter after repeated setState calls', async () => {
        const st = reactive({ n: 1 });
        let attrRuns = 0;
        let classRuns = 0;
        let styleRuns = 0;
        const comp = new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                s.attr.add({ 'data-n': () => { attrRuns++; return String(st.n); } });
                s.class.add(() => { classRuns++; return 'n' + st.n; });
                s.style(() => { styleRuns++; return { order: String(st.n) }; });
            }
        } as any);
        mount(comp);
        await tick();
        comp.setState();
        comp.setState();
        comp.setState();
        await tick();

        const before = [attrRuns, classRuns, styleRuns];
        st.n = 2;
        await tick();

        expect([attrRuns - before[0], classRuns - before[1], styleRuns - before[2]]).toEqual([1, 1, 1]);
        expect(el(comp).getAttribute('data-n')).toBe('2');
        expect(el(comp).classList.contains('n2')).toBe(true);
        expect(el(comp).classList.contains('n1')).toBe(false);
    });

    it('continues past a binding without reActivate', async () => {
        const data = { label: 'first' };
        const comp = new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.add({ propertyName: '__custom', dataSource: null, activate() { }, deactivate() { } } as any);
                s.bindings.add('textContent', () => data.label);
            }
        } as any);
        mount(comp);
        await tick();

        data.label = 'second';
        comp.setState();
        await tick();

        expect(el(comp).textContent).toBe('second');
        expect(reported).toEqual([]);
    });
});
