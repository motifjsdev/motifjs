import { Component, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

class Person {
    constructor(public id: number, public name: string) { }
    label() { return this.name.toUpperCase(); }
}

let live = 0;

class Row extends Component {
    constructor(item: any) {
        super('li');
        live++;
        (this.element as HTMLElement).dataset.id = String(item.id);
        this.bindings.text(() => String(item.name));
    }
    onDisposed() { live--; }
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

describe('list rows and item identity', () => {
    beforeEach(() => { live = 0; });
    afterEach(() => { document.body.innerHTML = ''; });

    test('splice inserts the object itself', () => {
        const s = reactive({ items: [obj(1)] });
        const o = obj(2);
        s.items.splice(0, 0, o);
        s.items[0].name = 'via-list';
        expect(o.name).toBe('via-list');
    });

    test('splice keeps class instances, Maps and self references', () => {
        const s = reactive({ items: [] as any[] });
        s.items.splice(0, 0, new Person(1, 'ada'));
        expect(s.items[0] instanceof Person).toBe(true);
        expect(s.items[0].label()).toBe('ADA');
        const withMap = { id: 2, tags: new Map([['a', 1]]) };
        s.items.splice(0, 0, withMap);
        expect(s.items[0].tags instanceof Map).toBe(true);
        const self: any = { id: 3 };
        self.self = self;
        expect(() => s.items.splice(0, 0, self)).not.toThrow();
    });

    test('a moved row keeps its DOM node', async () => {
        const s = reactive({ items: [1, 2, 3, 4].map(obj) });
        const m = mount(s);
        await settle();
        const node4 = m.lis()[3];
        const [moved] = s.items.splice(3, 1);
        s.items.splice(0, 0, moved);
        await settle();
        expect(m.ids()).toBe('4,1,2,3');
        expect(m.lis()[0]).toBe(node4);
        await m.root.dispose();
    });

    test('appending rows preserves existing nodes without per-row anchor searches', async () => {
        const s = reactive({ items: [obj(1), obj(2), obj(3)] });
        const m = mount(s);
        await settle();
        const before = m.lis();
        const rowControls = m.root.controls.items[0].controls.items;
        const originalIndexOf = rowControls.indexOf.bind(rowControls);
        let indexOfCalls = 0;
        (rowControls as any).indexOf = (...args: any[]) => {
            indexOfCalls++;
            return originalIndexOf(args[0], args[1]);
        };

        s.items = s.items.concat([obj(4), obj(5)]);
        await settle();
        delete (rowControls as any).indexOf;

        expect(m.ids()).toBe('1,2,3,4,5');
        expect(m.lis().slice(0, 3)).toEqual(before);
        expect(indexOfCalls).toBe(0);
        await m.root.dispose();
    });

    test.each([
        ['splice with 3 arguments', (items: any[]) => items.splice(1, 0, items[0]), '1,1,2,3'],
        ['splice with 4 arguments', (items: any[]) => items.splice(1, 0, items[0], items[1]), '1,1,2,2,3'],
        ['push', (items: any[]) => items.push(items[0]), '1,2,3,1'],
        ['unshift', (items: any[]) => items.unshift(items[2]), '3,1,2,3'],
        ['index assignment', (items: any[]) => { items[2] = items[0]; }, '1,2,1'],
    ])('an object added twice with %s gets a row per occurrence', async (_name, add, expected) => {
        const s = reactive({ items: [1, 2, 3].map(obj) });
        const m = mount(s);
        await settle();
        add(s.items);
        await settle();
        expect(m.ids()).toBe(expected);
        expect(live).toBe(expected.split(',').length);
        await m.root.dispose();
    });

    test('every occurrence of a duplicated object shows its edits', async () => {
        const a = obj(1);
        const s = reactive({ items: [a, obj(2), a] });
        const m = mount(s);
        await settle();
        s.items[0].name = 'E';
        await settle();
        expect(m.texts()).toBe('E,n2,E');
        await m.root.dispose();
    });

    test('sort and reverse with duplicates', async () => {
        const [a, b, c] = [1, 2, 3].map(obj);
        const s = reactive({ items: [a, b, a, c, b] });
        const m = mount(s);
        await settle();
        s.items.sort((x: any, y: any) => x.id - y.id);
        await settle();
        expect(m.ids()).toBe('1,1,2,2,3');
        s.items.reverse();
        await settle();
        expect(m.ids()).toBe('3,2,2,1,1');
        expect(live).toBe(5);
        await m.root.dispose();
    });

    test('removing one occurrence disposes one row, clearing disposes all', async () => {
        const a = obj(1);
        const s = reactive({ items: [a, obj(2), a] });
        const m = mount(s);
        await settle();
        expect(live).toBe(3);
        s.items.splice(2, 1);
        await settle();
        expect(m.ids()).toBe('1,2');
        expect(live).toBe(2);
        s.items = [];
        await settle();
        expect(live).toBe(0);
        await m.root.dispose();
    });

    test('row state follows its item when the list is sorted', async () => {
        const s = reactive({ items: [1, 2, 3].map(obj) });
        const m = mount(s);
        await settle();
        m.lis().forEach(li => { (li as any).state = 'v' + li.dataset.id; });
        s.items.sort((x: any, y: any) => y.id - x.id);
        await settle();
        expect(m.lis().map(li => li.dataset.id + '=' + (li as any).state).join(',')).toBe('3=v3,2=v2,1=v1');
        await m.root.dispose();
    });
});
