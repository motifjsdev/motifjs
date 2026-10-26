/**
 * @jest-environment jsdom
 */
import { Component } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

function otherDocument(): Document {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentDocument!;
}

function countFrames(win: any) {
    const calls: number[] = [];
    const previous = Object.getOwnPropertyDescriptor(win, 'requestAnimationFrame');
    Object.defineProperty(win, 'requestAnimationFrame', {
        configurable: true, writable: true,
        value: function (cb: FrameRequestCallback) { calls.push(1); return win.setTimeout(() => cb(Date.now()), 16); },
    });
    const restore = () => { if (previous) Object.defineProperty(win, 'requestAnimationFrame', previous); else delete win.requestAnimationFrame; };
    return { calls, restore };
}

function mountIn(doc: Document, classes: Record<string, any>) {
    const root = new Component(doc.body);
    root.build();
    const c = new Component('div');
    c.motif.options.transition.classes = { name: 'fx', css: true, ...classes } as any;
    root.controls.add(c);
    return { root, c };
}

describe('başka belgedeki elemanın geçişi', () => {
    let other: Document;
    let win: any;

    beforeEach(() => { other = otherDocument(); win = other.defaultView; });
    afterEach(() => { document.body.innerHTML = ''; });

    test('bir sonraki kare elemanın penceresinden istenir, sayfanın penceresinden değil', async () => {
        const { root, c } = mountIn(other, { duration: 30 });
        await tick();
        const theirs = countFrames(win);
        const page = countFrames(window);
        try {
            const hidden = c.motif.hide();
            await tick();
            expect(theirs.calls.length).toBe(1);
            expect(page.calls.length).toBe(0);
            await hidden;
            expect(c.isVisible).toBe(false);
            await root.dispose();
        } finally {
            theirs.restore();
            page.restore();
        }
    });

    test('koruma zamanlayıcısı elemanın penceresinde kurulur ve geçişi bitirir', async () => {
        const theirs = countFrames(win);
        const delays: number[] = [];
        const setTimeoutOfWin = win.setTimeout;
        win.setTimeout = function (fn: any, ms?: number, ...rest: any[]) { delays.push(ms ?? 0); return setTimeoutOfWin.call(win, fn, ms, ...rest); };
        try {
            const { root, c } = mountIn(other, { duration: 30 });
            await tick();
            const hidden = c.motif.hide();
            await new Promise(r => setTimeout(r, 20));
            expect(delays).toContain(90);
            await hidden;
            expect((c.element as HTMLElement).classList.contains('fx-leave-active')).toBe(false);
            await root.dispose();
        } finally {
            win.setTimeout = setTimeoutOfWin;
            theirs.restore();
        }
    });

    test('süre verilmemişse hesaplanan stil elemanın penceresinden okunur', async () => {
        const theirs = jest.spyOn(win, 'getComputedStyle');
        const page = jest.spyOn(window, 'getComputedStyle');
        try {
            const { root, c } = mountIn(other, {});
            await tick();
            const hidden = c.motif.hide();
            await new Promise(r => setTimeout(r, 40));
            expect(theirs.mock.calls.some(args => args[0] === c.element)).toBe(true);
            expect(page.mock.calls.some(args => args[0] === c.element)).toBe(false);
            await hidden;
            await root.dispose();
        } finally {
            theirs.mockRestore();
            page.mockRestore();
        }
    });

    test('yerleşmemiş elemanın geçiş bilgisi elemanın belgesinde ölçülür', async () => {
        const { root, c } = mountIn(other, { duration: 0 });
        await tick();
        await c.motif.hide();
        expect((c.element as Node).isConnected).toBe(false);
        const theirs = jest.spyOn(win, 'getComputedStyle');
        const page = jest.spyOn(window, 'getComputedStyle');
        const appended: Node[] = [];
        const append = other.body.appendChild.bind(other.body);
        other.body.appendChild = ((node: Node) => { appended.push(node); return append(node); }) as any;
        try {
            const info = (c.motif.options.transition as any).transitionInfo();
            expect(info.in).toBeDefined();
            expect(theirs).toHaveBeenCalled();
            expect(page).not.toHaveBeenCalled();
            expect(appended.length).toBe(2);
            expect(other.body.contains(appended[0])).toBe(false);
        } finally {
            theirs.mockRestore();
            page.mockRestore();
            other.body.appendChild = append as any;
            await root.dispose();
        }
    });
});
