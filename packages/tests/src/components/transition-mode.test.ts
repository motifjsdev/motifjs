import { Application, Component } from '@motifx/core';

const flush = () => new Promise(r => setTimeout(r, 0));

const withLeave = (c: Component) => stubAnimation(c, 'out');
const withEnter = (c: Component) => stubAnimation(c, 'in');

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
        cancel: () => target.cancel(),
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

describe('transition mode', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('concurrent is the default: the new child enters while the old one is leaving', async () => {
        const root = mount();
        const a = new Component('p');
        root.controls.add(a);
        const leave = withLeave(a);
        const b = new Component('span');
        a.dispose();
        root.controls.add(b);
        expect(inDom(root, a)).toBe(true);
        expect(inDom(root, b)).toBe(true);
        leave.finish();
        await flush();
        expect(inDom(root, b)).toBe(true);
        await root.dispose();
    });

    test('out-in on the container waits for the leave before inserting the new child', async () => {
        const root = mount();
        root.motif.options.transition.mode = 'out-in';
        const a = new Component('p');
        root.controls.add(a);
        const leave = withLeave(a);
        const b = new Component('span');
        a.dispose();
        root.controls.add(b);
        await flush();
        expect(inDom(root, a)).toBe(true);
        expect(inDom(root, b)).toBe(false);
        expect(root.controls.items).toContain(b);
        leave.finish();
        await flush();
        expect(inDom(root, a)).toBe(false);
        expect(inDom(root, b)).toBe(true);
        expect((root.element as HTMLElement).lastElementChild).toBe(b.element);
        await root.dispose();
    });

    test('out-in from the transition prop object without animating the container itself', async () => {
        const root = mount({ transition: { mode: 'out-in' } });
        expect(root.motif.options.transition.mode).toBe('out-in');
        expect(root.motif.options.transition.name).toBe('');
        expect(root.motif.options.transition.classes).toBeUndefined();
        const a = new Component('p');
        root.controls.add(a);
        const leave = withLeave(a);
        const b = new Component('span');
        a.dispose();
        root.controls.add(b);
        await flush();
        expect(inDom(root, b)).toBe(false);
        leave.finish();
        await flush();
        expect(inDom(root, b)).toBe(true);
        await root.dispose();
    });

    test('application default applies without a router and a container can override it', async () => {
        const app = Application.CreateBuilder().build();
        try {
            app.useTransitions({ mode: 'out-in' });
            const root = mount();
            const a = new Component('p');
            root.controls.add(a);
            const leave = withLeave(a);
            const b = new Component('span');
            a.dispose();
            root.controls.add(b);
            await flush();
            expect(inDom(root, b)).toBe(false);
            leave.finish();
            await flush();
            expect(inDom(root, b)).toBe(true);

            const other = mount();
            other.motif.options.transition.mode = 'concurrent';
            const c = new Component('p');
            other.controls.add(c);
            const leaveC = withLeave(c);
            const d = new Component('span');
            c.dispose();
            other.controls.add(d);
            expect(inDom(other, d)).toBe(true);
            leaveC.finish();
            await flush();
            await root.dispose();
            await other.dispose();
        } finally {
            app.dispose();
        }
    });

    test('application dispose restores the concurrent default', async () => {
        const app = Application.CreateBuilder().build();
        app.useTransitions({ mode: 'out-in' });
        app.dispose();
        const root = mount();
        const a = new Component('p');
        root.controls.add(a);
        const leave = withLeave(a);
        const b = new Component('span');
        a.dispose();
        root.controls.add(b);
        expect(inDom(root, b)).toBe(true);
        leave.finish();
        await flush();
        await root.dispose();
    });

    test('a cancelled leave releases the waiting child', async () => {
        const root = mount();
        root.motif.options.transition.mode = 'out-in';
        const a = new Component('p');
        root.controls.add(a);
        const leave = withLeave(a);
        const b = new Component('span');
        a.motif.hide().catch(() => { });
        root.controls.add(b);
        await flush();
        expect(inDom(root, b)).toBe(false);
        leave.cancel();
        await flush();
        expect(inDom(root, b)).toBe(true);
        await root.dispose();
    });

    test('show waits for a sibling hide in out-in mode', async () => {
        const root = mount();
        root.motif.options.transition.mode = 'out-in';
        const a = new Component('p');
        const b = new Component('span');
        root.controls.add(a, b);
        await b.motif.hide();
        expect(b.isVisible).toBe(false);
        const leave = withLeave(a);
        a.motif.hide();
        b.motif.show();
        await flush();
        expect(b.isVisible).toBe(false);
        expect(inDom(root, b)).toBe(false);
        leave.finish();
        await flush();
        await flush();
        expect(b.isVisible).toBe(true);
        expect(inDom(root, b)).toBe(true);
        await root.dispose();
    });

    test('hiding again while a show is waiting cancels that show', async () => {
        const root = mount();
        root.motif.options.transition.mode = 'out-in';
        const a = new Component('p');
        const b = new Component('span');
        root.controls.add(a, b);
        await b.motif.hide();
        const leave = withLeave(a);
        a.motif.hide();
        b.motif.show();
        b.motif.hide();
        leave.finish();
        await flush();
        await flush();
        expect(b.isVisible).toBe(false);
        expect(inDom(root, b)).toBe(false);
        await root.dispose();
    });

    test('a child removed while waiting is never inserted', async () => {
        const root = mount();
        root.motif.options.transition.mode = 'out-in';
        const a = new Component('p');
        root.controls.add(a);
        const leave = withLeave(a);
        const b = new Component('span');
        a.dispose();
        root.controls.add(b);
        await b.dispose();
        leave.finish();
        await flush();
        expect((root.element as HTMLElement).children.length).toBe(0);
        expect(root.controls.items).not.toContain(b);
        await root.dispose();
    });

    test('without a running leave out-in inserts immediately', async () => {
        const root = mount();
        root.motif.options.transition.mode = 'out-in';
        const a = new Component('p');
        root.controls.add(a);
        expect(inDom(root, a)).toBe(true);
        await root.dispose();
    });

    test('in-out: the old child starts leaving only after the new child has entered', async () => {
        const root = mount({ transition: { mode: 'in-out' } });
        const a = new Component('p');
        root.controls.add(a);
        const leave = withLeave(a);
        const b = new Component('span');
        const enter = withEnter(b);
        a.dispose();
        root.controls.add(b);
        await flush();
        expect(inDom(root, b)).toBe(true);
        expect(enter.started()).toBe(true);
        expect(inDom(root, a)).toBe(true);
        expect(leave.started()).toBe(false);
        enter.finish();
        await flush();
        expect(leave.started()).toBe(true);
        expect(inDom(root, a)).toBe(true);
        leave.finish();
        await flush();
        expect(inDom(root, a)).toBe(false);
        expect(a.isDisposed).toBe(true);
        await root.dispose();
    });

    test('in-out: a leave with no entering sibling plays at once', async () => {
        const root = mount();
        root.motif.options.transition.mode = 'in-out';
        const a = new Component('p');
        root.controls.add(a);
        const leave = withLeave(a);
        const p = a.dispose();
        await flush();
        expect(leave.started()).toBe(true);
        leave.finish();
        await p;
        expect(inDom(root, a)).toBe(false);
        await root.dispose();
    });

    test('in-out: hide waits for the sibling show to finish entering', async () => {
        const root = mount();
        root.motif.options.transition.mode = 'in-out';
        const a = new Component('p');
        const b = new Component('span');
        root.controls.add(a, b);
        await b.motif.hide();
        const enter = withEnter(b);
        const leave = withLeave(a);
        const hidden = a.motif.hide();
        b.motif.show();
        await flush();
        expect(b.isVisible).toBe(true);
        expect(enter.started()).toBe(true);
        expect(leave.started()).toBe(false);
        enter.finish();
        await flush();
        expect(leave.started()).toBe(true);
        leave.finish();
        await hidden;
        expect(a.isVisible).toBe(false);
        await root.dispose();
    });

    test('in-out as the application default', async () => {
        const app = Application.CreateBuilder().build();
        try {
            app.useTransitions({ mode: 'in-out' });
            const root = mount();
            const a = new Component('p');
            root.controls.add(a);
            const leave = withLeave(a);
            const b = new Component('span');
            const enter = withEnter(b);
            a.dispose();
            root.controls.add(b);
            await flush();
            expect(leave.started()).toBe(false);
            enter.finish();
            await flush();
            expect(leave.started()).toBe(true);
            leave.finish();
            await flush();
            await root.dispose();
        } finally {
            app.dispose();
        }
    });
});
