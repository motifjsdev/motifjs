import { Component, reactive } from '@motifx/core';

const flush = () => new Promise(r => setTimeout(r, 0));

function host() {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    return root;
}

function spy(c: Component) {
    const el = c.element as HTMLElement;
    const log: string[] = [];
    const list = el.classList;
    const add = list.add.bind(list), remove = list.remove.bind(list);
    (list as any).add = (...n: string[]) => { log.push('+' + n.join(',')); add(...n); };
    (list as any).remove = (...n: string[]) => { log.push('-' + n.join(',')); remove(...n); };
    const setAttr = el.setAttribute.bind(el), removeAttr = el.removeAttribute.bind(el);
    el.setAttribute = (k: string, v: string) => { if (k === 'class') log.push('=' + v); setAttr(k, v); };
    el.removeAttribute = (k: string) => { if (k === 'class') log.push('=∅'); removeAttr(k); };
    const step = (label: string) => log.push(`[${label}] ${el.getAttribute('class') ?? '∅'}`);
    return { log, step, el };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('reactive class sources', () => {
    test('one source toggles its class and swaps between classes', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ on: true, kind: 'a' });
        const { log, step } = spy(c);
        c.class.add(() => (s.on ? 'danger ' + s.kind : s.kind));
        root.controls.add(c);
        step('built');
        s.on = false; await flush(); step('off');
        s.kind = 'b'; await flush(); step('kind b');
        s.on = true; await flush(); step('on');
        expect(c.class.has('danger')).toBe(true);
        expect(log).toEqual(EXPECTED.one);
        root.dispose();
    });

    test('a static class and a reactive source share a name', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ on: true });
        const { log, step } = spy(c);
        c.class.add(() => (s.on ? 'x' : ''));
        root.controls.add(c);
        step('built');
        c.class.add('x');
        step('static x');
        s.on = false; await flush(); step('source off');
        c.class.remove('x');
        step('static removed');
        s.on = true; await flush(); step('source on');
        expect(log).toEqual(EXPECTED.staticShare);
        root.dispose();
    });

    test('a static class before a reactive source with the same name', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ on: false });
        const { log, step } = spy(c);
        c.class.add('x');
        root.controls.add(c);
        step('built');
        c.class.add(() => (s.on ? 'x y' : 'y'));
        step('source');
        s.on = true; await flush(); step('on');
        c.class.remove('x');
        step('static removed');
        s.on = false; await flush(); step('off');
        expect(log).toEqual(EXPECTED.staticFirst);
        root.dispose();
    });

    test('two reactive sources share a name', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ a: true, b: true });
        const { log, step } = spy(c);
        c.class.add(() => (s.a ? 'x a' : 'a'));
        root.controls.add(c);
        step('built');
        c.class.add(() => (s.b ? 'x b' : 'b'));
        step('second');
        s.a = false; await flush(); step('a off');
        s.b = false; await flush(); step('b off');
        s.a = true; await flush(); step('a on');
        expect(log).toEqual(EXPECTED.twoSources);
        root.dispose();
    });

    test('remove of a name and of everything with a reactive source', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ on: true });
        const { log, step } = spy(c);
        c.class.add(() => (s.on ? 'x y' : 'y'));
        root.controls.add(c);
        step('built');
        c.class.remove('x');
        step('remove x');
        c.class.remove(['y', 'z']);
        step('remove [y,z]');
        s.on = false; await flush(); step('off');
        s.on = true; await flush(); step('on');
        c.class.remove('**');
        step('remove all');
        s.on = false; await flush(); step('off after all');
        s.on = true; await flush(); step('on after all');
        c.class.add('k');
        step('static after all');
        expect(log).toEqual(EXPECTED.removes);
        root.dispose();
    });

    test('keyed reactive classes inside an array', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ on: true, other: false });
        const { log, step } = spy(c);
        c.class.add(['base', { active: () => s.on, 'm n': () => s.other }]);
        root.controls.add(c);
        step('built');
        s.on = false; s.other = true; await flush(); step('flip');
        s.on = true; await flush(); step('on');
        expect(log).toEqual(EXPECTED.keyed);
        root.dispose();
    });

    test('a source before build, detach and add back, then dispose', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ on: true });
        const { log, step } = spy(c);
        c.class.add(() => (s.on ? 'x' : 'y'));
        step('before build');
        root.controls.add(c);
        step('built');
        root.controls.silentDetach(c);
        step('detached');
        s.on = false; await flush(); step('off while detached');
        root.controls.add(c);
        step('added back');
        s.on = true; await flush(); step('on');
        await c.dispose();
        s.on = false; await flush(); step('after dispose');
        expect(log).toEqual(EXPECTED.lifecycle);
        root.dispose();
    });

    test('a source on a hidden component and on show', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ on: true });
        c.class.add(() => (s.on ? 'x' : 'y'));
        root.controls.add(c);
        const { log, step } = spy(c);
        c.motif.hide();
        s.on = false; await flush(); step('hidden off');
        c.motif.show();
        step('shown');
        s.on = true; await flush(); step('on');
        expect(log).toEqual(EXPECTED.hidden);
        root.dispose();
    });

    test('a failing source counts as no classes', async () => {
        const root = host();
        const c = new Component('p');
        const s = reactive({ fail: false });
        const { log, step } = spy(c);
        c.class.add(() => { if (s.fail) throw new Error('x'); return 'ok'; });
        root.controls.add(c);
        step('built');
        s.fail = true; await flush(); step('failing');
        s.fail = false; await flush(); step('recovered');
        expect(log).toEqual(EXPECTED.failing);
        root.dispose();
    });
});

const EXPECTED: Record<string, string[]> = {
    one: ["+danger", "+a", "[built] danger a", "-danger", "[off] a", "-a", "+b", "[kind b] b", "+danger", "[on] b danger"],
    staticShare: ["+x", "[built] x", "[static x] x", "[source off] x", "-x", "[static removed] ", "+x", "[source on] x"],
    staticFirst: ["=x", "[built] x", "+y", "[source] x y", "[on] x y", "[static removed] x y", "-x", "[off] y"],
    twoSources: ["+x", "+a", "[built] x a", "+b", "[second] x a b", "[a off] x a b", "-x", "[b off] a b", "+x", "[a on] a b x"],
    removes: ["+x", "+y", "[built] x y", "[remove x] x y", "[remove [y,z]] x y", "-x", "[off] y", "+x", "[on] y x", "-x", "-y", "-x", "-y", "=∅", "[remove all] ∅", "[off after all] ∅", "[on after all] ∅", "=k", "[static after all] k"],
    keyed: ["+active", "+base", "[built] active base", "-active", "+m", "+n", "[flip] base m n", "+active", "[on] base m n active"],
    lifecycle: ["+x", "[before build] x", "[built] x", "[detached] x", "-x", "+y", "[off while detached] y", "[added back] y", "-y", "+x", "[on] x", "-x", "[after dispose] "],
    hidden: ["-x", "+y", "[hidden off] y", "[shown] y", "-y", "+x", "[on] x"],
    failing: ["+ok", "[built] ok", "-ok", "[failing] ", "+ok", "[recovered] ok"],
};
