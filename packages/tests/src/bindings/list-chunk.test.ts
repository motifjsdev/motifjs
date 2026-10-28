/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const until = async (done: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!done()) {
        if (Date.now() - start > ms) throw new Error('timeout');
        await tick(5);
    }
};

type Note = { id: number; title: string };
const notes = (count: number): Note[] => Array.from({ length: count }, (_, i) => ({ id: i, title: 'n' + i }));

class Row extends Component<HTMLLIElement> {
    mounted = 0;
    constructor(public note: Note, public index: number) {
        super('li');
        (this.element as HTMLLIElement).textContent = note.title;
    }
    onMounted() { this.mounted++; }
}

let app: Application;
let host: HTMLElement;
beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    app = Application.CreateBuilder().build();
});
afterEach(async () => {
    await app.dispose();
    document.body.innerHTML = '';
});

const texts = (el: Element) => [...el.querySelectorAll('li')].map(c => c.textContent);
const comments = (el: Element) => [...el.childNodes].filter(n => n.nodeType === Node.COMMENT_NODE).length;

function mountList(chunk: number, state: { items: Note[] }, render?: (n: Note, i: number) => Component) {
    const ul = new Component('ul', { 'x-chunk': chunk });
    let renders = 0;
    const rows: Row[] = [];
    ul.bindings.list(() => state.items, (n: Note, i: number) => { renders++; const r = render ? render(n, i) : new Row(n, i); if (r instanceof Row) rows.push(r); return r; });
    app.run(host, ul);
    return { ul: ul.element as HTMLUListElement, renders: () => renders, rows, component: ul };
}

describe('list binding under x-chunk: rows are created lazily, a chunk per frame', () => {
    test('the first chunk renders with the list, the rest are created frame by frame in order', async () => {
        const state = reactive({ items: notes(7) });
        const list = mountList(2, state);
        expect(texts(list.ul)).toEqual(['n0', 'n1']);
        expect(list.renders()).toBe(2);
        const markers = comments(list.ul) - 5;
        expect(markers).toBeGreaterThanOrEqual(0);
        await until(() => list.ul.querySelectorAll('li').length === 7);
        expect(texts(list.ul)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
        expect(list.renders()).toBe(7);
        expect(comments(list.ul)).toBe(markers);
        await until(() => list.rows.every(r => r.mounted === 1));
    });

    test('an item removed while its row is pending is never rendered', async () => {
        const state = reactive({ items: notes(6) });
        const list = mountList(2, state);
        state.items.splice(4, 1);
        await until(() => list.ul.querySelectorAll('li').length === 5);
        expect(texts(list.ul)).toEqual(['n0', 'n1', 'n2', 'n3', 'n5']);
        expect(list.renders()).toBe(5);
    });

    test('replacing the array while rows are pending drops the old pending rows and chunks the new ones', async () => {
        const state = reactive({ items: notes(6) });
        const list = mountList(2, state);
        expect(list.renders()).toBe(2);
        const fresh = Array.from({ length: 5 }, (_, i) => ({ id: 100 + i, title: 'f' + i }));
        state.items = fresh;
        await until(() => list.ul.querySelectorAll('li').length === 5);
        expect(texts(list.ul)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4']);
        expect(list.renders()).toBe(7);
        expect(list.ul.querySelectorAll('li').length).toBe(5);
    });

    test('a reorder while rows are pending keeps item identity and ends in the new order', async () => {
        const state = reactive({ items: notes(5) });
        const list = mountList(2, state);
        state.items.reverse();
        await until(() => list.ul.querySelectorAll('li').length === 5);
        expect(texts(list.ul)).toEqual(['n4', 'n3', 'n2', 'n1', 'n0']);
        expect(list.renders()).toBe(5);
    });

    test('an index-sensitive renderer gets the current index when its row is created', async () => {
        const state = reactive({ items: notes(5) });
        const list = mountList(1, state, (n, i) => { const r = new Row(n, i); (r.element as HTMLElement).textContent = n.title + '@' + i; return r; });
        state.items.shift();
        await until(() => list.ul.querySelectorAll('li').length === 4);
        expect(texts(list.ul)).toEqual(['n1@0', 'n2@1', 'n3@2', 'n4@3']);
    });

    test('a primitive list is chunked the same way', async () => {
        const state = reactive({ items: ['a', 'b', 'c', 'd'] as any[] });
        const ul = new Component('ul', { 'x-chunk': 2 });
        ul.bindings.list(() => state.items, (s: string) => { const li = new Component('li'); (li.element as HTMLElement).textContent = s; return li; });
        app.run(host, ul);
        const el = ul.element as HTMLUListElement;
        expect(texts(el)).toEqual(['a', 'b']);
        await until(() => el.querySelectorAll('li').length === 4);
        expect(texts(el)).toEqual(['a', 'b', 'c', 'd']);
    });

    test('without x-chunk every row renders at once, as before', () => {
        const state = reactive({ items: notes(6) });
        const list = mountList(0, state);
        expect(list.renders()).toBe(6);
        expect(texts(list.ul)).toHaveLength(6);
    });

    test('items pushed later get a fresh budget and the rest follow', async () => {
        const state = reactive({ items: notes(2) });
        const list = mountList(2, state);
        await tick(0);
        state.items.push(...notes(5).slice(2));
        await tick(0);
        expect(list.renders()).toBe(4);
        await until(() => list.ul.querySelectorAll('li').length === 5);
        expect(texts(list.ul)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
    });

    test('rows land in their place when the list changes between frames, and no trace is left behind', async () => {
        const state = reactive({ items: notes(12) });
        const list = mountList(2, state);
        await until(() => list.renders() >= 4);
        state.items.unshift({ id: 100, title: 'a' }, { id: 101, title: 'b' });
        state.items.splice(6, 2);
        state.items.reverse();
        const expected = () => state.items.map(n => n.title);
        await until(() => list.ul.querySelectorAll('li').length === state.items.length);
        expect(texts(list.ul)).toEqual(expected());
        state.items.push({ id: 102, title: 'c' }, { id: 103, title: 'd' }, { id: 104, title: 'e' });
        state.items.splice(1, 0, { id: 105, title: 'f' });
        await until(() => list.ul.querySelectorAll('li').length === state.items.length);
        expect(texts(list.ul)).toEqual(expected());
        const plain = mountList(0, reactive({ items: notes(3) }));
        expect(comments(list.ul)).toBe(comments(plain.ul));
    });

    test('a row that is hidden or waiting when its turn comes keeps its place', async () => {
        const flags = reactive({ show: false, ready: false });
        const state = reactive({ items: notes(6) });
        const list = mountList(1, state, (n) => {
            const props: any = n.id === 3 ? { 'x-display': () => flags.show } : n.id === 4 ? { 'x-wait': () => !flags.ready } : {};
            const li = new Component('li', props);
            (li.element as HTMLElement).textContent = n.title;
            return li as any;
        });
        await until(() => list.renders() === 6 && list.ul.querySelectorAll('li').length === 4);
        expect(texts(list.ul)).toEqual(['n0', 'n1', 'n2', 'n5']);
        flags.show = true;
        await until(() => list.ul.querySelectorAll('li').length === 5);
        expect(texts(list.ul)).toEqual(['n0', 'n1', 'n2', 'n3', 'n5']);
        flags.ready = true;
        await until(() => list.ul.querySelectorAll('li').length === 6);
        expect(texts(list.ul)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5']);
    });

    test('disposing the list while rows are pending renders nothing more', async () => {
        const state = reactive({ items: notes(6) });
        const list = mountList(2, state);
        await list.component.dispose();
        await tick(60);
        expect(list.renders()).toBe(2);
    });
});
