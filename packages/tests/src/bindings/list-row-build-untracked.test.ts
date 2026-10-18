/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = async () => { await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); };

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'ListRows.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

let host: HTMLElement;
let root: Component;

beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host as any);
    root.build();
});

afterEach(() => {
    root.dispose();
    host.remove();
});

const text = (el: Element) => el.innerHTML.replace(/<!--.*?-->/g, '');

describe('a row added after the first draw is built outside the list effect', () => {
    test('a field read directly while the row builds does not subscribe the list', async () => {
        const s = reactive({ items: [{ id: 1, title: 'bir' }, { id: 2, title: 'iki' }] });
        let runs = 0;
        const ul = new Component('ul', {
            initializeComponent: (x: any) => x.bindings.list(
                () => { runs++; return s.items; },
                (item: any) => new Component('li', { initializeComponent: (li: any) => li.setText(item.title) }))
        });
        root.controls.add(ul);
        await settle();
        expect(text(ul.element as Element)).toBe('<li>bir</li><li>iki</li>');
        const afterFirstDraw = runs;

        s.items.push({ id: 3, title: 'uc' });
        await settle();
        expect(runs).toBe(afterFirstDraw + 1);
        expect(text(ul.element as Element)).toBe('<li>bir</li><li>iki</li><li>uc</li>');

        const afterPush = runs;
        s.items[2].title = 'UC';
        await settle();
        expect(runs).toBe(afterPush);
        expect(text(ul.element as Element)).toBe('<li>bir</li><li>iki</li><li>uc</li>');

        s.items[0].title = 'BIR';
        await settle();
        expect(runs).toBe(afterPush);
    });

    test('a class row whose view() reads a field: the list does not re-run when that field changes later', async () => {
        const m = load(`
import { Component, reactive } from '@motifx/core';
const s = reactive({ items: [{ id: 1, title: 'bir', done: false }, { id: 2, title: 'iki', done: false }] });
const runs = { n: 0 };
class Row extends Component<HTMLLIElement> {
  view() { const n = this.props.n; if (n.done) this.class.add('done'); return <>{n.title}</>; }
}
function List() { return <ul>{(() => { runs.n++; return s.items; })().map(n => <Row n={n} />)}</ul>; }
`, ['s', 'List', 'runs']);
        root.controls.add(m.List());
        await settle();
        const ul = host.querySelector('ul') as HTMLElement;
        expect(ul.querySelectorAll('li').length).toBe(2);

        m.s.items.push({ id: 3, title: 'uc', done: false });
        await settle();
        expect(ul.querySelectorAll('li').length).toBe(3);
        const afterPush = m.runs.n;

        m.s.items[2].done = true;
        await settle();
        expect(m.runs.n).toBe(afterPush);
        expect(ul.querySelectorAll('li').length).toBe(3);

        m.s.items[2].title = 'UC';
        await settle();
        expect(m.runs.n).toBe(afterPush);
        expect(ul.querySelectorAll('li')[2].textContent).toBe('UC');
    });

    test('bindings created while the row builds stay live', async () => {
        const s = reactive({ items: [{ id: 1, title: 'bir' }] });
        const ul = new Component('ul', {
            initializeComponent: (x: any) => x.bindings.list(
                () => s.items,
                (item: any) => new Component('li', { initializeComponent: (li: any) => li.bindings.text(() => item.title) }))
        });
        root.controls.add(ul);
        await settle();
        s.items.push({ id: 2, title: 'iki' });
        await settle();
        s.items[1].title = 'IKI';
        await settle();
        expect(text(ul.element as Element)).toBe('<li>bir</li><li>IKI</li>');
    });
});
