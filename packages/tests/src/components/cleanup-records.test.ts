import { Component, disposableCore, reactive } from '@motifx/core';

const flush = () => new Promise(r => setTimeout(r, 0));

function host() {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    return root;
}

afterEach(() => {
    disposableCore.disposableTracker = null;
    document.body.innerHTML = '';
});

describe('cleanups a component keeps', () => {
    test('a cleanup runs once, a cleanup registered twice runs twice, in order', async () => {
        const c = new Component('p');
        const log: string[] = [];
        const f = () => log.push('f');
        c.motif.setDisposable(f);
        c.motif.setDisposable(() => log.push('g'));
        c.motif.setDisposable(f);
        await c.dispose();
        expect(log).toEqual(['f', 'g', 'f']);
        await c.dispose();
        expect(log).toEqual(['f', 'g', 'f']);
    });

    test('a failing cleanup does not stop the others', async () => {
        const c = new Component('p');
        const log: string[] = [];
        c.motif.setDisposable(() => { log.push('a'); throw new Error('boom'); });
        c.motif.setDisposable(() => log.push('b'));
        let error: any;
        try { await c.dispose(); } catch (e) { error = e; }
        expect(log).toEqual(['a', 'b']);
        expect(String(error?.message ?? error ?? '')).toBe(EXPECTED_ERROR);
        expect(c.isDisposed).toBe(true);
    });

    test('a cleanup that disposes its own component runs once', async () => {
        const c = new Component('p');
        let runs = 0;
        c.motif.setDisposable(() => { runs++; c.dispose(); });
        await c.dispose();
        await flush();
        expect(runs).toBe(1);
    });

    test('watch, method, when and text stop with the component and errors in their stop are kept quiet', async () => {
        const root = host();
        const c = new Component('div');
        root.controls.add(c);
        const state = reactive({ v: 1 });
        let watched = 0;
        c.bindings.watch(() => { void state.v; watched++; });
        c.bindings.method(() => 'm' + state.v);
        c.bindings.when(() => state.v > 0, () => new Component('i'));
        c.bindings.text(() => 't' + state.v);
        state.v = 2;
        await flush();
        expect(watched).toBe(2);
        await c.dispose();
        state.v = 3;
        await flush();
        expect(watched).toBe(2);
        root.dispose();
    });

    test('a mounted listener taken off is not cleaned up again', async () => {
        const root = host();
        const c = new Component('p');
        const seen: string[] = [];
        const cb = () => seen.push('mounted');
        c.motif.on('x:mounted' as any, cb);
        c.motif.off('x:mounted' as any, cb);
        root.controls.add(c);
        await flush();
        expect(seen).toEqual([]);
        await c.dispose();
        root.dispose();
    });
});

describe('what a disposable tracker sees', () => {
    function install() {
        const ids = new Map<any, number>();
        const id = (o: any) => { if (!ids.has(o)) ids.set(o, ids.size); return ids.get(o)!; };
        const log: string[] = [];
        disposableCore.disposableTracker = {
            trackDisposable: (d: any) => { log.push('track ' + id(d)); },
            setParent: (child: any, parent: any) => { log.push('parent ' + id(child) + ' ' + (parent === null ? '-' : id(parent))); },
            markAsDisposed: (d: any) => { log.push('disposed ' + id(d)); },
            markAsSingleton: (d: any) => { log.push('singleton ' + id(d)); },
        };
        return { log, id };
    }

    test('a component with a cleanup and a watch reports the same calls in the same order', async () => {
        const { log, id } = install();
        const c = new Component('p');
        id(c);
        const state = reactive({ v: 1 });
        c.motif.setDisposable(() => { });
        c.bindings.watch(() => { void state.v; });
        c.motif.setDisposable(() => { });
        await c.dispose();
        disposableCore.disposableTracker = null;
        expect(log).toEqual(EXPECTED_TRACK);
    });

    test('every reported cleanup is a disposable with a dispose method', async () => {
        const seen: any[] = [];
        disposableCore.disposableTracker = {
            trackDisposable: (d: any) => { seen.push(d); },
            setParent: () => { },
            markAsDisposed: () => { },
            markAsSingleton: () => { },
        };
        const c = new Component('p');
        c.motif.setDisposable(() => { });
        await c.dispose();
        disposableCore.disposableTracker = null;
        expect(seen.length).toBeGreaterThan(0);
        for (const d of seen) expect(typeof d.dispose).toBe('function');
    });
});

const EXPECTED_ERROR = 'boom';
const EXPECTED_TRACK: string[] = [
    'track 0',
    'track 1',
    'track 2',
    'parent 2 0',
    'parent 1 2',
    'parent 3 2',
    'track 4',
    'parent 4 2',
    'disposed 0',
    'disposed 2',
    'disposed 1',
    'disposed 4',
];
