import { Component, ComponentBase, DisposableStore, reactive } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async () => { await tick(); await tick(); };

function host() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    return root;
}

describe('children added and removed through controls', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('controladded fires for children added before and after build, controlremoved on detach only', async () => {
        const parent = new Component('div', {});
        const log: string[] = [];
        parent.motif.on('controladded' as any, (_s: any, e: any) => log.push('added:' + e.control.element.tagName));
        parent.motif.on('controlremoved' as any, (_s: any, e: any) => log.push('removed:' + e.control.element.tagName));
        const a = new Component('i', {});
        parent.controls.add(a);
        host().controls.add(parent);
        await settle();
        const b = new Component('b', {});
        const s = new Component('s', {});
        parent.controls.add(b, s);
        await settle();
        await parent.controls.remove(b);
        parent.controls.detach(s);
        await settle();
        expect(log).toEqual(['added:I', 'added:B', 'added:S', 'removed:S']);
        expect((parent.element as HTMLElement).innerHTML).toBe('<i></i>');
    });

    test('a child added after build is built and placed at once', async () => {
        const parent = new Component('div', {});
        host().controls.add(parent);
        await settle();
        const c = new Component('span', {});
        parent.controls.add(c);
        expect(c.isBuilt).toBe(true);
        expect((parent.element as HTMLElement).firstChild).toBe(c.element);
    });

    test('a child added while the parent waits is built when the wait ends', async () => {
        const st = reactive({ wait: true });
        const parent = new Component('div', { 'x-wait': () => st.wait } as any);
        const root = host();
        root.controls.add(parent);
        await settle();
        const c = new Component('span', {});
        parent.controls.add(c);
        expect(c.isBuilt).toBe(false);
        st.wait = false;
        await settle();
        expect(c.isBuilt).toBe(true);
        expect((parent.element as HTMLElement).contains(c.element as any)).toBe(true);
    });

    test('a child added under a waiting grandparent stays out of view and appears when the wait ends', async () => {
        const parent = new Component('div', {});
        const child = new Component('section', {});
        parent.controls.add(child);
        host().controls.add(parent);
        await settle();
        parent.isWait = true;
        await settle();
        const c = new Component('span', {});
        child.controls.add(c);
        expect((c.element as any).isConnected).toBe(false);
        expect(child.controls.items).toContain(c);
        parent.isWait = false;
        await settle();
        expect((c.element as any).isConnected).toBe(true);
    });

    test('controladded without a listener does not throw and children still build', async () => {
        const parent = new Component('ul', {});
        host().controls.add(parent);
        await settle();
        for (let i = 0; i < 3; i++) parent.controls.add(new Component('li', {}));
        expect((parent.element as HTMLElement).children.length).toBe(3);
    });
});

describe('disposables owned by a component', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('registered disposables run once, in registration order, when the component is disposed', async () => {
        const c = new Component('div', {});
        host().controls.add(c);
        await settle();
        const log: number[] = [];
        c.motif.register({ dispose: () => log.push(1) });
        c.motif.register({ dispose: () => log.push(2) });
        c.motif.register({ dispose: () => log.push(3) });
        await c.dispose();
        await settle();
        expect(log).toEqual([1, 2, 3]);
    });

    test('a component that registered nothing disposes cleanly', async () => {
        const c = new Component('div', {});
        host().controls.add(c);
        await settle();
        await expect(c.dispose()).resolves.not.toThrow();
        expect(c.isDisposed).toBe(true);
    });

    test('DisposableStore: add, delete, detach, clear and dispose', () => {
        const store = new DisposableStore();
        const log: string[] = [];
        const a = { dispose: () => log.push('a') };
        const b = { dispose: () => log.push('b') };
        const c = { dispose: () => log.push('c') };
        store.clear();
        expect(store.isDisposed).toBe(false);
        store.add(a); store.add(b); store.add(c);
        store.delete(b);
        expect(log).toEqual(['b']);
        store.detach(c);
        store.clear();
        expect(log).toEqual(['b', 'a']);
        store.add(c);
        store.dispose();
        expect(log).toEqual(['b', 'a', 'c']);
        expect(store.isDisposed).toBe(true);
        store.dispose();
        expect(log).toEqual(['b', 'a', 'c']);
    });

    test('DisposableStore: delete and detach on an empty store', () => {
        const store = new DisposableStore();
        const log: string[] = [];
        const a = { dispose: () => log.push('a') };
        store.detach(a);
        expect(log).toEqual([]);
        store.delete(a);
        expect(log).toEqual(['a']);
        store.dispose();
        expect(store.isDisposed).toBe(true);
    });

    test('DisposableStore: a failing item does not stop the others', () => {
        const store = new DisposableStore();
        const log: string[] = [];
        store.add({ dispose: () => { log.push('x'); throw new Error('boom'); } });
        store.add({ dispose: () => log.push('y') });
        expect(() => store.clear()).toThrow('boom');
        expect(log).toEqual(['x', 'y']);
    });

    test('a disposable registered while the store disposes still runs', () => {
        const store = new DisposableStore();
        const log: string[] = [];
        store.add({ dispose: () => { log.push('first'); store.add({ dispose: () => log.push('late') }); } });
        store.dispose();
        expect(log[0]).toBe('first');
        expect(store.isDisposed).toBe(true);
    });
});

describe('lifecycle events subscribed with motif.on', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('x: lifecycle listeners fire in order and off removes them', async () => {
        const c = new Component('div', {});
        const log: string[] = [];
        const built = () => log.push('built');
        c.motif.on('x:building' as any, () => log.push('building'));
        c.motif.on('x:built' as any, built);
        c.motif.on('x:visibilityChanged' as any, (_s: any, e: any) => log.push('visible:' + e.visible));
        c.motif.on('x:disposing' as any, () => log.push('disposing'));
        c.motif.on('x:disposed' as any, () => log.push('disposed'));
        c.motif.off('x:built' as any, built);
        host().controls.add(c);
        await settle();
        await c.motif.hide();
        await settle();
        await c.dispose();
        await settle();
        expect(log).toEqual(['building', 'visible:false', 'disposing', 'disposed']);
    });

    test('a component with no lifecycle listeners builds, hides and disposes', async () => {
        const c = new Component('div', {});
        host().controls.add(c);
        await settle();
        await c.motif.hide();
        await c.motif.show();
        await c.dispose();
        expect(c.isDisposed).toBe(true);
    });

    test('off before any on is harmless', async () => {
        const c = new Component('div', {});
        expect(() => c.motif.off('x:built' as any, () => { })).not.toThrow();
        host().controls.add(c);
        await settle();
        expect(c.isBuilt).toBe(true);
    });

    test('listeners added after dispose do not fire', async () => {
        const c = new Component('div', {});
        host().controls.add(c);
        await settle();
        await c.dispose();
        const log: string[] = [];
        c.motif.on('x:disposed' as any, () => log.push('late'));
        await settle();
        expect(log).toEqual([]);
    });

    test('class component hooks and x: listeners both run', async () => {
        const log: string[] = [];
        class Card extends Component<HTMLDivElement> {
            constructor() { super('div', {}); }
            onBuilt() { log.push('hook'); }
        }
        const c = new Card();
        c.motif.on('x:built' as any, () => log.push('listener'));
        host().controls.add(c);
        await settle();
        expect(log.sort()).toEqual(['hook', 'listener']);
        expect(c).toBeInstanceOf(ComponentBase);
    });
});
