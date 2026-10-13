/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive, createSignal } from '@motifx/core';

const moduleStore = reactive({ kept: true });

class Panel extends Component {
    state = reactive({ open: false });
    constructor() { super('section'); }
}

class Reader extends Component {
    constructor(public shared: object) { super('div'); }
}

describe('devtools store changes', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let events: string[];
    let off: () => void;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        events = [];
        off = hook().on((ev: any) => { if (ev.type === 'stores:changed') events.push(ev.type); });
    });

    afterEach(async () => {
        off();
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    const settle = () => new Promise(r => setTimeout(r, 0));

    function run(...children: Component[]) {
        const root = new Component('main');
        root.controls.add(...children);
        app.run(host, root);
        return root;
    }

    test('creating stores publishes one stores:changed per turn', async () => {
        const kept = [reactive({ a: 1 }), reactive({ b: 2 }), createSignal(3)];
        expect(events).toEqual([]);
        await settle();
        expect(events).toEqual(['stores:changed']);
        reactive({ c: 3 });
        await settle();
        expect(events).toEqual(['stores:changed', 'stores:changed']);
        expect(kept).toHaveLength(3);
    });

    test('nothing is published while devtools is off', async () => {
        app.useDevelopment(false);
        reactive({ a: 1 });
        await settle();
        app.useDevelopment(true);
        expect(events).toEqual([]);
    });

    test('a store no longer kept by the component that kept it is marked released', async () => {
        const panel = new Panel();
        const root = run(panel);
        const state = panel.state;
        expect(hook().getStores().find((s: any) => s.value === state).released).toBeUndefined();
        root.controls.remove(panel);
        await settle();
        const entry = hook().getStores().find((s: any) => s.value === state);
        expect(entry.holders).toEqual([]);
        expect(entry.released).toBe(true);
    });

    test('a store of a component disposed before any getStores call is marked released', async () => {
        const panel = new Panel();
        const root = run(panel);
        const state = panel.state;
        root.controls.remove(panel);
        await settle();
        expect(hook().getStores().find((s: any) => s.value === state).released).toBe(true);
    });

    test('a store that was never kept by a component or service is not marked released', () => {
        const loose = reactive({ loose: true });
        run(new Component('div'));
        expect(hook().getStores().find((s: any) => s.value === loose).released).toBeUndefined();
    });

    test('a store picked up by the scan does not publish stores:changed', async () => {
        run(new Reader(moduleStore));
        await settle();
        events.length = 0;
        expect(hook().getStores().some((s: any) => s.value === moduleStore)).toBe(true);
        await settle();
        expect(events).toEqual([]);
    });
});
