/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

function setup(names: string, fragment = false) {
    const host = fragment ? new Component() : new Component('div');
    const made = names.split('').map(n => { const c = new Component('li'); (c.element as HTMLElement).id = n; return c; });
    host.controls.add(...made);
    const outer = document.body.appendChild(document.createElement('div'));
    const root = new Component(outer as any);
    root.build();
    root.controls.add(host);
    const by = (n: string) => made[names.indexOf(n)];
    const items = () => host.controls.items.map(x => (x.element as HTMLElement).id).join('');
    const dom = () => Array.from(outer.querySelectorAll('li')).map(e => e.id).join('');
    const nodes = () => Array.from((fragment ? outer : (host.element as HTMLElement)).childNodes)
        .map(n => n.nodeType === 1 ? (n as HTMLElement).id : n.nodeType === 8 ? `<!--${(n as Comment).data}-->` : '#').join(',');
    return { host, by, items, dom, nodes, root, outer };
}

describe('controls.moveToIndex: the index is the position in the resulting list', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test.each([
        ['a', 1, 'bacd'], ['a', 2, 'bcad'], ['a', 3, 'bcda'], ['a', 4, 'bcda'], ['a', 99, 'bcda'],
        ['b', 2, 'acbd'], ['b', 3, 'acdb'],
        ['d', 0, 'dabc'], ['d', 1, 'adbc'], ['c', 0, 'cabd'],
        ['a', 0, 'abcd'], ['d', 3, 'abcd'], ['b', 1, 'abcd'], ['a', -1, 'abcd'],
    ])('[abcd] moveToIndex(%s, %i) → %s in items and in the DOM', (who, index, want) => {
        const t = setup('abcd');
        t.host.controls.moveToIndex(t.by(who), index);
        expect(t.items()).toBe(want);
        expect(t.dom()).toBe(want);
        t.root.dispose();
    });

    test('a hidden child moves with its trace', async () => {
        const t = setup('abcd');
        await t.by('b').motif.hide();
        await tick();
        t.host.controls.moveToIndex(t.by('b'), 3);
        expect(t.items()).toBe('acdb');
        expect(t.nodes()).toBe('a,c,d,<!--h-->');
        await t.by('b').motif.show();
        await tick();
        expect(t.dom()).toBe('acdb');
        t.root.dispose();
    });

    test('inside a fragment owner the end is before the closing marker', () => {
        const t = setup('abcd', true);
        t.host.controls.moveToIndex(t.by('a'), 3);
        expect(t.items()).toBe('bcda');
        expect(t.nodes()).toBe('<!--[-->,b,c,d,a,<!--]-->');
        t.root.dispose();
    });

    test('a child of another parent or a disposed child is left alone', async () => {
        const t = setup('abcd');
        const other = new Component('li');
        t.host.controls.moveToIndex(other, 1);
        expect(t.items()).toBe('abcd');
        const c = t.by('c');
        await c.dispose();
        t.host.controls.moveToIndex(c, 0);
        expect(t.items()).toBe('abd');
        expect(t.dom()).toBe('abd');
        t.root.dispose();
    });
});
