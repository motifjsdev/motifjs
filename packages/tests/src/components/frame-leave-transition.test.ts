import { Component, Frame, reactive } from '@motifx/core';

const flush = () => new Promise(r => setTimeout(r, 0));

function stubAnimation(c: Component, phase: 'in' | 'out') {
    const op = { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: 100 };
    if (phase === 'in') c.motif.options.transition.in(op);
    else c.motif.options.transition.out(op);
    const target: any = new EventTarget();
    let done: () => void = () => { };
    let abort: (e: any) => void = () => { };
    target.finished = new Promise<void>((r, j) => { done = r; abort = j; });
    target.finished.catch(() => { });
    target.cancel = () => {
        target.oncancel?.();
        target.dispatchEvent(new Event('cancel'));
        abort(new Error('AbortError'));
    };
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

describe('Frame.navigate plays the leaving content\'s transition', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('concurrent: the old content leaves while the new content is already in place', async () => {
        const root = mount();
        const frame = new Frame();
        root.controls.add(frame);
        const a = new Component('p');
        await frame.navigate(a);
        const leave = stubAnimation(a, 'out');
        const b = new Component('span');
        const nav = frame.navigate(b);
        await flush();
        expect(inDom(root, a)).toBe(true);
        expect(leave.started()).toBe(true);
        expect(inDom(root, b)).toBe(true);
        expect((root.element as HTMLElement).innerHTML.indexOf('<p')).toBeLessThan((root.element as HTMLElement).innerHTML.indexOf('<span'));
        leave.finish();
        await flush();
        await nav;
        expect(inDom(root, a)).toBe(false);
        expect(a.isDisposed).toBe(true);
        expect(inDom(root, b)).toBe(true);
        expect(frame.current).toBe(b);
        await root.dispose();
    });

    test('out-in on the enclosing element: the new content waits for the leave', async () => {
        const root = mount({ transition: { mode: 'out-in' } });
        const frame = new Frame();
        root.controls.add(frame);
        const a = new Component('p');
        await frame.navigate(a);
        const leave = stubAnimation(a, 'out');
        const b = new Component('span');
        frame.navigate(b);
        await flush();
        expect(inDom(root, a)).toBe(true);
        expect(inDom(root, b)).toBe(false);
        expect(frame.controls.items).toContain(b);
        leave.finish();
        await flush();
        expect(inDom(root, a)).toBe(false);
        expect(inDom(root, b)).toBe(true);
        await root.dispose();
    });

    test('in-out on the enclosing element: the old content leaves only after the new one has entered', async () => {
        const root = mount({ transition: { mode: 'in-out' } });
        const frame = new Frame();
        root.controls.add(frame);
        const a = new Component('p');
        await frame.navigate(a);
        const leave = stubAnimation(a, 'out');
        const b = new Component('span');
        const enter = stubAnimation(b, 'in');
        frame.navigate(b);
        await flush();
        expect(inDom(root, b)).toBe(true);
        expect(enter.started()).toBe(true);
        expect(inDom(root, a)).toBe(true);
        expect(leave.started()).toBe(false);
        enter.finish();
        await flush();
        expect(leave.started()).toBe(true);
        leave.finish();
        await flush();
        expect(inDom(root, a)).toBe(false);
        expect(a.isDisposed).toBe(true);
        await root.dispose();
    });

    test('the mode of the nearest element ancestor applies through nested frames', async () => {
        const root = mount({ transition: { mode: 'out-in' } });
        const outer = new Frame();
        root.controls.add(outer);
        const inner = new Frame();
        await outer.navigate(inner);
        const a = new Component('p');
        await inner.navigate(a);
        const leave = stubAnimation(a, 'out');
        const b = new Component('span');
        inner.navigate(b);
        await flush();
        expect(inDom(root, b)).toBe(false);
        leave.finish();
        await flush();
        expect(inDom(root, b)).toBe(true);
        await root.dispose();
    });

    test('without a leave transition the new content is placed after the old one is disposed', async () => {
        const root = mount();
        const frame = new Frame();
        root.controls.add(frame);
        const log: string[] = [];
        class Page extends Component {
            constructor(public name: string) { super('p'); }
            override onDisposed() { log.push(`${this.name} disposed`); }
            override onBuilt() { log.push(`${this.name} built`); }
        }
        const a = new Page('a');
        await frame.navigate(a);
        const b = new Page('b');
        await frame.navigate(b);
        expect(log).toEqual(['a built', 'a disposed', 'b built']);
        expect(inDom(root, b)).toBe(true);
        await root.dispose();
    });

    test('Frame.dispose plays the current content\'s leave', async () => {
        const root = mount();
        const frame = new Frame();
        root.controls.add(frame);
        const a = new Component('p');
        await frame.navigate(a);
        const leave = stubAnimation(a, 'out');
        const disposing = frame.dispose();
        await flush();
        expect(leave.started()).toBe(true);
        expect(inDom(root, a)).toBe(true);
        leave.finish();
        await disposing;
        expect(inDom(root, a)).toBe(false);
        expect(a.isDisposed).toBe(true);
        expect(frame.isDisposed).toBe(true);
        await root.dispose();
    });

    test('a conditional branch (bindings.when) leaves with its transition', async () => {
        const root = mount();
        const state = reactive({ show: true });
        const a = new Component('p');
        root.bindings.when(() => state.show, () => a);
        await flush();
        expect(inDom(root, a)).toBe(true);
        const leave = stubAnimation(a, 'out');
        state.show = false;
        await flush();
        await flush();
        expect(leave.started()).toBe(true);
        expect(inDom(root, a)).toBe(true);
        leave.finish();
        await flush();
        expect(inDom(root, a)).toBe(false);
        expect(a.isDisposed).toBe(true);
        await root.dispose();
    });
});
