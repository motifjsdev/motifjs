import * as motif from '@motifx/core';
import { Component, ComponentBase, reactive, motifComponent } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async () => { await tick(); await tick(); };

const PARTS = `
    function Banner(p){ return <section class="banner" x-display={() => { reads.banner++; return state.saved; }}>{p.message}</section>; }
    function Notice(p){ return <Banner message={p.message} />; }
    function Loader(p){ return <section class="loader" x-wait={() => { reads.loader++; return state.syncing; }}>{p.label}</section>; }
    function Field(p){ return <label {...p}>{p.label}</label>; }
    class Badge extends Component { view() { return <span class="badge">b</span>; } }
    function Wrapped(p){ return <Badge x-display={() => { reads.inner++; return state.saved; }} />; }
`;

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(PARTS + source, 'RootCondition.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(child: any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

function setup() {
    const state = reactive({ saved: true, syncing: true, pinned: true });
    const reads = { banner: 0, loader: 0, field: 0, tag: 0, inner: 0, outer: 0, pre: 0 };
    return { state, reads };
}

async function change(reads: Record<string, number>, key: string, apply: () => void) {
    reads[key] = 0;
    apply();
    await settle();
    return reads[key];
}

describe('x-display and x-wait on the root of a function component used through its tag', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('the root binds its own x-display once', async () => {
        const { state, reads } = setup();
        const A = evalJsx(`function A(){ return <main><Banner message="Kaydedildi" /></main>; }`, 'A', { state, reads });
        const { host } = mount(A());
        await settle();
        expect(host.querySelector('.banner')!.textContent).toBe('Kaydedildi');
        expect(reads.banner).toBe(1);
        expect(await change(reads, 'banner', () => { state.saved = false; })).toBe(1);
        expect(host.querySelector('.banner')).toBeNull();
        expect(await change(reads, 'banner', () => { state.saved = true; })).toBe(1);
        expect(host.querySelector('.banner')!.textContent).toBe('Kaydedildi');
    });

    test('a function component that returns the tag does not bind the root condition again', async () => {
        const { state, reads } = setup();
        const A = evalJsx(`function A(){ return <main><Notice message="Kaydedildi" /></main>; }`, 'A', { state, reads });
        const { host } = mount(A());
        await settle();
        expect(reads.banner).toBe(1);
        expect(await change(reads, 'banner', () => { state.saved = false; })).toBe(1);
        expect(host.querySelector('.banner')).toBeNull();
        expect(await change(reads, 'banner', () => { state.saved = true; })).toBe(1);
        expect(host.querySelector('.banner')).not.toBeNull();
    });

    test('the root binds its own x-wait once', async () => {
        const { state, reads } = setup();
        const A = evalJsx(`function A(){ return <main><Loader label="Eşitlendi" /></main>; }`, 'A', { state, reads });
        const { host } = mount(A());
        await settle();
        expect(host.querySelector('main')!.innerHTML).toBe('<!--h-->');
        expect(reads.loader).toBe(1);
        expect(await change(reads, 'loader', () => { state.syncing = false; })).toBe(1);
        expect(host.querySelector('.loader')!.textContent).toBe('Eşitlendi');
        expect(await change(reads, 'loader', () => { state.syncing = true; })).toBe(1);
        expect(host.querySelector('.loader')).toBeNull();
    });

    test('a tag condition on a component that spreads its props on its root is bound once', async () => {
        const { state, reads } = setup();
        const A = evalJsx(`function A(){ return <main><Field label="Başlık" x-display={() => { reads.field++; return state.saved; }} /></main>; }`, 'A', { state, reads });
        const { host } = mount(A());
        await settle();
        expect(reads.field).toBe(1);
        expect(await change(reads, 'field', () => { state.saved = false; })).toBe(1);
        expect(host.querySelector('label')).toBeNull();
        expect(await change(reads, 'field', () => { state.saved = true; })).toBe(1);
        expect(host.querySelector('label')!.textContent).toBe('Başlık');
    });

    test('a condition on the tag is added to the root and each condition is evaluated once per change', async () => {
        const { state, reads } = setup();
        const A = evalJsx(`function A(){ return <main><Banner message="Kaydedildi" x-display={() => { reads.tag++; return state.pinned; }} /></main>; }`, 'A', { state, reads });
        const { host } = mount(A());
        await settle();
        expect(reads.banner).toBe(1);
        expect(reads.tag).toBe(1);
        expect(await change(reads, 'tag', () => { state.pinned = false; })).toBe(1);
        expect(host.querySelector('.banner')).toBeNull();
        expect(await change(reads, 'tag', () => { state.pinned = true; })).toBe(1);
        expect(host.querySelector('.banner')).not.toBeNull();
        expect(await change(reads, 'banner', () => { state.saved = false; })).toBe(1);
        expect(host.querySelector('.banner')).toBeNull();
        expect(await change(reads, 'banner', () => { state.saved = true; })).toBe(1);
        expect(host.querySelector('.banner')).not.toBeNull();
    });

    test('a class root keeps the inner tag condition when the wrapping tag adds another', async () => {
        const { state, reads } = setup();
        const A = evalJsx(`function A(){ return <main><Wrapped x-display={() => { reads.outer++; return state.pinned; }} /></main>; }`, 'A', { state, reads });
        const { host } = mount(A());
        await settle();
        expect(host.querySelector('.badge')).not.toBeNull();
        expect(reads.inner).toBe(1);
        expect(reads.outer).toBe(1);
        expect(await change(reads, 'inner', () => { state.saved = false; })).toBe(1);
        expect(host.querySelector('.badge')).toBeNull();
        expect(await change(reads, 'inner', () => { state.saved = true; })).toBe(1);
        expect(host.querySelector('.badge')).not.toBeNull();
        expect(await change(reads, 'outer', () => { state.pinned = false; })).toBe(1);
        expect(host.querySelector('.badge')).toBeNull();
        expect(await change(reads, 'outer', () => { state.pinned = true; })).toBe(1);
        expect(host.querySelector('.badge')).not.toBeNull();
    });
});

describe('preconfig through runover without JSX', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    function card(state: any, reads: Record<string, number>) {
        return () => motifComponent('section', {
            class: 'card',
            preconfig: (c: ComponentBase) => { reads.pre++; c.bindings.display(() => { reads.banner++; return state.saved; }); },
        });
    }

    test('an empty runover does not run the root preconfig a second time', async () => {
        const { state, reads } = setup();
        const { host } = mount(motifComponent(card(state, reads), { runover: {} }));
        await settle();
        expect(host.querySelector('.card')).not.toBeNull();
        expect(reads.pre).toBe(1);
        expect(reads.banner).toBe(1);
        expect(await change(reads, 'banner', () => { state.saved = false; })).toBe(1);
        expect(host.querySelector('.card')).toBeNull();
    });

    test('a preconfig arriving after the root is configured runs once and the root preconfig is not repeated', async () => {
        const { state, reads } = setup();
        const { host } = mount(motifComponent(card(state, reads), {
            runover: { preconfig: (c: ComponentBase) => { reads.outer++; c.bindings.display(() => { reads.tag++; return state.pinned; }); } },
        }));
        await settle();
        expect(reads.pre).toBe(1);
        expect(reads.outer).toBe(1);
        expect(reads.banner).toBe(1);
        expect(reads.tag).toBe(1);
        expect(await change(reads, 'tag', () => { state.pinned = false; })).toBe(1);
        expect(host.querySelector('.card')).toBeNull();
        expect(await change(reads, 'tag', () => { state.pinned = true; })).toBe(1);
        expect(host.querySelector('.card')).not.toBeNull();
        expect(await change(reads, 'banner', () => { state.saved = false; })).toBe(1);
        expect(host.querySelector('.card')).toBeNull();
    });
});
