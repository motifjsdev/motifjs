/**
 * @jest-environment jsdom
 */
import { Application, Component, motifComponent, reactive } from '@motifx/core';

class Card extends Component {
    constructor(public label: string) { super('article'); }
}

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

describe('devtools conditional names', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let s: { on: boolean; n: number; mode: string };

    const view = () => motifComponent('div', {
        initializeComponent: (sender: any) => {
            sender.bindings.ternary(() => s.on, (f: any) => f.navigate(new Card('yes')), (f: any) => f.navigate(new Card('no')));
            sender.bindings.when(() => s.on, () => new Card('when'));
            sender.bindings.method(() => (s.n > 1 ? new Card('many') : null));
            sender.bindings.switchCase(() => s.mode, { a: (f: any) => f.navigate(new Card('a')) });
        },
    });

    function run(dev = true) {
        s = reactive({ on: false, n: 1, mode: 'x' });
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(dev);
        app.run(host, view());
    }

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
    });

    const shape = () => {
        const out: string[] = [];
        const walk = (n: any, d: number) => {
            out.push(`${'  '.repeat(d)}${n.type}`);
            for (const c of n.children ?? []) walk(c, d + 1);
        };
        for (const c of hook().getTree([0, 0], 2).children) walk(c, 0);
        return out;
    };

    test('each kind of condition is named, and an empty branch shows as Empty', () => {
        run();
        expect(shape()).toEqual([
            'Ternary', '  Card',
            'When', '  Empty',
            'Expression', '  Empty',
            'Switch', '  Empty',
        ]);
    });

    test('Empty goes away when the condition brings content', async () => {
        run();
        s.on = true;
        s.n = 2;
        s.mode = 'a';
        await tick();
        expect(shape()).toEqual([
            'Ternary', '  Card',
            'When', '  Card',
            'Expression', '  Card',
            'Switch', '  Card',
        ]);
        s.on = false;
        await tick();
        expect(shape().slice(2, 4)).toEqual(['When', '  Empty']);
    });

    test('conditions are not named while devtools is off', () => {
        run(false);
        app.useDevelopment(true);
        expect(shape()).toEqual([
            'Frame', '  Card',
            'Frame', '  FragmentNode',
            'Frame', '  FragmentNode',
            'Frame', '  FragmentNode',
        ]);
    });
});
