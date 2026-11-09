import * as motif from '@motifx/core';
import { Component, reactive, Transporter } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { await tick(); await tick(); await tick(); };

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'AttrHold.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(child: any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root: any = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

function submit(form: HTMLFormElement) {
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
}

describe('attr.hold keeps a value over the component\'s own and gives the own value back', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('compiled tags: a bound value, static values and a missing attribute are held and come back exactly', async () => {
        const state = reactive({ busy: false });
        const Sample = evalJsx(`function Sample(){ return <section>
            <button disabled={() => state.busy}>Save</button>
            <div tabindex="0" role="button">Custom</div>
            <input type="text" disabled />
        </section>; }`, 'Sample', { state });
        const section: any = Sample();
        mount(section);
        await settle();
        const [button, div, input] = section.controls.items;
        const bindings = button.bindings.items.length;
        const fields = Object.keys(button.attr).sort();

        const a = button.attr.hold({ disabled: true });
        const b = div.attr.hold({ tabindex: -1, 'aria-disabled': 'true' });
        const c = input.attr.hold({ disabled: true });
        expect(button.element.disabled).toBe(true);
        expect(div.element.getAttribute('tabindex')).toBe('-1');
        expect(div.element.getAttribute('aria-disabled')).toBe('true');
        expect(input.element.disabled).toBe(true);
        expect(button.bindings.items.length).toBe(bindings);

        state.busy = true;
        await settle();
        a.dispose(); b.dispose(); c.dispose();
        expect(button.element.disabled).toBe(true);
        state.busy = false;
        await settle();
        expect(button.element.disabled).toBe(false);
        expect(div.element.getAttribute('tabindex')).toBe('0');
        expect(div.element.hasAttribute('aria-disabled')).toBe(false);
        expect(div.element.getAttribute('role')).toBe('button');
        expect(input.element.disabled).toBe(true);

        a.dispose(); b.dispose();
        expect(button.element.disabled).toBe(false);
        expect(div.element.getAttribute('tabindex')).toBe('0');
        expect(Object.keys(button.attr).sort()).toEqual(fields);
    });

    test('own changes, reState, setState and a transport do not reach the element while held', async () => {
        const state = reactive({ busy: false });
        const button: any = new Component('button');
        button.attr.add({ disabled: () => state.busy });
        const slot: any = new Component('div');
        const page: any = new Component('div');
        page.controls.add(slot);
        const { root } = mount(button);
        mount(page);
        await settle();
        const held = button.attr.hold({ disabled: true });

        state.busy = true; await settle();
        state.busy = false; await settle();
        expect(button.element.disabled).toBe(true);
        root.reState(); await settle();
        state.busy = true; await settle();
        state.busy = false; await settle();
        expect(button.element.disabled).toBe(true);
        root.setState(); await settle();
        state.busy = true; await settle();
        state.busy = false; await settle();
        expect(button.element.disabled).toBe(true);
        Transporter.transport(button, slot); await settle();
        state.busy = true; await settle();
        state.busy = false; await settle();
        expect(slot.element.contains(button.element)).toBe(true);
        expect(button.element.disabled).toBe(true);

        held.dispose();
        expect(button.element.disabled).toBe(false);
        state.busy = true; await settle();
        expect(button.element.disabled).toBe(true);
    });

    test('attr.add and attr.remove by the component while held change what comes back, not the element', async () => {
        const state = reactive({ busy: false, title: 'a' });
        const button: any = new Component('button');
        button.attr.add({ disabled: () => state.busy, title: 'own', tabindex: '0' });
        mount(button);
        await settle();
        const held = button.attr.hold({ disabled: true, title: 'held', tabindex: -1 });

        button.attr.add({ disabled: false });
        button.attr.add({ title: () => state.title });
        button.attr.remove('tabindex');
        await settle();
        expect(button.element.disabled).toBe(true);
        expect(button.element.getAttribute('title')).toBe('held');
        expect(button.element.getAttribute('tabindex')).toBe('-1');
        state.title = 'b';
        await settle();
        expect(button.element.getAttribute('title')).toBe('held');

        held.dispose();
        expect(button.element.disabled).toBe(false);
        expect(button.element.getAttribute('title')).toBe('b');
        expect(button.element.hasAttribute('tabindex')).toBe(false);
        state.title = 'c'; state.busy = true;
        await settle();
        expect(button.element.getAttribute('title')).toBe('c');
        expect(button.element.disabled).toBe(false);
    });

    test('nested holds: the newest one shows and the last release gives the own value back, in either order', async () => {
        const state = reactive({ title: 'a' });
        const div: any = new Component('div');
        div.attr.add({ tabindex: '0', title: () => state.title });
        mount(div);
        await settle();

        const outer = div.attr.hold({ tabindex: -1, title: 'outer' });
        const inner = div.attr.hold({ tabindex: -2, 'aria-busy': 'true' });
        expect(div.element.getAttribute('tabindex')).toBe('-2');
        expect(div.element.getAttribute('aria-busy')).toBe('true');
        expect(div.element.getAttribute('title')).toBe('outer');
        state.title = 'b';
        await settle();
        outer.dispose();
        expect(div.element.getAttribute('tabindex')).toBe('-2');
        expect(div.element.getAttribute('title')).toBe('b');
        inner.dispose();
        expect(div.element.getAttribute('tabindex')).toBe('0');
        expect(div.element.hasAttribute('aria-busy')).toBe(false);

        const first = div.attr.hold({ tabindex: -1, title: 'first' });
        const second = div.attr.hold({ tabindex: -2, title: 'second' });
        state.title = 'c';
        await settle();
        first.dispose();
        expect(div.element.getAttribute('title')).toBe('second');
        state.title = 'd';
        await settle();
        expect(div.element.getAttribute('tabindex')).toBe('-2');
        second.dispose();
        expect(div.element.getAttribute('tabindex')).toBe('0');
        expect(div.element.getAttribute('title')).toBe('d');

        const older = div.attr.hold({ tabindex: -1 });
        const newer = div.attr.hold({ tabindex: -2 });
        newer.dispose();
        expect(div.element.getAttribute('tabindex')).toBe('-1');
        older.dispose();
        expect(div.element.getAttribute('tabindex')).toBe('0');
        state.title = 'e';
        await settle();
        expect(div.element.getAttribute('title')).toBe('e');
    });

    test('a binding that writes the same state as an element property does not pierce the hold', async () => {
        const state = reactive({ busy: false, index: 3 });
        const button: any = new Component('button');
        button.bindings.add('disabled', () => state.busy);
        button.bindings.add('tabIndex', () => state.index);
        const { root } = mount(button);
        await settle();
        expect(button.element.getAttribute('tabindex')).toBe('3');
        const held = button.attr.hold({ disabled: true, tabindex: -1 });

        state.busy = true; await settle();
        state.busy = false; state.index = 5; await settle();
        root.reState(); await settle();
        expect(button.element.disabled).toBe(true);
        expect(button.element.getAttribute('tabindex')).toBe('-1');

        held.dispose();
        expect(button.element.disabled).toBe(false);
        expect(button.element.getAttribute('tabindex')).toBe('5');
        state.busy = true; state.index = 7;
        await settle();
        expect(button.element.disabled).toBe(true);
        expect(button.element.getAttribute('tabindex')).toBe('7');
    });

    test('registered on the holder it is released with the holder; releasing after the target is gone does nothing', async () => {
        const target: any = new Component('button');
        target.attr.add({ tabindex: '0' });
        const holder: any = new Component('div');
        mount(target);
        mount(holder);
        await settle();
        holder.motif.register(target.attr.hold({ tabindex: -1 }));
        expect(target.element.getAttribute('tabindex')).toBe('-1');
        await holder.dispose();
        await settle();
        expect(target.element.getAttribute('tabindex')).toBe('0');

        const gone: any = new Component('button');
        gone.attr.add({ disabled: () => false });
        mount(gone);
        await settle();
        const held = gone.attr.hold({ disabled: true });
        await gone.dispose();
        await settle();
        expect(() => { held.dispose(); held.dispose(); }).not.toThrow();

        const next: any = new Component('button');
        next.attr.add({ title: 'own' });
        mount(next);
        await settle();
        next.attr.add({ title: 'again' });
        expect(next.element.getAttribute('title')).toBe('again');
    });

    test('hidden and shown, or held before it is in the tree, the hold stays', async () => {
        const state = reactive({ busy: false });
        const shown: any = new Component('button');
        shown.attr.add({ disabled: () => state.busy });
        mount(shown);
        await settle();
        const held = shown.attr.hold({ disabled: true });
        shown.isWait = true; await settle();
        state.busy = true; await settle();
        state.busy = false; await settle();
        shown.isWait = false; await settle();
        expect(shown.element.isConnected).toBe(true);
        expect(shown.element.disabled).toBe(true);
        held.dispose();
        expect(shown.element.disabled).toBe(false);

        const early: any = new Component('button');
        early.attr.add({ disabled: () => state.busy });
        const before = early.attr.hold({ disabled: true });
        mount(early);
        await settle();
        expect(early.element.disabled).toBe(true);
        state.busy = true; await settle();
        before.dispose();
        expect(early.element.disabled).toBe(true);
    });

    test('a checked state, a typed value and a method key', async () => {
        const state = reactive({ on: true, focus: false });
        const box: any = new Component('input');
        box.attr.add({ type: 'checkbox', checked: () => state.on });
        const field: any = new Component('input');
        const first: any = new Component('button');
        const second: any = new Component('button');
        second.attr.add({ focus: () => state.focus });
        const wrap: any = new Component('div');
        wrap.controls.add(box); wrap.controls.add(field); wrap.controls.add(first); wrap.controls.add(second);
        mount(wrap);
        await settle();

        const checked = box.attr.hold({ checked: false });
        state.on = false; await settle();
        state.on = true; await settle();
        expect(box.element.checked).toBe(false);
        checked.dispose();
        expect(box.element.checked).toBe(true);

        field.element.value = 'typed';
        const value = field.attr.hold({ value: 'held' });
        expect(field.element.value).toBe('held');
        value.dispose();
        expect(field.element.value).toBe('typed');

        first.element.focus();
        const focus = second.attr.hold({ focus: false });
        state.focus = true; await settle();
        expect(document.activeElement).toBe(first.element);
        focus.dispose(); await settle();
        expect(document.activeElement).toBe(second.element);

        const third: any = new Component('button');
        third.attr.add({ focus: true });
        wrap.controls.add(third);
        await settle();
        first.element.focus();
        third.attr.hold({ focus: false }).dispose();
        await settle();
        expect(document.activeElement).toBe(first.element);
    });

    test('what attr never wrote comes back as it was, and holding leaves no record behind', async () => {
        const div: any = new Component('div');
        div.attr.add({ 'aria-pressed': false, tabindex: '0' });
        const plain: any = new Component('div');
        mount(div);
        mount(plain);
        await settle();
        div.element.setAttribute('data-x', '1');

        const held = div.attr.hold({ 'aria-pressed': 'true', 'data-x': '2', hidden: true, tabindex: -1 });
        expect(div.element.getAttribute('aria-pressed')).toBe('true');
        expect(div.element.getAttribute('data-x')).toBe('2');
        expect(div.element.hasAttribute('hidden')).toBe(true);
        expect(div.attr.attributes).toEqual([{ name: 'aria-pressed', value: false }, { name: 'tabindex', value: '0' }]);
        expect(div.attr.get('tabindex')).toBe('-1');
        held.dispose();
        expect(div.element.getAttribute('aria-pressed')).toBe('false');
        expect(div.element.getAttribute('data-x')).toBe('1');
        expect(div.element.hasAttribute('hidden')).toBe(false);
        expect(div.attr.attributes).toEqual([{ name: 'aria-pressed', value: false }, { name: 'tabindex', value: '0' }]);
        expect(div.attr.get('tabindex')).toBe('0');

        const unset = div.attr.hold({ tabindex: null });
        expect(div.element.hasAttribute('tabindex')).toBe(false);
        expect(div.attr.get('tabindex')).toBeNull();
        unset.dispose();
        expect(div.attr.get('tabindex')).toBe('0');

        const cover = plain.attr.hold({ tabindex: -1, 'aria-disabled': 'true' });
        expect(plain.element.getAttribute('tabindex')).toBe('-1');
        expect(Object.keys(plain.attr)).toEqual(['_parent']);
        cover.dispose();
        expect(plain.element.attributes.length).toBe(0);
        expect(Object.keys(plain.attr)).toEqual(['_parent']);
    });

    test('a form action handler is put aside while its key is held and works again afterwards', async () => {
        const calls: string[] = [];
        const first = () => { calls.push('first'); };
        const second = () => { calls.push('second'); };
        const form: any = new Component('form');
        form.attr.add({ action: () => first });
        mount(form);
        await settle();
        submit(form.element);
        expect(calls).toEqual(['first']);

        const held = form.attr.hold({ action: null });
        submit(form.element);
        expect(calls).toEqual(['first']);
        held.dispose();
        submit(form.element);
        expect(calls).toEqual(['first', 'first']);

        const again = form.attr.hold({ action: null });
        form.attr.add({ action: () => second });
        await settle();
        submit(form.element);
        expect(calls).toEqual(['first', 'first']);
        again.dispose();
        submit(form.element);
        expect(calls).toEqual(['first', 'first', 'second']);
    });
});
