/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, motifComponent, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function mount() {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    return host;
}

const item = (text: string) => motifComponent('li', {
    initializeComponent: (s: ComponentBase) => { s.setText(text); }
}) as ComponentBase;

const domOrder = (c: ComponentBase) => Array.from((c.element as unknown as HTMLElement).children).map(e => e.textContent).join('');
const listOrder = (c: ComponentBase) => c.controls.items.map(x => (x.element as unknown as HTMLElement).textContent).join('');

function setup(letters: string) {
    const host = mount();
    const items = letters.split('').map(item);
    host.controls.add(...items);
    const by = (letter: string) => items[letters.indexOf(letter)];
    return { host, by };
}

describe('controls.move', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('moves an item before the item two positions after it', () => {
        const { host, by } = setup('ABC');
        host.controls.move(by('A'), by('C'));
        expect(listOrder(host)).toBe('BAC');
        expect(domOrder(host)).toBe('BAC');
    });

    it('leaves an item in place when moved before its next sibling', () => {
        const { host, by } = setup('ABC');
        host.controls.move(by('A'), by('B'));
        expect(listOrder(host)).toBe('ABC');
        expect(domOrder(host)).toBe('ABC');
    });

    it('moves an item backwards', () => {
        const { host, by } = setup('ABC');
        host.controls.move(by('C'), by('A'));
        expect(listOrder(host)).toBe('CAB');
        expect(domOrder(host)).toBe('CAB');
    });

    it('moves an item to the end when no reference is given', () => {
        const { host, by } = setup('ABC');
        host.controls.move(by('A'));
        expect(listOrder(host)).toBe('BCA');
        expect(domOrder(host)).toBe('BCA');
    });

    it('leaves the last item in place when no reference is given', () => {
        const { host, by } = setup('ABC');
        host.controls.move(by('C'));
        expect(listOrder(host)).toBe('ABC');
        expect(domOrder(host)).toBe('ABC');
    });

    it('handles every source and target pair in a five item list', () => {
        const letters = 'ABCDE';
        for (const from of letters) {
            for (const to of letters + '_') {
                if (from === to) continue;
                const { host, by } = setup(letters);
                host.controls.move(by(from), to === '_' ? null : by(to));
                const rest = letters.replace(from, '');
                const at = to === '_' ? rest.length : rest.indexOf(to);
                const expected = rest.slice(0, at) + from + rest.slice(at);
                expect(listOrder(host)).toBe(expected);
                expect(domOrder(host)).toBe(expected);
                document.body.innerHTML = '';
            }
        }
    });

    it('keeps a bound list in source order across random reorders', async () => {
        const st = reactive({ rows: 'ABCDEFG'.split('').map(id => ({ id })) });
        const list = new Component('ul', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.list(() => st.rows, (row: any) => item(row.id));
            }
        } as any);
        const host = mount();
        host.controls.add(list);
        await tick();
        let seed = 7;
        const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
        for (let round = 0; round < 200; round++) {
            const rows = st.rows.slice();
            for (let i = rows.length - 1; i > 0; i--) {
                const j = next() % (i + 1);
                [rows[i], rows[j]] = [rows[j], rows[i]];
            }
            st.rows = rows;
            await tick();
            expect(domOrder(list)).toBe(rows.map(r => r.id).join(''));
        }
    });
});
