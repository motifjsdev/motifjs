import * as motif from '@motifx/core';
import { Component, ComponentBase } from '@motifx/core';

function mount(child: ComponentBase) {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { root, host };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('an element made with a lone initializeComponent object', () => {
    test('runs the setup once with the sender and the event, and keeps an empty props', () => {
        const calls: any[] = [];
        const given: any = { initializeComponent: (s: any, e: any) => { calls.push(s, typeof e); s.class.add('k'); } };
        const c = motif.motifComponent('div', given) as ComponentBase;
        expect(given.initializeComponent).toBeUndefined();
        expect(Object.keys(given)).toEqual([]);
        expect(c.props).not.toBe(given);
        expect(Object.keys(c.props)).toEqual([]);
        const { root, host } = mount(c);
        expect(calls).toEqual([c, 'object']);
        expect(host.innerHTML).toBe('<div class="k"></div>');
        root.dispose();
    });

    test('the compiler-marked form behaves the same', () => {
        const calls: any[] = [];
        const c = (motif.motifComponent as any)('div', { initializeComponent: (s: any, e: any) => { calls.push(s, typeof e); s.class.add('k'); } }, 1) as ComponentBase;
        expect(Object.keys(c.props)).toEqual([]);
        const { root, host } = mount(c);
        expect(calls).toEqual([c, 'object']);
        expect(host.innerHTML).toBe('<div class="k"></div>');
        const text = (motif.motifComponent as any)('text', { initializeComponent: (s: any) => s.setText('x') }, 1) as ComponentBase;
        root.controls.add(text);
        expect(host.innerHTML).toBe('<div class="k"></div>x');
        root.dispose();
    });

    test('a setup function given directly behaves the same', () => {
        const calls: any[] = [];
        const c = motif.motifComponent('div', ((s: any, e: any) => { calls.push(s, typeof e); s.class.add('k'); }) as any) as ComponentBase;
        expect(Object.keys(c.props)).toEqual([]);
        const { root, host } = mount(c);
        expect(calls).toEqual([c, 'object']);
        expect(host.innerHTML).toBe('<div class="k"></div>');
        root.dispose();
    });

    test('a setup that adds more setups and hooks keeps their order', () => {
        const log: string[] = [];
        const c = motif.motifComponent('div', {
            initializeComponent: (s: any) => {
                log.push('init');
                s.motif.on('x:built', () => log.push('built'));
            },
        } as any) as ComponentBase;
        const { root } = mount(c);
        expect(log).toEqual(['init', 'built']);
        root.dispose();
    });

    test('other keys, a list of setups or a non-plain object take the usual path', () => {
        const log: string[] = [];
        const withTitle: any = { initializeComponent: () => log.push('a'), title: 't' };
        const a = motif.motifComponent('div', withTitle) as ComponentBase;
        expect(withTitle.initializeComponent).toBeUndefined();
        expect(Object.keys(a.props)).toEqual(['title']);

        const list: any = { initializeComponent: [() => log.push('b1'), () => log.push('b2')] };
        const b = motif.motifComponent('div', list) as ComponentBase;

        class Holder { initializeComponent = () => log.push('c'); }
        const held: any = new Holder();
        const c = motif.motifComponent('div', held) as ComponentBase;

        const tagged: any = { initializeComponent: () => log.push('d'), [Symbol('s')]: 1 };
        const d = motif.motifComponent('div', tagged) as ComponentBase;

        const { root, host } = mount(a);
        root.controls.add(b);
        root.controls.add(c);
        root.controls.add(d);
        expect(log).toEqual(['a', 'b1', 'b2', 'c', 'd']);
        expect(host.innerHTML).toBe('<div title="t"></div><div></div><div></div><div></div>');
        root.dispose();
    });

    test('a text element with a lone setup writes its text', () => {
        const c = motif.motifComponent('text', { initializeComponent: (s: any) => s.setText('merhaba') } as any) as ComponentBase;
        const { root, host } = mount(c);
        expect(host.textContent).toBe('merhaba');
        root.dispose();
    });

    test('a replaced motif namespace is still accepted at run time', () => {
        const c: any = new Component('div');
        const other = new Component('i').motif;
        c.motif = other;
        expect(c.motif).toBe(other);
    });
});
