/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0));

class Card extends Component {
    constructor() { super('article'); }
}

describe('devtools counters', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    const counters = () => hook().getCounters();
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    function run(...children: Component[]) {
        const root = new Component('main');
        root.controls.add(...children);
        app.run(host, root);
        return root;
    }

    test('live components are counted by type and a dispose lowers the count', async () => {
        const cards = [new Card(), new Card(), new Card()];
        run(...cards);
        expect(counters().components.byType.Card).toBe(3);
        await cards[0].dispose();
        expect(counters().components.byType.Card).toBe(2);
    });

    test('a living component outside the tree is counted as notInTree', () => {
        run(new Card());
        const before = counters().components;
        expect(before.notInTree).toBe(0);
        const stray = new Card();
        const after = counters().components;
        expect(after.live).toBe(before.live + 1);
        expect(after.inTree).toBe(before.inTree);
        expect(after.notInTree).toBe(1);
        void stray;
    });

    test('bindings and listeners in the tree are counted', async () => {
        const s = reactive({ a: 'x', b: 'y' });
        run();
        const before = counters();
        const c = new Component('div');
        c.bindings.text(() => s.a);
        c.bindings.add('title', () => s.b);
        app.getAppShell().controls.items[0].controls.add(c);
        await c.motif.on('click', () => { });
        await c.motif.on('saved' as any, () => { }, false);
        const after = counters();
        expect(after.bindings - before.bindings).toBe(2);
        expect(after.listeners.dom - before.listeners.dom).toBe(1);
        expect(after.listeners.component - before.listeners.component).toBe(1);
    });

    test('effects are counted live and owned, and fall when their component is disposed', async () => {
        const s = reactive({ a: 'x' });
        run();
        const before = counters().effects;
        const c = new Component('span');
        c.bindings.text(() => s.a);
        app.getAppShell().controls.items[0].controls.add(c);
        const mid = counters().effects;
        expect(mid.live - before.live).toBe(1);
        expect(mid.owned - before.owned).toBe(1);
        await c.dispose();
        const after = counters().effects;
        expect(after.live).toBe(before.live);
        expect(after.owned).toBe(before.owned);
    });

    test('reactivity totals count first runs, flushes and the runs inside flushes', async () => {
        const s = reactive({ n: 1 });
        const a = new Component('span');
        const b = new Component('span');
        a.bindings.text(() => String(s.n));
        b.bindings.text(() => String(s.n + 1));
        run(a, b);
        await settle();
        const before = counters().reactivity;
        expect(before.runs).toBeGreaterThanOrEqual(2);
        s.n = 2;
        s.n = 3;
        await settle();
        const after = counters().reactivity;
        expect(after.flushes - before.flushes).toBe(1);
        expect(after.flushRuns - before.flushRuns).toBe(2);
        expect(after.runs - before.runs).toBe(2);
        expect(after.lastFlushDuration).toBeGreaterThanOrEqual(0);
        expect(after.maxFlushDuration).toBeGreaterThanOrEqual(after.lastFlushDuration);
    });

    test('turning devtools off and on again resets the counters', async () => {
        const s = reactive({ n: 1 });
        const a = new Component('span');
        a.bindings.text(() => String(s.n));
        run(new Card(), a);
        s.n = 2;
        await settle();
        app.useDevelopment(false);
        app.useDevelopment(true);
        const c = counters();
        expect(c.components.live).toBe(0);
        expect(c.components.byType).toEqual({});
        expect(c.effects).toEqual({ live: 0, owned: 0 });
        expect(c.reactivity).toEqual({ runs: 0, flushes: 0, flushRuns: 0, lastFlushDuration: 0, maxFlushDuration: 0 });
    });

    test('components created while devtools are off are not counted', () => {
        app.useDevelopment(false);
        new Card();
        new Card();
        app.useDevelopment(true);
        expect(counters().components.byType.Card).toBeUndefined();
    });
});
