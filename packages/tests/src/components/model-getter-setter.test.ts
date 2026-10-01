/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function evaluate(source: string, name: string): any {
    const out = new compiler.Compiler().start(source, 'Model.tsx');
    const body = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/gm, '').replace(/^export /gm, '');
    const fn = new Function('_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', `"use strict";\n${body}\nreturn ${name};`);
    return fn(motif.motifComponent, motif.motifFragment, motif.FNComponent, motif.motifCompiled, Component, reactive);
}

function mount(child: ComponentBase) {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    host.controls.add(child);
    return host;
}

function input(type: string, bind: (s: ComponentBase) => void) {
    return new Component('input', {
        onconfig: (s: ComponentBase) => bind(s),
        initializeComponent: (s: ComponentBase) => { s.attr.add({ type }); }
    } as any);
}

function type(el: HTMLInputElement, value: string) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

const FORM = `
export class Form extends Component {
    s = reactive({
        form: { name: 'a' },
        rows: [{ id: 1, name: 'r1' }, { id: 2, name: 'r2' }, { id: 3, name: 'r3' }],
        maybe: null,
        holder: { label: () => 'computed' },
        agree: false,
        age: 3
    });
    view() {
        return <div>
            <input id="single" x-model={() => this.s.form.name} />
            <input id="bare" x-model={this.s.form.name} />
            <input id="optional" x-model={() => this.s.maybe?.name} />
            <input id="getter" x-model={() => this.s.holder.label} />
            <input id="derived" x-model={() => this.s.form.name + '!'} />
            <input id="agree" type="checkbox" x-model={() => this.s.agree} />
            <input id="age" type="number" x-model={() => this.s.age} />
            <ul>{this.s.rows.map(row => <li key={row.id}><input class="row" x-model={() => row.name} /></li>)}</ul>
        </div>;
    }
}
`;

describe('bindings.model(getter, setter)', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('reads through the getter and writes through the setter', async () => {
        const st = reactive({ form: { name: 'a' } });
        const comp = input('text', s => s.bindings.model(() => st.form.name, (v: any) => { st.form.name = v; }));
        mount(comp);
        await tick();
        const el = comp.element as unknown as HTMLInputElement;
        expect(el.value).toBe('a');

        type(el, 'b');
        expect(st.form.name).toBe('b');

        st.form.name = 'c';
        await tick();
        expect(el.value).toBe('c');
    });

    it('follows the owner object when it is replaced', async () => {
        const st = reactive({ form: { name: 'a' } });
        const first = st.form;
        const comp = input('text', s => s.bindings.model(() => st.form.name, (v: any) => { st.form.name = v; }));
        mount(comp);
        await tick();
        const el = comp.element as unknown as HTMLInputElement;

        st.form = { name: 'z' };
        await tick();
        expect(el.value).toBe('z');

        type(el, 'y');
        expect(st.form.name).toBe('y');
        expect(first.name).toBe('a');
    });

    it('applies converterBack before the setter', async () => {
        const st = reactive({ code: 'a' });
        const comp = input('text', s => {
            const binding = s.bindings.model(() => st.code, (v: any) => { st.code = v; });
            binding.converterBack = (v: any) => String(v).toUpperCase();
        });
        mount(comp);
        await tick();
        type(comp.element as unknown as HTMLInputElement, 'xyz');
        expect(st.code).toBe('XYZ');
    });

    it('passes typed values for checkbox and number inputs', async () => {
        const st = reactive({ agree: false, age: 3 });
        const box = input('checkbox', s => s.bindings.model(() => st.agree, (v: any) => { st.agree = v; }));
        const num = input('number', s => s.bindings.model(() => st.age, (v: any) => { st.age = v; }));
        mount(box);
        mount(num);
        await tick();

        const boxEl = box.element as unknown as HTMLInputElement;
        boxEl.checked = true;
        boxEl.dispatchEvent(new Event('change', { bubbles: true }));
        expect(st.agree).toBe(true);

        type(num.element as unknown as HTMLInputElement, '42');
        expect(st.age).toBe(42);
    });
});

describe('x-model in compiled JSX', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    async function setup() {
        const Form = evaluate(FORM, 'Form');
        const form = new Form('div');
        const host = mount(form);
        await tick();
        const root = host.element as unknown as HTMLElement;
        const byId = (id: string) => root.querySelector('#' + id) as HTMLInputElement;
        const rows = () => Array.from(root.querySelectorAll('input.row')) as HTMLInputElement[];
        return { form, byId, rows };
    }

    it('writes back for a getter and for a bare member expression', async () => {
        const { form, byId } = await setup();
        expect(byId('single').value).toBe('a');
        expect(byId('bare').value).toBe('a');

        type(byId('single'), 'b');
        expect(form.s.form.name).toBe('b');
        await tick();
        expect(byId('bare').value).toBe('b');

        type(byId('bare'), 'c');
        expect(form.s.form.name).toBe('c');
        await tick();
        expect(byId('single').value).toBe('c');
    });

    it('keeps the binding when the owner object is replaced', async () => {
        const { form, byId } = await setup();
        const first = form.s.form;
        form.s.form = { name: 'z' };
        await tick();
        expect(byId('single').value).toBe('z');

        type(byId('single'), 'y');
        expect(form.s.form.name).toBe('y');
        expect(first.name).toBe('a');
    });

    it('keeps each row bound to its item when the list is reordered', async () => {
        const { form, rows } = await setup();
        const [one, two, three] = rows();
        expect(rows().map(r => r.value)).toEqual(['r1', 'r2', 'r3']);

        form.s.rows = [form.s.rows[2], form.s.rows[0], form.s.rows[1]];
        await tick();
        expect(rows().map(r => r.value)).toEqual(['r3', 'r1', 'r2']);
        expect(rows()).toEqual([three, one, two]);

        type(one, 'first');
        type(three, 'third');
        expect(form.s.rows.map((r: any) => r.name)).toEqual(['third', 'first', 'r2']);
        expect(form.s.rows.find((r: any) => r.id === 1).name).toBe('first');

        form.s.rows.find((r: any) => r.id === 2).name = 'second';
        await tick();
        expect(two.value).toBe('second');
    });

    it('skips the write while the owner is missing and resumes when it exists', async () => {
        const { form, byId } = await setup();
        type(byId('optional'), 'x');
        expect(form.s.maybe).toBeNull();

        form.s.maybe = { name: 'n' };
        await tick();
        expect(byId('optional').value).toBe('n');
        type(byId('optional'), 'm');
        expect(form.s.maybe.name).toBe('m');
    });

    it('does not overwrite a member that holds a getter', async () => {
        const { form, byId } = await setup();
        expect(byId('getter').value).toBe('computed');
        type(byId('getter'), 'typed');
        expect(typeof form.s.holder.label).toBe('function');
    });

    it('leaves a non-assignable expression one-way', async () => {
        const { form, byId } = await setup();
        expect(byId('derived').value).toBe('a!');
        type(byId('derived'), 'typed');
        expect(form.s.form.name).toBe('a');
    });

    it('writes booleans and numbers for checkbox and number inputs', async () => {
        const { form, byId } = await setup();
        const box = byId('agree');
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        expect(form.s.agree).toBe(true);

        type(byId('age'), '42');
        expect(form.s.age).toBe(42);
    });
});
