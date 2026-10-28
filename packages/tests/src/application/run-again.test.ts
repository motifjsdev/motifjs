/**
 * @jest-environment jsdom
 */
import { Application, Component, useApplication } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

class Store { disposed = 0; dispose() { this.disposed++; } }

class Probe extends Component<HTMLDivElement> {
    mounted = 0;
    constructor() { super('div'); }
    onMounted() { this.mounted++; }
}

function stubLeave(c: Component): () => void {
    c.motif.options.transition.out({ keyframes: [{ opacity: 1 }, { opacity: 0 }], options: 100 });
    const target: any = new EventTarget();
    let done: () => void = () => { };
    target.finished = new Promise<void>(r => { done = r; });
    target.cancel = () => { target.dispatchEvent(new Event('cancel')); };
    let calls = 0;
    (c.element as any).animate = () => {
        if (calls++ === 0) return target;
        const later: any = new EventTarget();
        later.finished = Promise.resolve();
        setTimeout(() => later.dispatchEvent(new Event('finish')), 0);
        return later;
    };
    return () => { target.dispatchEvent(new Event('finish')); done(); };
}

async function waitsForLeave(): Promise<boolean> {
    const root = new Component('div');
    root.build();
    document.body.appendChild(root.element as Node);
    const a = new Component('p');
    root.controls.add(a);
    const finish = stubLeave(a);
    const b = new Component('span');
    a.dispose();
    root.controls.add(b);
    await tick();
    const waited = !(root.element as HTMLElement).contains(b.element as Node);
    finish();
    await tick();
    await root.dispose();
    return waited;
}

function host(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

function build(): Application {
    const builder = Application.CreateBuilder();
    builder.services.addSingleton(Store, Store);
    const app = builder.build();
    app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/b', control: () => new Component('p') }], mode: 'hash' });
    return app;
}

afterEach(async () => {
    const app = Application.main;
    if (app && app.state !== 'disposed') await app.dispose();
    document.body.innerHTML = '';
    window.location.hash = '';
});

describe('a disposed application runs again', () => {
    test('run() after dispose refills main, recreates services, starts a fresh router and disposes again', async () => {
        const app = build();
        app.run(host());
        const first = new Probe();
        app.insert(first);
        await app.router.navigate('/b');
        expect(app.router.uri).toBe('/b');
        const store = first.getService(Store);
        const closing = app.dispose();
        expect(app.dispose()).toBe(closing);
        await closing;
        expect(app.state).toBe('disposed');
        expect(Application.main).toBeNull();
        expect(store.disposed).toBe(1);
        expect(window.location.hash).toBe('');

        app.run(host());
        expect(app.state).toBe('running');
        expect(Application.main).toBe(app);
        expect(useApplication().application).toBe(app);
        const second = new Probe();
        app.insert(second);
        await tick(30);
        expect(second.mounted).toBe(1);
        const again = second.getService(Store);
        expect(again).not.toBe(store);
        expect(again.disposed).toBe(0);
        await app.router.navigate('/b');
        expect(app.router.uri).toBe('/b');

        const toast = new Probe();
        app.layer.controls.add(toast);
        expect(document.body.lastElementChild).toBe(app.layer.element);
        const closingAgain = app.dispose();
        expect(closingAgain).not.toBe(closing);
        await closingAgain;
        expect(app.state).toBe('disposed');
        expect(second.isDisposed).toBe(true);
        expect(toast.isDisposed).toBe(true);
        expect(again.disposed).toBe(1);
        expect(Application.main).toBeNull();
        expect(window.location.hash).toBe('');
    });

    test('a layer read after dispose is placed, moved after the new host by run() and removed by the next dispose', async () => {
        const app = build();
        app.run(host());
        await app.dispose();
        const layer = app.layer;
        const toast = new Probe();
        layer.controls.add(toast);
        await tick(30);
        expect(toast.mounted).toBe(1);
        expect(toast.getService(Store)).toBeInstanceOf(Store);
        const h = host();
        app.run(h);
        expect(app.layer).toBe(layer);
        expect(document.body.lastElementChild).toBe(layer.element);
        const element = layer.element as Node;
        expect(h.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
        await app.dispose();
        expect(layer.isDisposed).toBe(true);
        expect(toast.isDisposed).toBe(true);
        expect(element.isConnected).toBe(false);
    });

    test('the transition mode chosen with useTransitions applies again in the next life', async () => {
        const app = build();
        app.useTransitions({ mode: 'out-in' });
        app.run(host());
        expect(await waitsForLeave()).toBe(true);
        await app.dispose();
        expect(await waitsForLeave()).toBe(false);
        app.run(host());
        expect(await waitsForLeave()).toBe(true);
        await app.dispose();
        expect(await waitsForLeave()).toBe(false);
    });

    test('dispose() called again on a disposed application removes a layer read in between and leaves the address alone', async () => {
        const app = build();
        app.run(host());
        await app.dispose();
        const layer = app.layer;
        const toast = new Probe();
        layer.controls.add(toast);
        await tick(30);
        expect(toast.mounted).toBe(1);
        const element = layer.element as Node;
        window.location.hash = '#kept';
        const again = app.dispose();
        expect(app.state).toBe('disposed');
        await again;
        expect(layer.isDisposed).toBe(true);
        expect(toast.isDisposed).toBe(true);
        expect(element.isConnected).toBe(false);
        expect(window.location.hash).toBe('#kept');
        expect(Application.main).toBeNull();
    });

    test('a third dispose() while the second is still running joins it and disposes a late service once', async () => {
        const app = build();
        app.run(host());
        await app.dispose();
        const toast = new Probe();
        app.layer.controls.add(toast);
        const store = toast.getService(Store);
        const second = app.dispose();
        const third = app.dispose();
        expect(third).toBe(second);
        await second;
        expect(store.disposed).toBe(1);
        expect(toast.isDisposed).toBe(true);
        const fourth = app.dispose();
        expect(fourth).not.toBe(second);
        await fourth;
        expect(store.disposed).toBe(1);
    });

    test('run() after dispose is refused once a newer application exists, and the single-app rule holds in the second life', async () => {
        const old = build();
        old.run(host());
        await old.dispose();
        const fresh = Application.CreateBuilder().build();
        expect(() => old.run(host())).toThrow(/MJX405/);
        expect(old.state).toBe('disposed');
        await fresh.dispose();
        old.run(host());
        expect(Application.main).toBe(old);
        expect(() => Application.CreateBuilder()).toThrow(/MJX405/);
        await old.dispose();
        expect(Application.main).toBeNull();
    });
});
