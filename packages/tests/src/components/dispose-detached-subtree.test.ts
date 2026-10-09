import { Application, Component, ComponentBase, motifFragment, reactive } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const settle = async () => { await tick(); await tick(); };

function host() {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = new Component(el);
    app.build();
    return { el, app };
}

function tree(log: string[], probe?: (name: string, c: ComponentBase, phase: string) => void) {
    const mk = (name: string, tag = 'div') => {
        const c = new Component(tag, {});
        c.motif.on('x:disposing' as any, () => { log.push(`disposing:${name}`); probe?.(name, c, 'disposing'); });
        c.motif.on('x:disposed' as any, () => { log.push(`disposed:${name}`); probe?.(name, c, 'disposed'); });
        return c;
    };
    const root = mk('root'), a = mk('a'), b = mk('b'), a1 = mk('a1', 'span'), a2 = mk('a2', 'span'), b1 = mk('b1', 'span'), a1x = mk('a1x', 'i');
    a1.controls.add(a1x);
    a.controls.add(a1, a2);
    b.controls.add(b1);
    root.controls.add(a, b);
    return { root, a, b, a1, a2, b1, a1x };
}

describe('disposing a subtree', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('ondisposing and ondisposed run level by level, by subtree height', async () => {
        const log: string[] = [];
        const { el, app } = host();
        const t = tree(log);
        app.controls.add(t.root);
        await settle();
        const p = t.root.dispose();
        log.push('returned');
        await p;
        expect(log).toEqual([
            'disposing:root', 'returned',
            'disposing:a', 'disposing:b', 'disposing:a1', 'disposing:a2', 'disposing:b1', 'disposing:a1x',
            'disposed:a2', 'disposed:b1', 'disposed:a1x', 'disposed:b', 'disposed:a1', 'disposed:a', 'disposed:root',
        ]);
        expect(el.childNodes.length).toBe(0);
    });

    test('the root leaves the document during the dispose call, the component is disposed after it', async () => {
        const { el, app } = host();
        const t = tree([]);
        app.controls.add(t.root);
        await settle();
        const rootEl = t.root.element as unknown as HTMLElement;
        const p = t.root.dispose();
        expect(rootEl.isConnected).toBe(false);
        expect(el.contains(rootEl)).toBe(false);
        expect(t.root.isDisposed).toBe(false);
        await p;
        expect(t.root.isDisposed).toBe(true);
        for (const c of [t.a, t.b, t.a1, t.a2, t.b1, t.a1x]) expect(c.isDisposed).toBe(true);
    });

    test('hooks see the root in the document and the descendants out of it', async () => {
        const seen: Record<string, boolean> = {};
        const { app } = host();
        const t = tree([], (name, c, phase) => { seen[`${phase}:${name}`] = !!(c.element as any)?.isConnected; });
        app.controls.add(t.root);
        await settle();
        await t.root.dispose();
        expect(seen['disposing:root']).toBe(true);
        for (const n of ['a', 'b', 'a1', 'a2', 'b1', 'a1x']) {
            expect(seen[`disposing:${n}`]).toBe(false);
            expect(seen[`disposed:${n}`]).toBe(false);
        }
        expect(seen['disposed:root']).toBe(false);
    });

    test('a descendant whose element was moved into document.body is removed from it', async () => {
        const { app } = host();
        const root = new Component('div', {});
        const panel = new Component('section', {});
        const overlay = new Component('aside', {});
        panel.controls.add(overlay);
        root.controls.add(panel);
        app.controls.add(root);
        await settle();
        document.body.appendChild(overlay.element as any);
        expect((overlay.element as any).isConnected).toBe(true);
        const overlayEl = overlay.element as unknown as HTMLElement;
        await root.dispose();
        expect(overlayEl.isConnected).toBe(false);
        expect(document.body.contains(overlayEl)).toBe(false);
        expect(overlay.isDisposed).toBe(true);
    });

    test('an element kept on dispose stays in place and its children leave it', async () => {
        const { el, app } = host();
        const shell = new Component('main', {});
        (shell as any)._keepElementOnDispose = true;
        const x = new Component('p', {});
        const y = new Component('p', {});
        x.controls.add(new Component('b', {}));
        shell.controls.add(x, y);
        app.controls.add(shell);
        await settle();
        const shellEl = shell.element as unknown as HTMLElement;
        await shell.dispose();
        expect(shellEl.isConnected).toBe(true);
        expect(el.contains(shellEl)).toBe(true);
        expect(shellEl.childNodes.length).toBe(0);
    });

    test('disposing an application leaves its host element empty', async () => {
        const el = document.createElement('div');
        el.id = 'app-host';
        document.body.appendChild(el);
        const app = Application.CreateBuilder().build();
        class Page extends Component<HTMLDivElement> {
            constructor() { super('div', {}); }
            view() {
                const section = new Component('section', {});
                section.controls.add(new Component('b', {}), new Component('i', {}));
                return section;
            }
        }
        app.run('#app-host', new Page());
        await settle();
        expect(el.querySelector('b')).not.toBeNull();
        await app.dispose();
        await settle();
        expect(document.getElementById('app-host')).toBe(el);
        expect(el.querySelector('b')).toBeNull();
        expect(el.querySelector('section')).toBeNull();
    });

    test('hidden children and their placeholders go with the subtree', async () => {
        const { el, app } = host();
        const root = new Component('div', {});
        const shown = new Component('span', {});
        const hidden = new Component('em', {});
        const waiting = new Component('u', {});
        root.controls.add(shown, hidden, waiting);
        app.controls.add(root);
        await settle();
        await hidden.motif.hide();
        waiting.isWait = true;
        await settle();
        await root.dispose();
        expect(el.childNodes.length).toBe(0);
        for (const c of [root, shown, hidden, waiting]) expect(c.isDisposed).toBe(true);
        expect((hidden.element as any)?.isConnected ?? false).toBe(false);
    });

    test('a fragment child and a fragment root take their ranges with them', async () => {
        const { el, app } = host();
        const root = new Component('div', {});
        const frag = motifFragment({});
        frag.controls.add(new Component('b', {}), new Component('i', {}));
        root.controls.add(new Component('span', {}), frag);
        const topFrag = motifFragment({});
        topFrag.controls.add(new Component('s', {}));
        app.controls.add(root, topFrag);
        await settle();
        expect(el.querySelectorAll('b,i,s').length).toBe(3);
        await topFrag.dispose();
        expect(el.querySelector('s')).toBeNull();
        expect(el.querySelector('b')).not.toBeNull();
        await root.dispose();
        expect(el.childNodes.length).toBe(0);
        expect(frag.isDisposed).toBe(true);
    });

    test('bindings stop with the subtree, components without bindings dispose as well', async () => {
        const st = reactive({ n: 1 });
        let reads = 0;
        const { app } = host();
        const root = new Component('div', {});
        const bound = new Component('span', {});
        bound.bindings.text(() => { reads++; return String(st.n); });
        const plain = new Component('span', {});
        root.controls.add(bound, plain);
        app.controls.add(root);
        await settle();
        const before = reads;
        st.n = 2;
        await settle();
        expect(reads).toBe(before + 1);
        await root.dispose();
        const atDispose = reads;
        st.n = 3;
        await settle();
        expect(reads).toBe(atDispose);
        expect(plain.isDisposed).toBe(true);
        expect(bound.isDisposed).toBe(true);
    });

    test('clearAsync disposes every row and empties the list', async () => {
        const { app } = host();
        const list = new Component('ul', {});
        const rows: ComponentBase[] = [];
        for (let i = 0; i < 50; i++) {
            const li = new Component('li', {});
            li.controls.add(new Component('b', {}), new Component('i', {}));
            rows.push(li);
        }
        list.controls.add(...rows);
        app.controls.add(list);
        await settle();
        await list.controls.clearAsync();
        expect((list.element as HTMLElement).childNodes.length).toBe(0);
        expect(list.controls.items.length).toBe(0);
        expect(rows.every(r => r.isDisposed)).toBe(true);
    });

    test('a subtree with a leave transition still plays it before the root leaves', async () => {
        const { el, app } = host();
        const root = new Component('div', {});
        const child = new Component('span', {});
        root.controls.add(child);
        app.controls.add(root);
        await settle();
        let left = 0;
        (root.motif.options.transition as any).leaveTransition = (done: () => void) => { left++; setTimeout(done, 20); };
        (root.motif.options as any).transitionOut = true;
        const p = root.dispose();
        expect(el.contains(root.element as any)).toBe(true);
        await p;
        expect(left).toBe(1);
        expect(el.childNodes.length).toBe(0);
        expect(child.isDisposed).toBe(true);
    });
});
