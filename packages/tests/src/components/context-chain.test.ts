import { Application, Component, ComponentBase } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function tree() {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    const mid = new Component('div');
    const leaf = new Component('span');
    root.controls.add(mid);
    mid.controls.add(leaf);
    return { root, mid, leaf };
}

beforeAll(() => { Application.CreateBuilder().build(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('the application a component reaches through context', () => {
    test('a nested component reaches the main application and keeps one view of it', () => {
        const { root, leaf } = tree();
        const ctx: any = leaf.context;
        expect(ctx).toBeTruthy();
        expect(ctx.provider).toBe(Application.main.provider);
        expect(leaf.context).toBe(ctx);
        expect(ctx).not.toBe(Application.main);
        root.dispose();
    });

    test('a subscription made through context ends with the component', async () => {
        const { root, mid, leaf } = tree();
        const calls: string[] = [];
        (leaf.context as any).on('ctx-test', () => calls.push('leaf'));
        (root.context as any).on('ctx-test', () => calls.push('root'));
        Application.main.fire('ctx-test');
        expect(calls).toEqual(['leaf', 'root']);
        mid.dispose();
        await settle();
        Application.main.fire('ctx-test');
        expect(calls).toEqual(['leaf', 'root', 'root']);
        root.dispose();
    });

    test('a parent that provides its own context is what its children see', () => {
        const other: any = { tag: 'other', on: () => () => { } };
        class Island extends Component {
            constructor() { super('div'); }
            override get context(): any { return other; }
        }
        const host = document.createElement('section');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        const island = new Island();
        const deep = new Component('i');
        const deeper = new Component('b');
        root.controls.add(island);
        island.controls.add(deep);
        deep.controls.add(deeper);
        expect((deeper.context as any).tag).toBe('other');
        expect((deep.context as any).tag).toBe('other');
        expect((root.context as any).tag).toBeUndefined();
        root.dispose();
    });

    test('a parent whose context calls super passes the main application on', () => {
        class Wrap extends Component {
            constructor() { super('div'); }
            override get context(): any { return super.context; }
        }
        const host = document.createElement('section');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        const wrap = new Wrap();
        const kid = new Component('i');
        root.controls.add(wrap);
        wrap.controls.add(kid);
        expect((kid.context as any).provider).toBe(Application.main.provider);
        root.dispose();
    });

    test('reading context on a leaf does not give its parents a view of their own', () => {
        const { root, mid, leaf } = tree();
        void leaf.context;
        expect((mid as any)._scopedContext).toBeUndefined();
        expect((root as any)._scopedContext).toBeUndefined();
        void mid.context;
        expect((mid as any)._scopedContext).toBeDefined();
        root.dispose();
    });

    test('a component without a parent reaches the main application', () => {
        const lone: ComponentBase = new Component('div');
        expect((lone.context as any).provider).toBe(Application.main.provider);
    });
});
