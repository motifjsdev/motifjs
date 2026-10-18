/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, ComponentBase, motifFragment, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'HBP.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(...children: ComponentBase[]) {
    const el = document.createElement('section');
    document.body.appendChild(el);
    const root = new Component(el);
    root.build();
    for (const c of children) root.controls.add(c);
    return { root, el };
}

function shape(node: Node): string {
    const out: string[] = [];
    node.childNodes.forEach(n => {
        if (n.nodeType === Node.COMMENT_NODE) {
            const t = (n as Comment).data;
            if (t === 'h') out.push('#');
            else if (t === '[' || t === ']') return;
            else out.push(`<!--${t}-->`);
        } else if (n.nodeType === Node.TEXT_NODE) {
            if ((n as Text).data.trim()) out.push((n as Text).data.trim());
        } else {
            const el = n as Element;
            if (el.children.length === 0) out.push(el.textContent ?? '');
            else out.push(`${el.tagName.toLowerCase()}(${shape(el)})`);
        }
    });
    return out.join(' ');
}

const item = (text: string, props: Record<string, any> = {}) =>
    new Component('li', { ...props, initializeComponent: (s: ComponentBase) => s.setText(text) } as any);

afterEach(() => { document.body.innerHTML = ''; });

describe('a component hidden before its parent places it keeps its place with a trace', () => {
    test('an element hidden before its parent is built', async () => {
        const list = new Component('ul');
        const [a, b, c] = ['a', 'b', 'c'].map(t => item(t));
        list.controls.add(a, b, c);
        await b.motif.hide();
        const { root, el } = mount(list);
        await settle();
        expect(el.innerHTML).toBe('<ul><li>a</li><!--h--><li>c</li></ul>');
        expect(b.isVisible).toBe(false);
        await b.motif.show();
        await settle();
        expect(el.innerHTML).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
        expect(b.isVisible).toBe(true);
        await b.motif.hide();
        await settle();
        expect(el.innerHTML).toBe('<ul><li>a</li><!--h--><li>c</li></ul>');
        root.dispose();
    });

    test('an element that hides itself in its setup while its parent is built', async () => {
        const toolbar = new Component('div');
        const hint = new Component('p', { initializeComponent: (s: ComponentBase) => { s.setText('ipucu'); s.motif.hide(); } } as any);
        toolbar.controls.add(new Component('b'), hint, new Component('u'));
        const { root, el } = mount(toolbar);
        await settle();
        expect(el.innerHTML).toBe('<div><b></b><!--h--><u></u></div>');
        await hint.motif.show();
        await settle();
        expect(el.innerHTML).toBe('<div><b></b><p>ipucu</p><u></u></div>');
        root.dispose();
    });

    test('a class component that hides itself in onBuilt', async () => {
        const net = { online: true };
        const refs: Record<string, any> = {};
        const Shell = evalJsx(`class OfflineBanner extends Component<HTMLElement> {
            static elementTag = "aside";
            onBuilt() { if (net.online) this.motif.hide(); }
            view() { return <>Bağlantı yok</>; }
        }
        function Shell() { return <div><OfflineBanner ref={(b) => (refs.banner = b)} /><main>Notlar</main></div>; }`, 'Shell', { net, refs });
        const { root, el } = mount(Shell());
        await settle();
        expect(shape(el)).toBe('div(# Notlar)');
        expect(refs.banner.isVisible).toBe(false);
        await refs.banner.motif.show();
        await settle();
        expect(shape(el)).toBe('div(Bağlantı yok Notlar)');
        await refs.banner.motif.hide();
        await settle();
        expect(shape(el)).toBe('div(# Notlar)');
        root.dispose();
    });

    test('list rows that hide themselves on the first render behave like rows added later', async () => {
        const notes = reactive({
            items: [
                { id: 1, title: 'alışveriş', archived: false },
                { id: 2, title: 'fatura', archived: true },
                { id: 3, title: 'toplantı', archived: false },
            ],
        });
        const rows: ComponentBase[] = [];
        const NoteList = evalJsx(`class NoteRow extends Component<HTMLLIElement> {
            onConfigured() { if (this.props.note.archived) this.motif.hide(); }
            view() { return <>{this.props.note.title}</>; }
        }
        function NoteList() { return <ul>{notes.items.map((n) => <NoteRow note={n} ref={(r) => rows.push(r)} />)}</ul>; }`, 'NoteList', { notes, rows });
        const { root, el } = mount(NoteList());
        await settle();
        expect(shape(el)).toBe('ul(alışveriş # toplantı)');
        notes.items.push({ id: 4, title: 'eski not', archived: true });
        await settle();
        expect(shape(el)).toBe('ul(alışveriş # toplantı #)');
        notes.items = notes.items.slice().reverse();
        await settle();
        expect(shape(el)).toBe('ul(# toplantı # alışveriş)');
        const bill = rows.find(r => r.props.note.id === 2)!;
        await bill.motif.show();
        await settle();
        expect(shape(el)).toBe('ul(# toplantı fatura alışveriş)');
        root.dispose();
    });

    test('with the detach strategy the element is left out and show puts it back in order', async () => {
        const list = new Component('ul');
        const a = item('a'), b = item('b', { options: { hideStrategy: 'detach' } }), c = item('c');
        list.controls.add(a, b, c);
        await b.motif.hide();
        const { root, el } = mount(list);
        await settle();
        expect(el.innerHTML).toBe('<ul><li>a</li><li>c</li></ul>');
        await b.motif.show();
        await settle();
        expect(el.innerHTML).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
        await b.motif.hide();
        await settle();
        expect(el.innerHTML).toBe('<ul><li>a</li><li>c</li></ul>');
        root.dispose();
    });

    test('a fragment hidden before it is built leaves a trace for each of its children', async () => {
        const group = motifFragment({}) as ComponentBase;
        group.controls.add(item('a'), item('b'));
        await group.motif.hide();
        const list = new Component('ul');
        list.controls.add(item('başlık'), group);
        const { root, el } = mount(list);
        await settle();
        expect(el.innerHTML).toBe('<ul><li>başlık</li><!--[--><!--h--><!--h--><!--]--></ul>');
        await group.motif.show();
        await settle();
        expect(el.innerHTML).toBe('<ul><li>başlık</li><!--[--><li>a</li><li>b</li><!--]--></ul>');
        await group.motif.hide();
        await settle();
        expect(el.innerHTML).toBe('<ul><li>başlık</li><!--[--><!--h--><!--h--><!--]--></ul>');
        root.dispose();
    });
});
