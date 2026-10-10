import { Component, ComponentBase, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function host(count: number) {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    const kids: ComponentBase[] = [];
    for (let i = 0; i < count; i++) {
        const c = new Component('i');
        c.setText(String(i));
        root.controls.add(c);
        kids.push(c);
    }
    return { root, el, kids };
}

const names = (root: ComponentBase) => root.controls.items.map(c => (c.element as HTMLElement).textContent);

afterEach(() => { document.body.innerHTML = ''; });

describe('taking children out of a collection', () => {
    test('remove keeps the order of the rest from the front, the middle and the end', async () => {
        const { root, el, kids } = host(6);
        root.controls.remove(kids[0]);
        expect(names(root)).toEqual(['1', '2', '3', '4', '5']);
        root.controls.remove(kids[3]);
        expect(names(root)).toEqual(['1', '2', '4', '5']);
        root.controls.remove(kids[5]);
        expect(names(root)).toEqual(['1', '2', '4']);
        root.controls.remove(new Component('b'));
        expect(names(root)).toEqual(['1', '2', '4']);
        await settle();
        expect(el.textContent).toBe('124');
        expect([kids[0], kids[3], kids[5]].every(k => k.isDisposed)).toBe(true);
        root.dispose();
    });

    test('detach keeps the order and leaves the child alive', async () => {
        const { root, el, kids } = host(5);
        await root.controls.detach(kids[0]);
        await root.controls.detach(kids[2]);
        await root.controls.detach(kids[4]);
        expect(names(root)).toEqual(['1', '3']);
        expect(el.textContent).toBe('13');
        expect([kids[0], kids[2], kids[4]].map(k => [k.parent, k.isDisposed])).toEqual([[null, false], [null, false], [null, false]]);
        await root.controls.detach(kids[0]);
        expect(names(root)).toEqual(['1', '3']);
        root.dispose();
    });

    test('silentDetach and silentUnlink keep the order', () => {
        const { root, el, kids } = host(6);
        root.controls.silentDetach(kids[0]);
        root.controls.silentDetach(kids[3]);
        expect(names(root)).toEqual(['1', '2', '4', '5']);
        expect(el.textContent).toBe('1245');
        root.controls.silentUnlink(kids[1]);
        root.controls.silentUnlink(kids[5]);
        expect(names(root)).toEqual(['2', '4']);
        expect(kids[1].parent).toBeNull();
        expect(el.textContent).toBe('1245');
        root.controls.silentUnlink(kids[1]);
        expect(names(root)).toEqual(['2', '4']);
        root.dispose();
    });

    test('removing every child from the front one by one leaves an empty, usable collection', () => {
        for (const how of ['remove', 'silentDetach', 'silentUnlink'] as const) {
            const { root, kids } = host(50);
            for (const k of kids) (root.controls as any)[how](k);
            expect(root.controls.items).toEqual([]);
            root.controls.add(new Component('b'));
            expect(root.controls.items.length).toBe(1);
            root.dispose();
        }
    });

    test('while a bound list is cleared each row still sees itself and the rows after it', async () => {
        const seen: string[] = [];
        const state = reactive({ rows: [1, 2, 3, 4].map(id => ({ id })) });
        const el = document.createElement('section');
        document.body.appendChild(el);
        const root = new Component(el);
        root.build();
        const list: any = new Component('ul');
        root.controls.add(list);
        list.bindings.list(() => state.rows, (item: any) => new Component('li', {
            onDisposing: (s: ComponentBase) => {
                seen.push(item.id + ':' + (s.parent ? s.parent.controls.items.length : -1));
            },
        } as any));
        await settle();
        expect(list.element.children.length).toBe(4);
        state.rows = [];
        await settle();
        expect(seen).toEqual(['1:4', '2:3', '3:2', '4:1']);
        expect(list.element.children.length).toBe(0);
        root.dispose();
    });
});
