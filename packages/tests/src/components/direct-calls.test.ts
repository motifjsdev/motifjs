import { Component, ComponentBase, reactive } from '@motifx/core';

const flush = () => new Promise(r => setTimeout(r, 0));

function host() {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    return root;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the core calling binding methods', () => {
    test('a method replaced on the bindings object is what the core calls', async () => {
        const root = host();
        const c = new Component('p');
        const b: any = c.bindings;
        const calls: string[] = [];
        for (const name of ['add', 'activateAll', 'deactivateAll', 'reActivateAll', 'remove']) {
            const orig = b[name];
            b[name] = function (this: any, ...args: any[]) { calls.push(name); return orig.apply(this, args); };
        }
        const state = reactive({ t: 'a', cls: true, attr: 'x' });
        c.bindings.text(() => state.t);
        c.class.add((() => (state.cls ? 'on' : '')) as any);
        c.attr.add({ title: () => state.attr });
        root.controls.add(c);
        c.attr.add({ title: () => state.attr + '!' });
        root.controls.silentDetach(c);
        root.controls.add(c);
        state.t = 'b';
        state.cls = false;
        await flush();
        const el = c.element as HTMLElement;
        expect(el.textContent).toBe('b');
        expect(el.className).toBe('');
        expect(el.getAttribute('title')).toBe('x!');
        await c.dispose();
        expect(calls).toEqual(['add', 'add', 'add', 'activateAll', 'remove', 'add', 'deactivateAll']);
        root.dispose();
    });

    test('a subclass of the bindings object has its overrides called by the core', async () => {
        const root = host();
        const c = new Component('p');
        const Base: any = Object.getPrototypeOf(c.bindings).constructor;
        const calls: string[] = [];
        class Mine extends (Base as new (...a: any[]) => any) {
            add(...args: any[]) { calls.push('add'); return super.add(...args); }
            activateAll() { calls.push('activateAll'); return super.activateAll(); }
        }
        c.bindings = new Mine(c) as any;
        const state = reactive({ t: 'a' });
        c.bindings.text(() => state.t);
        root.controls.add(c);
        expect(calls).toEqual(['add', 'activateAll']);
        state.t = 'b';
        await flush();
        expect((c.element as HTMLElement).textContent).toBe('b');
        await c.dispose();
        root.dispose();
    });

    test('methods taken off the bindings object keep working and keep their identity', async () => {
        const root = host();
        const c = new Component('p');
        root.controls.add(c);
        const { text, add } = c.bindings as any;
        expect((c.bindings as any).add).toBe(add);
        expect((c.bindings as any).text).toBe(text);
        const state = reactive({ t: 'a' });
        text(() => state.t);
        state.t = 'b';
        await flush();
        expect((c.element as HTMLElement).textContent).toBe('b');
        const n = c.bindings.items.length;
        add({ propertyName: 'x', dataSource: null, activate() { }, deactivate() { }, reActivate() { } });
        expect(c.bindings.items.length).toBe(n + 1);
        await c.dispose();
        root.dispose();
    });

    test('bindings reached through reactive state still bind', async () => {
        const root = host();
        const c = new Component('p');
        root.controls.add(c);
        const s = reactive({ c: c as any });
        const state = reactive({ t: 'a' });
        s.c.bindings.text(() => state.t);
        state.t = 'b';
        await flush();
        expect((c.element as HTMLElement).textContent).toBe('b');
        await c.dispose();
        root.dispose();
    });

    test('a reactive class and attribute stop with the component', async () => {
        const root = host();
        const c = new Component('p');
        root.controls.add(c);
        const state = reactive({ on: true, t: 'a' });
        c.class.add({ on: () => state.on } as any);
        c.attr.add({ title: () => state.t });
        const el = c.element as HTMLElement;
        expect(el.className).toBe('on');
        await c.dispose();
        state.on = false;
        state.t = 'b';
        await flush();
        expect(el.className).toBe('on');
        expect(el.getAttribute('title')).toBe('a');
        root.dispose();
    });
});

describe('the core calling component event methods', () => {
    const emitterOf = (c: ComponentBase) => (c as any)._base.emiters;

    test('a fire replaced on the emitter is what lifecycle events go through', () => {
        const root = host();
        const seen: string[] = [];
        const c = new Component('p', { onBuilt: () => seen.push('built') } as any);
        const em = emitterOf(c);
        const orig = em.fire;
        em.fire = function (this: any, name: string, ev: any) { seen.push('fire:' + name); return orig.call(this, name, ev); };
        root.controls.add(c);
        expect(seen.some(x => x.startsWith('fire:'))).toBe(true);
        root.dispose();
    });

    test('a clear replaced on the emitter is what dispose calls', async () => {
        const root = host();
        const c = new Component('p');
        root.controls.add(c);
        const em = emitterOf(c);
        em.on('ping', () => { });
        let cleared = 0;
        const orig = em.clear;
        em.clear = function (this: any, ...args: any[]) { cleared++; return orig.apply(this, args); };
        await c.dispose();
        expect(cleared).toBeGreaterThan(0);
        root.dispose();
    });

    test('listeners added with on run on fire and stop after off and clear', () => {
        const c = new Component('p');
        const em = emitterOf(c);
        const seen: number[] = [];
        const cb = (e: any) => seen.push(e.n);
        em.on('Ping', cb);
        em.fire('ping', { n: 1 });
        em.off('ping', cb);
        em.fire('ping', { n: 2 });
        em.on('ping', cb);
        em.clear();
        em.fire('ping', { n: 3 });
        em.on('ping', cb);
        em.clear('ping');
        em.fire('ping', { n: 4 });
        expect(seen).toEqual([1]);
        c.dispose();
    });

    test('the emitter calls its own replaced methods from inside', () => {
        const c = new Component('p');
        const em = emitterOf(c);
        const calls: string[] = [];
        for (const name of ['createEvent', 'getOrCreateEmitter', 'clear']) {
            const orig = em[name];
            em[name] = function (this: any, ...args: any[]) { calls.push(name + ':' + (args[0] ?? '')); return orig.apply(this, args); };
        }
        em.on('Ping', () => { });
        em.on('pong', () => { });
        em.clear();
        expect(calls).toEqual(['createEvent:Ping', 'getOrCreateEmitter:ping', 'createEvent:pong', 'getOrCreateEmitter:pong', 'clear:', 'clear:ping', 'clear:pong']);
        c.dispose();
    });

    test('emitter methods taken off still work', () => {
        const c = new Component('p');
        const { on, fire } = emitterOf(c);
        const seen: number[] = [];
        on('ping', (e: any) => seen.push(e.n));
        fire('ping', { n: 5 });
        expect(seen).toEqual([5]);
        c.dispose();
    });
});
