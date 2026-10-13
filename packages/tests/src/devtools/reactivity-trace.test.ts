/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive, effect } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0));

class Cart { total = 1; name = 'a'; }

describe('devtools reactivity trace', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let flushes: any[];
    let off: () => void;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        flushes = [];
        off = hook().on((ev: any) => { if (ev.type === 'reactivity:flush') flushes.push(ev.payload); });
    });

    afterEach(async () => {
        off();
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

    test('a text binding is listed with its kind, runs and dependencies', () => {
        const s = reactive(new Cart());
        const c = new Component('span');
        c.bindings.text(() => String(s.total));
        run(c);
        const effects = hook().inspect([0, 0]).effects;
        expect(effects.length).toBe(1);
        expect(effects[0]).toMatchObject({ kind: 'binding:textContent', runs: 1, lastTrigger: null });
        expect(effects[0].deps).toContainEqual({ target: { kind: 'object', type: 'Cart', keys: 2 }, key: 'total' });
        expect(typeof effects[0].lastDuration).toBe('number');
    });

    test('a change raises runs and records what triggered it', async () => {
        const s = reactive(new Cart());
        const c = new Component('span');
        c.bindings.text(() => String(s.total));
        run(c);
        s.total = 2;
        await settle();
        const [e] = hook().inspect([0, 0]).effects;
        expect(e.runs).toBe(2);
        expect(e.lastTrigger).toEqual({ target: { kind: 'object', type: 'Cart', keys: 2 }, key: 'total' });
    });

    test('changes in one turn publish one flush with triggers and owned effects', async () => {
        const s = reactive(new Cart());
        const a = new Component('span');
        const b = new Component('b');
        a.bindings.text(() => String(s.total));
        b.bindings.text(() => s.name + s.total);
        run(a, b);
        flushes.length = 0;
        s.total = 5;
        s.total = 6;
        s.name = 'z';
        await settle();
        expect(flushes.length).toBe(1);
        const f = flushes[0];
        expect(f.runs).toBe(2);
        expect(typeof f.duration).toBe('number');
        expect(f.triggers).toContainEqual({ target: { kind: 'object', type: 'Cart', keys: 2 }, key: 'total', count: 2 });
        expect(f.triggers).toContainEqual({ target: { kind: 'object', type: 'Cart', keys: 2 }, key: 'name', count: 1 });
        expect(f.effects).toContainEqual({ path: [0, 0], type: 'Component', tag: 'span', kind: 'binding:textContent', runs: 1 });
        expect(f.effects).toContainEqual({ path: [0, 1], type: 'Component', tag: 'b', kind: 'binding:textContent', runs: 1 });
    });

    test('class, attribute, style and list effects carry their kinds', () => {
        const s = reactive({ on: true, t: 'x', w: 1, items: [1, 2] });
        const c = new Component('div');
        c.class.add([{ on: () => s.on }]);
        c.attr.add({ title: () => s.t });
        c.style(() => ({ width: s.w + 'px' }));
        c.bindings.list(() => s.items, () => new Component('i'));
        run(c);
        const kinds = hook().inspect([0, 0]).effects.map((e: any) => e.kind);
        expect(kinds).toEqual(expect.arrayContaining(['class', 'attr:title', 'style', 'list']));
    });

    test('a disposed component no longer lists its effects', async () => {
        const s = reactive(new Cart());
        const c = new Component('span');
        c.bindings.text(() => String(s.total));
        run(c);
        const inner = new Component('em');
        inner.bindings.text(() => s.name);
        c.controls.add(inner);
        expect(hook().inspect([0, 0, 0]).effects.length).toBe(1);
        await inner.dispose();
        const replacement = new Component('em');
        c.controls.add(replacement);
        expect(hook().inspect([0, 0, 0]).effects).toEqual([]);
    });

    test('a free effect is counted in the flush without an owner', async () => {
        const s = reactive(new Cart());
        run();
        const stop = effect(() => { void s.total; });
        flushes.length = 0;
        s.total = 9;
        await settle();
        expect(flushes[0].effects).toContainEqual({ path: null, type: null, tag: null, kind: 'effect', runs: 1 });
        stop();
    });

    test('with devtools off nothing is recorded and no flush is published', async () => {
        app.useDevelopment(false);
        const s = reactive(new Cart());
        const c = new Component('span');
        c.bindings.text(() => String(s.total));
        run(c);
        s.total = 3;
        await settle();
        app.useDevelopment(true);
        off = hook().on((ev: any) => { if (ev.type === 'reactivity:flush') flushes.push(ev.payload); });
        expect(flushes).toEqual([]);
        expect(hook().inspect([0, 0]).effects).toEqual([]);
    });
});
