/**
 * @jest-environment jsdom
 */
import { Application, Component, motifComponent, reactive } from '@motifx/core';

class Card extends Component {
    constructor(public title: string) { super('article'); }
}

class Board extends Component {
    items = reactive([{ id: 1, title: 'a' }, { id: 2, title: 'b' }]);
    constructor() {
        super('section');
        this.controls.add(motifComponent({
            initializeComponent: (sender: any) => {
                sender.bindings.list(() => this.items, (item: { title: string }) => new Card(item.title));
            },
        }));
    }
}

class OwnList extends Component {
    items = reactive([1, 2]);
    constructor() {
        super('ul');
        this.bindings.list(() => this.items, (n: number) => new Component('li', { text: String(n) } as any));
    }
}

describe('devtools list names', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    function run(make: () => Component, dev = true) {
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(dev);
        app.run(host, make());
    }

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
    });

    const shape = (path: number[], depth: number) => {
        const out: string[] = [];
        const walk = (n: any, d: number) => {
            out.push(`${'  '.repeat(d)}${n.type} <${n.tag}>`);
            for (const c of n.children ?? []) walk(c, d + 1);
        };
        walk(hook().getTree(path, depth), 0);
        return out;
    };

    test('a list from JSX shows as List holding ListItems holding the items', () => {
        run(() => new Board());
        expect(shape([0], 3)).toEqual([
            'Board <section>',
            '  List <#fragment>',
            '    ListItems <#fragment>',
            '      Card <article>',
            '      Card <article>',
        ]);
    });

    test('a component that builds its own list keeps its name', () => {
        run(() => new OwnList());
        expect(shape([0], 2)).toEqual([
            'OwnList <ul>',
            '  ListItems <#fragment>',
            '    Component <li>',
            '    Component <li>',
        ]);
    });

    test('lists are not named while devtools is off', () => {
        run(() => new Board(), false);
        app.useDevelopment(true);
        expect(shape([0], 1)).toEqual(['Board <section>', '  Component <#fragment>']);
    });

    test('the counters count lists by their names', () => {
        run(() => new Board());
        const byType = hook().getCounters().components.byType;
        expect(byType.List).toBe(1);
        expect(byType.ListItems).toBe(1);
        expect(byType.Card).toBe(2);
    });
});
