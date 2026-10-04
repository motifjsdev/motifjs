/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, effect, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise<void>(r => setTimeout(r, 0));

async function watch<T>(read: () => T) {
    const seen: T[] = [];
    effect(() => { seen.push(read()); });
    await tick();
    return seen;
}

function evalJsx(source: string, exportName: string) {
    let code: string = new CompilerCtor().start(source, 'CD.tsx').code;
    code = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', 'Component', 'reactive'];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

describe('values inside reactive collections', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('tracks fields of objects read from a Map', async () => {
        const s = reactive({ users: new Map([['u1', { name: 'Ada' }]]) });
        const seen = await watch(() => s.users.get('u1')!.name);
        s.users.get('u1')!.name = 'Grace';
        await tick();
        expect(seen).toEqual(['Ada', 'Grace']);
        expect(s.users.get('u1')).toBe(s.users.get('u1'));
    });

    it('wraps Map values and Set elements during iteration', async () => {
        const s = reactive({ map: new Map([['a', { n: 1 }]]), set: new Set([{ n: 1 }]) });
        const fromMap = await watch(() => [...s.map.values()].map(v => v.n).join(','));
        const fromSet = await watch(() => { let t = 0; s.set.forEach(v => { t += v.n; }); return t; });
        s.map.get('a')!.n = 2;
        for (const item of s.set) item.n = 5;
        await tick();
        expect(fromMap).toEqual(['1', '2']);
        expect(fromSet).toEqual([1, 5]);
    });

    it('stores raw objects when proxies are written in', () => {
        const rawMap = new Map<string, { id: number }>();
        const rawSet = new Set<{ id: number }>();
        const s = reactive({ map: rawMap, set: rawSet, item: { id: 1 } });
        const item = s.item;
        s.map.set('k', item);
        s.set.add(item);
        expect(rawMap.get('k')).not.toBe(item);
        expect(rawMap.get('k')!.id).toBe(1);
        expect(rawSet.size).toBe(1);
        expect(s.map.get('k')).toBe(item);
        expect(s.set.has(item)).toBe(true);
        s.set.add(item);
        expect(rawSet.size).toBe(1);
    });

    it('finds object keys given as raw or reactive', async () => {
        const s = reactive({ key: { id: 1 }, map: new Map<object, string>() });
        const proxyKey = s.key;
        s.map.set(proxyKey, 'one');
        const seen = await watch(() => s.map.get(proxyKey));
        const [rawKey] = [...s.map.keys()];
        expect(rawKey).not.toBe(proxyKey);
        expect(s.map.get(rawKey)).toBe('one');
        s.map.set(rawKey, 'uno');
        await tick();
        expect(seen).toEqual(['one', 'uno']);
        expect(s.map.delete(proxyKey)).toBe(true);
        expect(s.map.size).toBe(0);
    });

    it('tracks collections nested in collections', async () => {
        const s = reactive({ groups: new Map([['g', new Set<string>()]]) });
        const seen = await watch(() => s.groups.get('g')!.size);
        s.groups.get('g')!.add('x');
        await tick();
        expect(seen).toEqual([0, 1]);
    });

    it('renders a list from Map values and updates it', async () => {
        const List = evalJsx(`function List(p){ return <ul>{[...p.st.items.values()].map(it => <li key={it.id}>{() => it.label}</li>)}</ul>; }`, 'List');
        const st = reactive({ items: new Map([[1, { id: 1, label: 'one' }], [2, { id: 2, label: 'two' }]]) });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        root.controls.add(List({ st }));
        await tick();
        const text = () => [...host.querySelectorAll('li')].map(li => li.textContent).join(',');
        expect(text()).toBe('one,two');
        st.items.get(2)!.label = 'TWO';
        await tick();
        expect(text()).toBe('one,TWO');
        st.items.set(3, { id: 3, label: 'three' });
        await tick();
        expect(text()).toBe('one,TWO,three');
        st.items.delete(1);
        await tick();
        expect(text()).toBe('TWO,three');
        await root.dispose();
    });
});
