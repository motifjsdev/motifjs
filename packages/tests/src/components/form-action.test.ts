/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, errorHandler, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function compile(body: string, extra: Record<string, any> = {}) {
    const out = new compiler.Compiler().start(`function A(){ return ${body}; }`, 'V.tsx');
    const code = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = Object.keys(extra);
    return new Function('_mc', '_mf', '_mfc', '_mv', 'Component', ...names, `"use strict";${code}\nreturn A;`)(
        motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component, ...names.map(n => extra[n]));
}

function mount(child: any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

function dispatchSubmit(form: HTMLFormElement, submitter: HTMLElement | null = null) {
    const e = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter });
    form.dispatchEvent(e);
    return e;
}

let reported: any[];
let unbind: () => void;
let log: jest.SpyInstance;
let lastSubmit: SubmitEvent | null;
const remember = (e: Event) => { lastSubmit = e as SubmitEvent; };

beforeEach(() => {
    reported = [];
    lastSubmit = null;
    unbind = errorHandler.addListener(e => reported.push(e));
    log = jest.spyOn(console, 'error').mockImplementation(() => { });
    errorHandler.setDevelopmentMode(false);
});

afterEach(() => {
    unbind();
    log.mockRestore();
    document.removeEventListener('submit', remember);
    document.body.innerHTML = '';
});

describe('a function given to action is the submit handler', () => {
    test('it is not called while building and runs on submit with the FormData', async () => {
        const calls: FormData[] = [];
        const search = (data: FormData) => { calls.push(data); };
        const A = compile(`<form id="f" action={search}><input name="q" /><button type="submit">Go</button></form>`, { search });
        const { host, root } = mount(A());
        const form = host.querySelector('#f') as HTMLFormElement;
        expect(calls.length).toBe(0);
        expect(form.hasAttribute('action')).toBe(false);
        (form.querySelector('input') as HTMLInputElement).value = 'hello';
        document.addEventListener('submit', remember);
        form.requestSubmit();
        expect(calls.length).toBe(1);
        expect(calls[0]).toBeInstanceOf(FormData);
        expect(calls[0].get('q')).toBe('hello');
        expect(lastSubmit!.defaultPrevented).toBe(true);
        await root.dispose();
    });

    test('a handler without parameters is not called while building either', async () => {
        const calls: string[] = [];
        const A = compile(`<form id="f" action={() => calls.push('run')} />`, { calls });
        const { host, root } = mount(A());
        expect(calls).toEqual([]);
        (host.querySelector('#f') as HTMLFormElement).requestSubmit();
        expect(calls).toEqual(['run']);
        await root.dispose();
    });

    test('with two parameters the handler receives the form component first', async () => {
        const seen: any[] = [];
        const save = (sender: any, data: FormData) => { seen.push(sender, data.get('q')); };
        const A = compile(`<form id="f" action={save}><input name="q" /></form>`, { save });
        const { host, root } = mount(A());
        const form = host.querySelector('#f') as HTMLFormElement;
        (form.querySelector('input') as HTMLInputElement).value = 'x';
        form.requestSubmit();
        expect(seen[0]).toBeInstanceOf(Component);
        expect(seen[0].element).toBe(form);
        expect(seen[1]).toBe('x');
        await root.dispose();
    });

    test('a member holding a function is the handler too', async () => {
        const calls: string[] = [];
        const model = { save: (data: FormData) => { calls.push(String(data.get('q'))); } };
        const A = compile(`<form id="f" action={model.save}><input name="q" /></form>`, { model });
        const { host, root } = mount(A());
        const form = host.querySelector('#f') as HTMLFormElement;
        expect(calls).toEqual([]);
        (form.querySelector('input') as HTMLInputElement).value = 'm';
        form.requestSubmit();
        expect(calls).toEqual(['m']);
        await root.dispose();
    });

    test('a ternary between handlers picks the current one', async () => {
        const calls: string[] = [];
        const s = reactive({ edit: false });
        const create = () => calls.push('create');
        const update = () => calls.push('update');
        const A = compile(`<form id="f" action={s.edit ? update : create} />`, { s, create, update });
        const { host, root } = mount(A());
        const form = host.querySelector('#f') as HTMLFormElement;
        form.requestSubmit();
        s.edit = true;
        await tick();
        form.requestSubmit();
        expect(calls).toEqual(['create', 'update']);
        await root.dispose();
    });
});

describe('a string stays the URL', () => {
    test('a literal is written as the attribute and the browser submits', async () => {
        const A = compile(`<form id="f" action="/search"><input name="q" /></form>`);
        const { host, root } = mount(A());
        const form = host.querySelector('#f') as HTMLFormElement;
        expect(form.getAttribute('action')).toBe('/search');
        expect(dispatchSubmit(form).defaultPrevented).toBe(false);
        await root.dispose();
    });

    test('a getter switches between URL and handler', async () => {
        const calls: string[] = [];
        const s = reactive({ url: '/a', live: false });
        const save = () => calls.push('save');
        const A = compile(`<form id="f" action={s.live ? save : s.url} />`, { s, save });
        const { host, root } = mount(A());
        const form = host.querySelector('#f') as HTMLFormElement;
        expect(form.getAttribute('action')).toBe('/a');
        s.url = '/b';
        await tick();
        expect(form.getAttribute('action')).toBe('/b');

        s.live = true;
        await tick();
        expect(form.hasAttribute('action')).toBe(false);
        expect(dispatchSubmit(form).defaultPrevented).toBe(true);
        expect(calls).toEqual(['save']);

        s.live = false;
        await tick();
        expect(form.getAttribute('action')).toBe('/b');
        expect(dispatchSubmit(form).defaultPrevented).toBe(false);
        expect(calls).toEqual(['save']);
        await root.dispose();
    });
});

describe('the submit event of the author runs first', () => {
    test('preventDefault in onsubmit skips the handler', async () => {
        const order: string[] = [];
        const save = () => order.push('action');
        const A = compile(`<form id="f" action={save} onsubmit={(e) => { order.push('user'); e.preventDefault(); }} />`, { save, order });
        const { host, root } = mount(A());
        (host.querySelector('#f') as HTMLFormElement).requestSubmit();
        expect(order).toEqual(['user']);
        await root.dispose();
    });

    test('the :prevent modifier skips the handler', async () => {
        const order: string[] = [];
        const save = () => order.push('action');
        const A = compile(`<form id="f" action={save} onsubmit:prevent={() => order.push('user')} />`, { save, order });
        const { host, root } = mount(A());
        (host.querySelector('#f') as HTMLFormElement).requestSubmit();
        expect(order).toEqual(['user']);
        await root.dispose();
    });

    test('without preventDefault both run, onsubmit first', async () => {
        const order: string[] = [];
        const save = () => order.push('action');
        const A = compile(`<form id="f" action={save} onsubmit={() => order.push('user')} />`, { save, order });
        const { host, root } = mount(A());
        (host.querySelector('#f') as HTMLFormElement).requestSubmit();
        expect(order).toEqual(['user', 'action']);
        await root.dispose();
    });
});

describe('formaction on the submitter', () => {
    const page = (extra: Record<string, any>) => compile(`<form id="f" action={fallback}>
        <input name="q" />
        <button id="save" type="submit" name="op" value="save" formAction={save}>Save</button>
        <button id="rm" type="submit" name="op" value="rm" formaction={remove}>Remove</button>
        <button id="url" type="submit" formaction="/elsewhere">Go</button>
        <button id="plain" type="submit" name="op" value="plain">Plain</button>
    </form>`, extra);

    test('a function formaction wins over the form action and sees the submitter in the data', async () => {
        const calls: string[] = [];
        const fallback = (d: FormData) => calls.push('form:' + d.get('op'));
        const save = (d: FormData) => calls.push('save:' + d.get('op'));
        const remove = (sender: any, d: FormData) => calls.push('remove:' + d.get('op') + ':' + sender.element.id);
        const { host, root } = mount(page({ fallback, save, remove })());
        const form = host.querySelector('#f') as HTMLFormElement;
        const saveButton = host.querySelector('#save') as HTMLButtonElement;
        expect(saveButton.hasAttribute('formaction')).toBe(false);
        expect(calls).toEqual([]);

        form.requestSubmit(saveButton);
        form.requestSubmit(host.querySelector('#rm') as HTMLButtonElement);
        form.requestSubmit(host.querySelector('#plain') as HTMLButtonElement);
        form.requestSubmit();
        expect(calls).toEqual(['save:save', 'remove:rm:rm', 'form:plain', 'form:null']);
        await root.dispose();
    });

    test('a string formaction on the submitter is left to the browser', async () => {
        const calls: string[] = [];
        const fallback = () => calls.push('form');
        const save = () => calls.push('save');
        const remove = () => calls.push('remove');
        const { host, root } = mount(page({ fallback, save, remove })());
        const form = host.querySelector('#f') as HTMLFormElement;
        const urlButton = host.querySelector('#url') as HTMLButtonElement;
        expect(urlButton.getAttribute('formaction')).toBe('/elsewhere');
        expect(dispatchSubmit(form, urlButton).defaultPrevented).toBe(false);
        expect(calls).toEqual([]);
        await root.dispose();
    });
});

describe('errors and lifetime', () => {
    test('a throwing handler is reported as MJX123 for submit', async () => {
        const save = () => { throw new Error('boom'); };
        const A = compile(`<form id="f" action={save} />`, { save });
        const { host, root } = mount(A());
        (host.querySelector('#f') as HTMLFormElement).requestSubmit();
        const error = reported.find(e => e?.code === 'MJX123');
        expect(error?.message).toContain(`'submit'`);
        expect(error?.cause?.message).toBe('boom');
        await root.dispose();
    });

    test('a rejected async handler is reported as MJX123', async () => {
        const save = async () => { await tick(); throw new Error('boom'); };
        const A = compile(`<form id="f" action={save} />`, { save });
        const { host, root } = mount(A());
        (host.querySelector('#f') as HTMLFormElement).requestSubmit();
        expect(reported.length).toBe(0);
        await tick(5);
        expect(reported.find(e => e?.code === 'MJX123')?.cause?.message).toBe('boom');
        await root.dispose();
    });

    test('after dispose a submit no longer reaches the handler', async () => {
        const calls: string[] = [];
        const save = () => calls.push('save');
        const A = compile(`<form id="f" action={save} />`, { save });
        const { host, root } = mount(A());
        const form = host.querySelector('#f') as HTMLFormElement;
        form.requestSubmit();
        expect(calls).toEqual(['save']);
        await root.dispose();
        document.body.appendChild(form);
        expect(dispatchSubmit(form).defaultPrevented).toBe(false);
        expect(calls).toEqual(['save']);
    });
});

describe('without JSX', () => {
    test('a getter that yields a function binds the handler through motifComponent and attr.add', async () => {
        const calls: string[] = [];
        const save = (d: FormData) => calls.push(String(d.get('q')));
        const first = motif.motifComponent('form', { id: 'a', action: () => save }) as Component;
        first.controls.add(motif.motifComponent('input', { name: 'q' }) as Component);
        const second = new Component('form');
        second.attr.add({ id: 'b', action: () => save });
        const third = new Component('form');
        third.attr.add({ id: 'c', action: '/plain' });
        const { host, root } = mount(first);
        root.controls.add(second, third);

        const a = host.querySelector('#a') as HTMLFormElement;
        (a.querySelector('input') as HTMLInputElement).value = 'one';
        a.requestSubmit();
        (host.querySelector('#b') as HTMLFormElement).requestSubmit();
        expect(calls).toEqual(['one', 'null']);
        expect(a.hasAttribute('action')).toBe(false);
        expect((host.querySelector('#c') as HTMLFormElement).getAttribute('action')).toBe('/plain');
        await root.dispose();
    });
});

describe('inside a shadow root', () => {
    function mountInShadow(child: any) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const container = document.createElement('div');
        shadow.appendChild(container);
        const root = new Component(container);
        root.build();
        root.controls.add(child);
        return { shadow, root };
    }

    test('the submit event does not leave the shadow tree, the handler still runs', async () => {
        const calls: string[] = [];
        const save = (d: FormData) => calls.push(String(d.get('q')));
        const A = compile(`<form id="f" action={save}><input name="q" /></form>`, { save });
        const { shadow, root } = mountInShadow(A());
        const form = shadow.querySelector('#f') as HTMLFormElement;
        (form.querySelector('input') as HTMLInputElement).value = 'deep';
        document.addEventListener('submit', remember);
        form.requestSubmit();
        expect(lastSubmit).toBeNull();
        expect(calls).toEqual(['deep']);
        form.requestSubmit();
        expect(calls).toEqual(['deep', 'deep']);
        await root.dispose();
    });

    test('a formaction button inside a shadow root is found through its click', async () => {
        const calls: string[] = [];
        const remove = (d: FormData) => calls.push('remove:' + d.get('op'));
        const A = compile(`<form id="f" action="/plain"><button id="rm" type="submit" name="op" value="rm" formaction={remove}>Remove</button></form>`, { remove });
        const { shadow, root } = mountInShadow(A());
        (shadow.querySelector('#rm') as HTMLButtonElement).click();
        expect(calls).toEqual(['remove:rm']);
        await root.dispose();
    });

    test('the author\'s onsubmit still runs first inside a shadow root', async () => {
        const order: string[] = [];
        const save = () => order.push('action');
        const A = compile(`<form id="f" action={save} onsubmit={(e) => { order.push('user'); e.preventDefault(); }} />`, { save, order });
        const { shadow, root } = mountInShadow(A());
        (shadow.querySelector('#f') as HTMLFormElement).requestSubmit();
        expect(order).toEqual(['user']);
        await root.dispose();
    });
});

describe('component tags are untouched', () => {
    test('a function prop named action stays in props and is not called', async () => {
        class Child extends Component<HTMLDivElement, any> {
            constructor(props: any) { super('div', props); }
        }
        const calls: string[] = [];
        const save = () => calls.push('save');
        const A = compile(`<section><Child action={save} /></section>`, { Child, save });
        const { root } = mount(A());
        await tick();
        expect(calls).toEqual([]);
        const found = root.$('div').fromComponent().find(c => c instanceof Child) as Child;
        expect(found.props.action).toBe(save);
        await root.dispose();
    });
});
