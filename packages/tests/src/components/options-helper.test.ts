/**
 * @jest-environment jsdom
 */
import { Component, motifComponent, motifOptions } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function mount(child: any) {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { root, host };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('motifOptions', () => {
    test('returns the very object it is given', () => {
        const spec = { el: 'div', view() { return []; } };
        expect(motifOptions(spec)).toBe(spec);
    });

    test('a wrapped object builds the same component as a plain one: root element, members, ctor with props', async () => {
        const seen: any[] = [];
        const Filter = () => motifOptions({
            el: 'div',
            data: { query: '' },
            view() {
                this.class.add('search');
                return [motifComponent('input', (input: any) => input.attr.add({ type: 'search' }))];
            },
            ctor(props?: { initial?: string }) {
                seen.push(props);
                if (props?.initial) this.data.query = props.initial;
            },
        });
        const c: any = motifComponent(Filter, { initial: 'abc' });
        const { root, host } = mount(c);
        await settle();
        const div = host.querySelector('div.search') as HTMLElement;
        expect(div).not.toBeNull();
        expect(div.querySelector('input[type="search"]')).not.toBeNull();
        expect(c.data.query).toBe('abc');
        expect(seen.length).toBe(1);
        expect(seen[0].initial).toBe('abc');
        root.dispose();
    });

    test('el: undefined still makes a fragment', async () => {
        const Empty = () => motifOptions({ el: undefined, view() { return [motifComponent('b')]; } });
        const c: any = motifComponent(Empty);
        const { root, host } = mount(c);
        await settle();
        expect((c.element as Node).nodeType).toBe(Node.COMMENT_NODE);
        expect(host.querySelector('b')).not.toBeNull();
        root.dispose();
    });
});
