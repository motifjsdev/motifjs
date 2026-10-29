import { Component } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

let built = 0;
let disposed = 0;

class Row extends Component {
    constructor(item: any) {
        super('li');
        built++;
        (this.element as HTMLElement).dataset.id = String(typeof item === 'object' ? item.id : item);
        this.bindings.text(() => String(typeof item === 'object' ? item.name : item));
    }
    onDisposed() { disposed++; }
}

function mount(s: { items: any[] }) {
    const host = document.createElement('ul');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.bindings.list(() => s.items, (item: any) => new Row(item));
    const lis = () => Array.from(host.querySelectorAll('li')) as HTMLElement[];
    return {
        root,
        lis,
        ids: () => lis().map(li => li.dataset.id).join(','),
        texts: () => lis().map(li => li.textContent).join(','),
    };
}

const obj = (i: number) => ({ id: i, name: 'n' + i });

describe.each(['setState', 'reState'] as const)('%s keeps list rows of plain data', (call) => {
    beforeEach(() => { built = 0; disposed = 0; });
    afterEach(() => { document.body.innerHTML = ''; });

    test('same array and same items keep every row', async () => {
        const s = { items: [obj(1), obj(2), obj(3)] };
        const m = mount(s);
        await settle();
        const before = m.lis();
        m.root[call]();
        await settle();
        expect(m.lis()).toEqual(before);
        expect(built).toBe(3);
        expect(disposed).toBe(0);
    });

    test('a removed item disposes only its row', async () => {
        const s = { items: [obj(1), obj(2), obj(3)] };
        const m = mount(s);
        await settle();
        const [first, , third] = m.lis();
        s.items.splice(1, 1);
        m.root[call]();
        await settle();
        expect(m.ids()).toBe('1,3');
        expect(m.lis()).toEqual([first, third]);
        expect(built).toBe(3);
        expect(disposed).toBe(1);
    });

    test('a new item builds one row', async () => {
        const s = { items: [obj(1), obj(2)] };
        const m = mount(s);
        await settle();
        const [first, second] = m.lis();
        s.items.push(obj(3));
        m.root[call]();
        await settle();
        expect(m.ids()).toBe('1,2,3');
        expect(m.lis().slice(0, 2)).toEqual([first, second]);
        expect(built).toBe(3);
        expect(disposed).toBe(0);
    });

    test('a new order moves the rows', async () => {
        const s = { items: [obj(1), obj(2), obj(3)] };
        const m = mount(s);
        await settle();
        const [first, second, third] = m.lis();
        s.items.reverse();
        m.root[call]();
        await settle();
        expect(m.ids()).toBe('3,2,1');
        expect(m.lis()).toEqual([third, second, first]);
        expect(built).toBe(3);
        expect(disposed).toBe(0);
    });

    test('a kept row re-reads its own bindings', async () => {
        const s = { items: [obj(1), obj(2)] };
        const m = mount(s);
        await settle();
        const before = m.lis();
        s.items[1].name = 'changed';
        m.root[call]();
        await settle();
        expect(m.lis()).toEqual(before);
        expect(m.texts()).toBe('n1,changed');
        expect(disposed).toBe(0);
    });

    test('a number array keeps the rows of kept values', async () => {
        const s = { items: [1, 2, 3] };
        const m = mount(s);
        await settle();
        const [one, , three] = m.lis();
        s.items = [1, 3, 4];
        m.root[call]();
        await settle();
        expect(m.ids()).toBe('1,3,4');
        expect(m.lis().slice(0, 2)).toEqual([one, three]);
        expect(built).toBe(4);
        expect(disposed).toBe(1);
    });

    test('disposing the owner still disposes every row', async () => {
        const s = { items: [obj(1), obj(2), obj(3)] };
        const m = mount(s);
        await settle();
        m.root[call]();
        await settle();
        m.root.dispose();
        await settle();
        expect(disposed).toBe(3);
    });
});
