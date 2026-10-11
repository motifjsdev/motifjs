import { Component, ComponentBase, reactive } from '@motifx/core';

const flush = () => new Promise(r => setTimeout(r, 0));
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

function stubAnimation(c: Component, phase: 'in' | 'out') {
    const op = { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: 100 };
    if (phase === 'in') c.motif.options.transition.in(op);
    else c.motif.options.transition.out(op);
    const target: any = new EventTarget();
    let done: () => void = () => { };
    target.finished = new Promise<void>(r => { done = r; });
    target.finished.catch(() => { });
    target.cancel = () => { target.dispatchEvent(new Event('cancel')); };
    let calls = 0;
    (c.element as any).animate = () => {
        if (calls++ === 0) return target;
        const later: any = new EventTarget();
        later.finished = Promise.resolve();
        setTimeout(() => later.dispatchEvent(new Event('finish')), 0);
        return later;
    };
    return {
        finish: () => { target.dispatchEvent(new Event('finish')); done(); },
        started: () => calls > 0,
    };
}

function mount(props?: any) {
    const root = new Component('div', props);
    root.build();
    document.body.appendChild(root.element as any);
    return root;
}

const inDom = (root: Component, c: Component) => !!c.element && (root.element as any).contains(c.element);

afterEach(() => { document.body.innerHTML = ''; });

describe('attributes of a component', () => {
    test('attr is the same object on every read and writes to the element', () => {
        const root = mount();
        const c = new Component('p');
        root.controls.add(c);
        const a = c.attr;
        expect(c.attr).toBe(a);
        c.attr.add({ 'data-x': '1' });
        expect((c.element as HTMLElement).getAttribute('data-x')).toBe('1');
        root.dispose();
    });

    test('a reactive attribute follows its source and stops after dispose', async () => {
        const state = reactive({ v: 'a' });
        const root = mount();
        const c = new Component('p');
        root.controls.add(c);
        const el = c.element as HTMLElement;
        c.attr.add({ title: () => state.v });
        expect(el.getAttribute('title')).toBe('a');
        state.v = 'b';
        await flush();
        expect(el.getAttribute('title')).toBe('b');
        await c.dispose();
        state.v = 'c';
        await flush();
        expect(el.getAttribute('title')).toBe('b');
        root.dispose();
    });

    test('an assigned attr object is what attr returns', () => {
        const c = new Component('p');
        const other = new Component('i');
        const mine = other.attr;
        c.attr = mine;
        expect(c.attr).toBe(mine);
    });

    test('attr is gone after dispose', async () => {
        const c = new Component('p');
        void c.attr;
        await c.dispose();
        expect(c.attr).toBeUndefined();
        const never = new Component('p');
        await never.dispose();
        expect(never.attr).toBeUndefined();
    });
});

describe('the container a detached component leaves from', () => {
    test('in-out: a detached child waits for the new child to enter before leaving', async () => {
        const root = mount({ transition: { mode: 'in-out' } });
        const a = new Component('p');
        root.controls.add(a);
        const leave = stubAnimation(a, 'out');
        const b = new Component('span');
        const enter = stubAnimation(b, 'in');
        root.controls.add(b);
        await flush();
        expect(enter.started()).toBe(true);
        const gone = root.controls.detach(a);
        expect(a.parent).toBeNull();
        await flush();
        expect(leave.started()).toBe(false);
        enter.finish();
        await flush();
        expect(leave.started()).toBe(true);
        leave.finish();
        await gone;
        await flush();
        expect(inDom(root, a)).toBe(false);
        expect(a.isDisposed).toBe(false);
        await a.dispose();
        await root.dispose();
    });

    test('in-out: a child unlinked silently and then disposed still uses the mode of the container it left', async () => {
        const root = mount({ transition: { mode: 'in-out' } });
        const a = new Component('p');
        root.controls.add(a);
        const leave = stubAnimation(a, 'out');
        root.controls.silentUnlink(a);
        expect(a.parent).toBeNull();
        const b = new Component('span');
        const enter = stubAnimation(b, 'in');
        root.controls.add(b);
        await flush();
        expect(enter.started()).toBe(true);
        const p = a.dispose();
        await flush();
        expect(leave.started()).toBe(false);
        enter.finish();
        await flush();
        expect(leave.started()).toBe(true);
        leave.finish();
        await p;
        expect(a.isDisposed).toBe(true);
        await root.dispose();
    });

    test('concurrent: a detached child starts leaving at once', async () => {
        const root = mount();
        const a = new Component('p');
        root.controls.add(a);
        const leave = stubAnimation(a, 'out');
        const b = new Component('span');
        const enter = stubAnimation(b, 'in');
        root.controls.add(b);
        await flush();
        expect(enter.started()).toBe(true);
        void root.controls.detach(a);
        await flush();
        expect(leave.started()).toBe(true);
        leave.finish();
        await flush();
        expect(inDom(root, a)).toBe(false);
        root.dispose();
    });

    test('a detached child added somewhere else uses its new parent', async () => {
        const root = mount({ transition: { mode: 'in-out' } });
        const other = mount();
        const a = new Component('p');
        root.controls.add(a);
        void root.controls.detach(a);
        await flush();
        other.controls.add(a);
        const leave = stubAnimation(a, 'out');
        const b = new Component('span');
        const enter = stubAnimation(b, 'in');
        other.controls.add(b);
        await flush();
        expect(enter.started()).toBe(true);
        void a.dispose();
        await flush();
        expect(leave.started()).toBe(true);
        leave.finish();
        await flush();
        root.dispose();
        other.dispose();
    });
});

describe('components a list takes from elsewhere', () => {
    function mountList(itemsFn: () => any[], renderFn: any) {
        const host = new Component('div', {
            initializeComponent: (s: ComponentBase) => { s.bindings.list(itemsFn, renderFn); }
        });
        host.build();
        document.body.appendChild(host.element as Node);
        return host;
    }

    test('a component that already had a parent is never disposed by the list', async () => {
        const elsewhere = mount();
        const foreign = new Component('b');
        elsewhere.controls.add(foreign);
        const made: Component[] = [];
        const model = reactive({ items: ['a', 'b'] });
        const host = mountList(() => model.items, (item: string) => {
            if (item === 'a') return foreign;
            const c = new Component('span');
            (c.element as HTMLElement).textContent = item;
            made.push(c);
            return c;
        });
        await wait(5);
        model.items = ['b'];
        await wait(5);
        expect(foreign.isDisposed).toBe(false);
        model.items = [];
        await wait(5);
        expect(made.every(c => c.isDisposed)).toBe(true);
        expect(foreign.isDisposed).toBe(false);
        await host.dispose();
        await elsewhere.dispose();
    });

    test('a component made by the list keeps its first verdict when it is rendered again', async () => {
        const cache = new Map<string, Component>();
        const model = reactive({ items: ['a'] });
        const host = mountList(() => model.items, (item: string, idx: number) => {
            let c = cache.get(item);
            if (!c) {
                c = new Component('span');
                cache.set(item, c);
            }
            (c.element as HTMLElement).textContent = idx + ':' + item;
            return c;
        });
        await wait(5);
        const a = cache.get('a')!;
        model.items = ['x', 'a'];
        await wait(5);
        model.items = [];
        await wait(5);
        expect(a.isDisposed).toBe(true);
        expect(cache.get('x')!.isDisposed).toBe(true);
        await host.dispose();
    });

    test('a list item reused in place keeps its element', async () => {
        const model = reactive({ items: ['a', 'b', 'c'], flag: 0 });
        const host = mountList(() => { void model.flag; return model.items; }, (item: string) => {
            const c = new Component('span');
            (c.element as HTMLElement).textContent = item;
            return c;
        });
        await wait(5);
        const before = Array.from((host.element as HTMLElement).querySelectorAll('span'));
        model.flag = 1;
        await wait(5);
        expect(Array.from((host.element as HTMLElement).querySelectorAll('span'))).toEqual(before);
        await host.dispose();
    });
});
