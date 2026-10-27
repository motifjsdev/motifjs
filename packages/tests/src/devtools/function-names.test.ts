/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Application, Component, reactive } from '@motifx/core';

const h = (motif as any).motifComponent;

function StatCard(props: { title: string }) {
    const card = new Component('article');
    card.controls.add(props.title as any);
    return card;
}

function Outer() {
    return h(StatCard, { title: 'inner' });
}

function Panel() {
    return new Component('aside');
}

class Dashboard extends Component<HTMLElement> {
    constructor() { super('section'); }
}

describe('devtools function component names', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
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

    function types(node: any, out: string[] = []): string[] {
        out.push(node.type);
        for (const child of node.children ?? []) types(child, out);
        return out;
    }

    test('getTree shows a function component by its name and a class by its class name', () => {
        const root = new Component('main');
        root.controls.add(h(StatCard, { title: 'a' }), new Dashboard());
        app.run(host, root);
        expect(hook().getTree([0, 0, 0])).toMatchObject({ type: 'StatCard', tag: 'article' });
        expect(hook().getTree([0, 0, 1])).toMatchObject({ type: 'Dashboard', tag: 'section' });
    });

    test('list rows and controls.add factories carry the function name', () => {
        const items = reactive([{ t: 'x' }, { t: 'y' }]);
        const root = new Component('main');
        const list = new Component('ul');
        list.bindings.list(() => items, (item: any) => h(StatCard, { title: item.t }));
        root.controls.add(list);
        root.controls.add(Panel as any);
        app.run(host, root);
        const all = types(hook().getTree());
        expect(all.filter((t) => t === 'StatCard')).toHaveLength(2);
        expect(all).toContain('Panel');
    });

    test('the outer function name is kept when a function returns another function component', () => {
        const root = new Component('main');
        root.controls.add(h(Outer, {}));
        app.run(host, root);
        expect(hook().getTree([0, 0, 0])).toMatchObject({ type: 'Outer', tag: 'article' });
    });

    test('inspect and component:built use the same name', () => {
        const built: any[] = [];
        const off = hook().on((e: any) => { if (e.type === 'component:built') built.push(e.payload); });
        const root = new Component('main');
        root.controls.add(h(StatCard, { title: 'a' }));
        app.run(host, root);
        off();
        expect(hook().inspect([0, 0, 0])).toMatchObject({ type: 'StatCard' });
        expect(built.some((p) => p.type === 'StatCard' && p.tag === 'article')).toBe(true);
    });

    test('byType counts the function name instead of Component', () => {
        const root = new Component('main');
        app.run(host, root);
        const before = hook().getCounters().components.byType.Component ?? 0;
        root.controls.add(h(StatCard, { title: 'a' }), h(StatCard, { title: 'b' }));
        const byType = hook().getCounters().components.byType;
        expect(byType.StatCard).toBe(2);
        expect(byType.Component).toBe(before + 2);
    });

    test('nothing is recorded while devtools is off', () => {
        app.useDevelopment(false);
        const card = h(StatCard, { title: 'a' });
        app.useDevelopment(true);
        const root = new Component('main');
        root.controls.add(card);
        app.run(host, root);
        expect(hook().getTree([0, 0, 0])).toMatchObject({ type: 'Component', tag: 'article' });
        expect(hook().inspect([0, 0, 0]).functionProps).toBeUndefined();
    });

    test('inspect shows the props given to a function component', () => {
        const root = new Component('main');
        root.controls.add(h(StatCard, { title: 'a', count: 2, onPick: function pick() {} }), new Dashboard());
        app.run(host, root);
        expect(hook().inspect([0, 0, 0]).functionProps).toEqual({ title: 'a', count: 2, onPick: { kind: 'function', name: 'pick' } });
        expect(hook().inspect([0, 0, 1]).functionProps).toBeUndefined();
    });

    test('the outer function props are shown when a function returns another function component', () => {
        const root = new Component('main');
        root.controls.add(h(Outer, { level: 1 }));
        app.run(host, root);
        expect(hook().inspect([0, 0, 0]).functionProps).toEqual({ level: 1 });
    });
});
