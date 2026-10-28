/**
 * @jest-environment jsdom
 */
import { Application, Component, motifComponent, reactive } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const until = async (done: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!done()) {
        if (Date.now() - start > ms) throw new Error('timeout');
        await tick(5);
    }
};

class Row extends Component<HTMLLIElement> {
    mounted = 0;
    configured = 0;
    constructor(public n: number) {
        super('li');
        (this.element as HTMLLIElement).textContent = String(n);
    }
    onConfigured() { this.configured++; }
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

const texts = (el: Element) => [...el.children].map(c => c.textContent);
const liCount = (el: Element) => el.querySelectorAll('li').length;

describe('x-chunk: children of an element are built in slices', () => {
    test('children added before build: the first chunk builds with the parent, the rest arrive frame by frame in order', async () => {
        const list = new Component('ul', { 'x-chunk': 2 });
        const rows = Array.from({ length: 7 }, (_, i) => new Row(i));
        list.controls.add(...rows);
        app.run(host, list);
        const ul = list.element as HTMLUListElement;
        expect(liCount(ul)).toBe(2);
        expect(rows[2].isWait).toBe(true);
        expect(rows[2].configured).toBe(0);
        expect(ul.childNodes.length).toBe(7);
        await until(() => liCount(ul) === 7);
        expect(texts(ul)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
        expect(ul.childNodes.length).toBe(7);
        expect(rows.every(r => !r.isWait && r.configured === 1)).toBe(true);
        await until(() => rows.every(r => r.mounted === 1));
    });

    test('children added to a built parent: the first chunk of a turn builds at once, the rest wait and follow; a new turn has a fresh budget', async () => {
        const list = new Component('ul', { 'x-chunk': 3 });
        app.run(host, list);
        const ul = list.element as HTMLUListElement;
        const rows = Array.from({ length: 5 }, (_, i) => new Row(i));
        list.controls.add(...rows);
        expect(liCount(ul)).toBe(3);
        expect(rows[3].isWait).toBe(true);
        expect(rows[3].configured).toBe(0);
        expect(ul.childNodes.length).toBe(5);
        await until(() => liCount(ul) === 5);
        expect(texts(ul)).toEqual(['0', '1', '2', '3', '4']);
        await tick(0);
        list.controls.add(new Row(5), new Row(6), new Row(7), new Row(8));
        expect(liCount(ul)).toBe(8);
        await until(() => liCount(ul) === 9);
        expect(texts(ul)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8']);
    });

    test('a waiting child disposed before its turn is skipped and the rest still arrive', async () => {
        const list = new Component('ul', { 'x-chunk': 1 });
        app.run(host, list);
        const rows = [new Row(0), new Row(1), new Row(2)];
        list.controls.add(...rows);
        rows[1].dispose();
        await until(() => liCount(list.element as Element) === 2);
        expect(texts(list.element as Element)).toEqual(['0', '2']);
        expect(rows[1].isDisposed).toBe(true);
        expect(rows[2].isWait).toBe(false);
    });

    test('a child with its own x-wait keeps its rule and is not sliced', async () => {
        const list = new Component('ul', { 'x-chunk': 1 });
        app.run(host, list);
        const state = reactive({ show: false });
        const gated = new Component('li', { 'x-wait': () => !state.show });
        (gated.element as HTMLElement).textContent = 'gated';
        list.controls.add(new Row(0), gated, new Row(2));
        await until(() => liCount(list.element as Element) === 2);
        expect(texts(list.element as Element)).toEqual(['0', '2']);
        expect(gated.isWait).toBe(true);
        state.show = true;
        await until(() => liCount(list.element as Element) === 3);
        expect(texts(list.element as Element)).toEqual(['0', 'gated', '2']);
    });

    test('a comment-rooted wrapper is transparent: its element children count against the host', async () => {
        const list = new Component('ul', { 'x-chunk': 2 });
        app.run(host, list);
        const rows = [new Row(0), new Row(1), new Row(2)];
        const wrapper = new Component(rows as any);
        list.controls.add(wrapper);
        const ul = list.element as HTMLUListElement;
        expect(liCount(ul)).toBe(2);
        expect(rows[2].isWait).toBe(true);
        await until(() => liCount(ul) === 3);
        expect(texts(ul)).toEqual(['0', '1', '2']);
    });

    test('a nested host slices on its own', async () => {
        const outer = new Component('div', { 'x-chunk': 1 });
        const inner = new Component('ul', { 'x-chunk': 1 });
        const innerRows = [new Row(0), new Row(1)];
        inner.controls.add(...innerRows);
        const late = new Row(9);
        outer.controls.add(inner, late);
        app.run(host, outer);
        expect(inner.isWait).toBe(false);
        expect(innerRows[1].isWait).toBe(true);
        expect(late.isWait).toBe(true);
        await until(() => !innerRows[1].isWait && !late.isWait && late.isBuilt);
        expect(liCount(outer.element as Element)).toBe(3);
    });

    test('disposing the host while children wait drains the queue without errors', async () => {
        const list = new Component('ul', { 'x-chunk': 1 });
        app.run(host, list);
        const rows = [new Row(0), new Row(1), new Row(2)];
        list.controls.add(...rows);
        await list.dispose();
        await tick(60);
        expect(rows.every(r => r.isDisposed)).toBe(true);
    });

    test('adding at an index while others wait keeps the order', async () => {
        const list = new Component('ul', { 'x-chunk': 1 });
        app.run(host, list);
        const rows = [new Row(0), new Row(1), new Row(2)];
        list.controls.add(...rows);
        await tick(0);
        list.controls.add(1, new Row(9));
        const ul = list.element as HTMLUListElement;
        expect(liCount(ul)).toBe(2);
        await until(() => liCount(ul) === 4);
        expect(texts(ul)).toEqual(['0', '9', '1', '2']);
    });

    test('many children added to a built parent arrive in order and leave no trace behind', async () => {
        const list = new Component('ul', { 'x-chunk': 7 });
        app.run(host, list);
        const ul = list.element as HTMLUListElement;
        const comments = () => [...ul.childNodes].filter(n => n.nodeType === Node.COMMENT_NODE).length;
        const before = comments();
        const rows = Array.from({ length: 60 }, (_, i) => new Row(i));
        list.controls.add(...rows);
        expect(liCount(ul)).toBe(7);
        await tick(0);
        list.controls.add(30, new Row(900));
        rows[40].dispose();
        await until(() => liCount(ul) === 60 && comments() === before);
        const expected = Array.from({ length: 60 }, (_, i) => String(i)).filter(n => n !== '40');
        expected.splice(30, 0, '900');
        expect(texts(ul)).toEqual(expected);
    });

    test('every chunked parent gets its own slice in each frame', async () => {
        const a = new Component('ul', { 'x-chunk': 2 });
        const b = new Component('ul', { 'x-chunk': 3 });
        const root = new Component('div');
        root.controls.add(a, b);
        app.run(host, root);
        const ae = a.element as HTMLUListElement;
        const be = b.element as HTMLUListElement;
        a.controls.add(...Array.from({ length: 8 }, (_, i) => new Row(i)));
        b.controls.add(...Array.from({ length: 9 }, (_, i) => new Row(i)));
        expect([liCount(ae), liCount(be)]).toEqual([2, 3]);
        await until(() => liCount(ae) > 2 || liCount(be) > 3);
        expect([liCount(ae), liCount(be)]).toEqual([4, 6]);
        await until(() => liCount(ae) === 8 && liCount(be) === 9);
        expect(texts(ae)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
        expect(texts(be)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8']);
    });

    test('x-chunk through props sets the option and zero switches it off', async () => {
        const chunked = new Component('ul', { 'x-chunk': 4 });
        expect(chunked.motif.options.chunk).toBe(4);
        const viaOptions = new Component('ul', { options: { chunk: 3 } } as any);
        expect(viaOptions.motif.options.chunk).toBe(3);
        const plain = new Component('ul', { 'x-chunk': 0 });
        plain.controls.add(new Row(0), new Row(1), new Row(2));
        app.run(host, plain);
        expect(liCount(plain.element as Element)).toBe(3);
    });

    test('chunk given through options on a class component slices the children of its root element', async () => {
        class Board extends Component<HTMLUListElement> {
            constructor() {
                super('ul');
                this.controls.add(...Array.from({ length: 5 }, (_, i) => new Row(i)));
            }
        }
        const board = motifComponent(Board, { options: { chunk: 2 } } as any) as Board;
        app.run(host, board);
        const ul = board.element as HTMLUListElement;
        expect(board.motif.options.chunk).toBe(2);
        expect(liCount(ul)).toBe(2);
        await until(() => liCount(ul) === 5);
        expect(texts(ul)).toEqual(['0', '1', '2', '3', '4']);
    });

    test('x-chunk written on a class or function component tag reaches the root the tag builds', async () => {
        class Board extends Component<HTMLUListElement> {
            constructor() {
                super('ul');
                this.controls.add(...Array.from({ length: 3 }, (_, i) => new Row(i)));
            }
        }
        const board = motifComponent(Board, { runover: { 'x-chunk': 1 } } as any) as Board;
        const FnBoard = () => {
            const ul = new Component('ul');
            ul.controls.add(...Array.from({ length: 3 }, (_, i) => new Row(i)));
            return ul;
        };
        const fnRoot = motifComponent(FnBoard as any, { runover: { 'x-chunk': 1 } } as any) as Component;
        const page = new Component('div');
        page.controls.add(board, fnRoot);
        app.run(host, page);
        expect(board.motif.options.chunk).toBe(1);
        expect(fnRoot.motif.options.chunk).toBe(1);
        expect(liCount(board.element as Element)).toBe(1);
        expect(liCount(fnRoot.element as Element)).toBe(1);
        await until(() => liCount(board.element as Element) === 3 && liCount(fnRoot.element as Element) === 3);
    });
});
