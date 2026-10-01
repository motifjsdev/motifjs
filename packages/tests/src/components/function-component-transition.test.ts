/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, ComponentBase, motifComponent, reactive } from '@motifx/core';

const compiler = require('../../../compiler/dist/index.cjs');

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function evaluate(source: string, name: string): any {
    const out = new compiler.Compiler().start(source, 'FT.tsx');
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

const Badge = (_p: any) => motifComponent('span', {
    initializeComponent: (s: ComponentBase) => { s.setText('badge'); }
}) as ComponentBase;

const Forwarding = (p: any) => motifComponent('span', {
    transition: p.transition,
    initializeComponent: (s: ComponentBase) => { s.setText('badge'); }
}) as ComponentBase;

const transitionOf = (c: ComponentBase) => (c as any).motif.options.transition;

describe('transition on function component tags', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('applies a transition name to the returned root', () => {
        const root = motifComponent(Badge, { transition: 'fade' }) as ComponentBase;
        expect(transitionOf(root).name).toBe('fade');
        expect(transitionOf(root).cssProps()).toEqual({ name: 'fade' });
    });

    it('applies a transition object to the returned root', () => {
        const classes = { name: 'slide', enterActiveClass: 'in' };
        const root = motifComponent(Badge, { transition: classes }) as ComponentBase;
        expect(transitionOf(root).name).toBe('slide');
        expect(transitionOf(root).classes).toBe(classes);
    });

    it('applies a transition that arrives inside runover', () => {
        const root = motifComponent(Badge, { runover: { transition: 'fade' } }) as ComponentBase;
        expect(transitionOf(root).name).toBe('fade');
    });

    it('follows a getter, as produced by a ternary on the tag', async () => {
        const st = reactive({ fast: true });
        const root = motifComponent(Badge, { transition: () => st.fast ? 'quick' : 'slow' }) as ComponentBase;
        mount(root);
        await tick();
        expect(transitionOf(root).name).toBe('quick');

        st.fast = false;
        await tick();
        expect(transitionOf(root).name).toBe('slow');
    });

    it('clears the transition when a getter returns nothing', async () => {
        const st = reactive({ animate: true });
        const root = motifComponent(Badge, { transition: () => st.animate ? 'fade' : null }) as ComponentBase;
        mount(root);
        await tick();
        expect(transitionOf(root).cssProps()).toEqual({ name: 'fade' });

        st.animate = false;
        await tick();
        expect(transitionOf(root).cssProps()).toBeNull();
    });

    it('stops following the getter after the root is disposed', async () => {
        const st = reactive({ fast: true });
        let runs = 0;
        const root = motifComponent(Badge, { transition: () => { runs++; return st.fast ? 'quick' : 'slow'; } }) as ComponentBase;
        mount(root);
        await tick();
        await root.dispose();
        const before = runs;
        st.fast = false;
        await tick();
        expect(runs).toBe(before);
    });

    it('keeps a single application when the function forwards the prop to its root', async () => {
        const st = reactive({ fast: true });
        let runs = 0;
        const getter = () => { runs++; return st.fast ? 'quick' : 'slow'; };
        const root = motifComponent(Forwarding, { transition: getter }) as ComponentBase;
        mount(root);
        await tick();
        const before = runs;
        st.fast = false;
        await tick();
        expect(runs - before).toBe(1);
        expect(transitionOf(root).name).toBe('slow');
    });

    it('lets the tag win over a transition set inside the function', () => {
        const Inner = (_p: any) => motifComponent('span', { transition: 'inner' }) as ComponentBase;
        const root = motifComponent(Inner, { transition: 'outer' }) as ComponentBase;
        expect(transitionOf(root).name).toBe('outer');
    });

    it('follows a getter on plain tags and class components too', async () => {
        const st = reactive({ fast: true });
        const plain = new Component('div', { transition: () => st.fast ? 'quick' : 'slow' } as any);
        class Panel extends Component<HTMLDivElement, any> {
            constructor(props: any) { super('div', props); }
        }
        const panel = motifComponent(Panel, { transition: () => st.fast ? 'quick' : 'slow' }) as ComponentBase;
        mount(plain);
        mount(panel);
        await tick();
        expect(transitionOf(plain).name).toBe('quick');
        expect(transitionOf(panel).name).toBe('quick');

        st.fast = false;
        await tick();
        expect(transitionOf(plain).name).toBe('slow');
        expect(transitionOf(panel).name).toBe('slow');
    });

    it('plays enter classes for compiled JSX on a function component tag', async () => {
        const App = evaluate(`
            function Badge(p) { return <span id="badge">badge</span>; }
            function App() { return <div><Badge transition="fade" /></div>; }
        `, 'App');
        const host = mount(App());
        await Promise.resolve();
        const badge = (host.element as unknown as HTMLElement).querySelector('#badge') as HTMLElement;
        expect(badge.hasAttribute('transition')).toBe(false);
        expect(badge.classList.contains('fade-enter-active')).toBe(true);
    });

    it('resolves a ternary written on a function component tag in compiled JSX', async () => {
        const make = evaluate(`
            function Badge(p) { return <span id="badge">badge</span>; }
            function make(st) { return <div><Badge transition={st.fast ? 'quick' : 'slow'} /></div>; }
        `, 'make');
        const st = reactive({ fast: false });
        const host = mount(make(st));
        await Promise.resolve();
        const badge = (host.element as unknown as HTMLElement).querySelector('#badge') as HTMLElement;
        expect(badge.classList.contains('slow-enter-active')).toBe(true);
    });
});
