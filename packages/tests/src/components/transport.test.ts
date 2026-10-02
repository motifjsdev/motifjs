import * as motif from '@motifx/core';
import { Application, Component, reactive, Transport, TransportTo } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

function evalJsx(source: string, exportExpr: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'P.tsx');
    let code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportExpr};`)(...values);
}

const { Slot, Page, Page2 } = evalJsx(`
function Slot(props){ return <div class="slot"><Transport name={props.name} mode={props.mode ?? 'replace'} /></div>; }
function Page(props){ return <section class="page"><TransportTo name={props.name}><button class="cmd" onclick={() => props.state.clicks++}>{props.state.label}</button></TransportTo></section>; }
function Page2(props){ return <section class="page2"><TransportTo name={props.name}><i class="cmd2">two</i></TransportTo></section>; }
`, '{ Slot, Page, Page2 }', { Transport, TransportTo });

const html = (el: Element | null) => (el ? el.innerHTML.replace(/<!--[^>]*-->/g, '') : '');

describe('Transport / TransportTo', () => {
    let app: Application;
    let host: HTMLElement;
    let root: Component;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        root = new Component('div');
        app.run(host, root);
    });
    afterEach(() => { try { app.dispose(); } catch { } host.remove(); });

    test('moves the content into an existing slot and leaves an empty div in place', async () => {
        const state = reactive({ label: 'A', clicks: 0 });
        root.controls.add(Slot({ name: 's1' }));
        await tick();
        root.controls.add(Page({ name: 's1', state }));
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<button class="cmd">A</button>');
        expect(html(host.querySelector('.page'))).toBe('<div></div>');
    });

    test('transported content keeps its bindings and handlers', async () => {
        const state = reactive({ label: 'A', clicks: 0 });
        root.controls.add(Slot({ name: 's3' }));
        await tick();
        root.controls.add(Page({ name: 's3', state }));
        await tick();
        state.label = 'B';
        await tick();
        (host.querySelector('.slot .cmd') as HTMLElement).click();
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<button class="cmd">B</button>');
        expect(state.clicks).toBe(1);
    });

    test('disposing the sender removes its content from the slot', async () => {
        const state = reactive({ label: 'A', clicks: 0 });
        root.controls.add(Slot({ name: 's4' }));
        await tick();
        const page = Page({ name: 's4', state });
        root.controls.add(page);
        await tick();
        await page.dispose();
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('');
    });

    test('order does not matter: content moves when the slot registers later', async () => {
        const state = reactive({ label: 'X', clicks: 0 });
        root.controls.add(Page({ name: 's2', state }));
        await tick();
        root.controls.add(Slot({ name: 's2' }));
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<button class="cmd">X</button>');
    });

    test('an existing replace slot keeps only the latest sender and disposes the previous content', async () => {
        const state = reactive({ label: 'P1', clicks: 0 });
        root.controls.add(Slot({ name: 's5', mode: 'replace' }));
        await tick();
        root.controls.add(Page({ name: 's5', state }));
        await tick();
        const first = host.querySelector('.slot .cmd');
        expect(first).not.toBeNull();
        root.controls.add(Page2({ name: 's5' }));
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<i class="cmd2">two</i>');
        expect(first!.isConnected).toBe(false);
    });

    test('an existing merge slot appends every sender', async () => {
        const state = reactive({ label: 'P1', clicks: 0 });
        root.controls.add(Slot({ name: 's6', mode: 'merge' }));
        await tick();
        root.controls.add(Page({ name: 's6', state }));
        root.controls.add(Page2({ name: 's6' }));
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<button class="cmd">P1</button><i class="cmd2">two</i>');
    });

    test('replace: closing the latest sender does not bring back the earlier content', async () => {
        const state = reactive({ label: 'P1', clicks: 0 });
        root.controls.add(Slot({ name: 's10', mode: 'replace' }));
        await tick();
        root.controls.add(Page({ name: 's10', state }));
        await tick();
        const latest = Page2({ name: 's10' });
        root.controls.add(latest);
        await tick();
        await latest.dispose();
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('');
    });

    test('merge: closing one sender removes only its own content', async () => {
        const state = reactive({ label: 'P1', clicks: 0 });
        root.controls.add(Slot({ name: 's11', mode: 'merge' }));
        await tick();
        const first = Page({ name: 's11', state });
        root.controls.add(first);
        root.controls.add(Page2({ name: 's11' }));
        await tick();
        await first.dispose();
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<i class="cmd2">two</i>');
    });

    test('the default mode is replace', async () => {
        const state = reactive({ label: 'P1', clicks: 0 });
        root.controls.add(new Transport({ name: 's9' }));
        await tick();
        root.controls.add(Page({ name: 's9', state }));
        root.controls.add(Page2({ name: 's9' }));
        await tick();
        expect(host.querySelector('.cmd')).toBeNull();
        expect(host.querySelector('.cmd2')).not.toBeNull();
    });

    test('a slot registered after its senders applies replace or merge', async () => {
        const state = reactive({ label: 'P1', clicks: 0 });
        root.controls.add(Page({ name: 'r', state }));
        root.controls.add(Page2({ name: 'r' }));
        root.controls.add(Page({ name: 'm', state }));
        root.controls.add(Page2({ name: 'm' }));
        await tick();
        root.controls.add(Slot({ name: 'r', mode: 'replace' }));
        root.controls.add(Slot({ name: 'm', mode: 'merge' }));
        await tick();
        const slots = host.querySelectorAll('.slot');
        expect(html(slots[0])).toBe('<i class="cmd2">two</i>');
        expect(html(slots[1])).toBe('<button class="cmd">P1</button><i class="cmd2">two</i>');
    });

    test('disposing the slot disposes the content; a recreated slot stays empty', async () => {
        const state = reactive({ label: 'Z', clicks: 0 });
        const slot = Slot({ name: 's7' });
        root.controls.add(slot);
        await tick();
        root.controls.add(Page({ name: 's7', state }));
        await tick();
        await slot.dispose();
        await tick();
        expect(host.querySelector('.cmd')).toBeNull();
        root.controls.add(Slot({ name: 's7' }));
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('');
    });

    test('children added to the sender later go to the slot', async () => {
        root.controls.add(Slot({ name: 's8' }));
        await tick();
        const sender = new TransportTo({ name: 's8' });
        root.controls.add(sender);
        await tick();
        const late = new Component('b');
        late.element!.textContent = 'late';
        sender.controls.add(late);
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<b>late</b>');
    });

    const item = (tag: string, text: string) => {
        const c = new Component(tag);
        c.element!.textContent = text;
        return c;
    };

    const sendMany = (name: string, ...children: Component[]) => {
        const sender = new TransportTo({ name });
        sender.controls.add(...children);
        root.controls.add(sender);
        return sender;
    };

    test('replace: a sender with several children replaces every child of the previous sender', async () => {
        root.controls.add(Slot({ name: 'm1' }));
        await tick();
        const a = [item('i', 'a1'), item('i', 'a2'), item('i', 'a3')];
        const senderA = sendMany('m1', ...a);
        await tick();
        const lateA = item('i', 'a4');
        senderA.controls.add(lateA);
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<i>a1</i><i>a2</i><i>a3</i><i>a4</i>');
        sendMany('m1', item('b', 'b1'), item('b', 'b2'));
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<b>b1</b><b>b2</b>');
        expect([...a, lateA].every(c => c.isDisposed)).toBe(true);
    });

    test('merge: several children per sender, closing one sender removes only its own content', async () => {
        root.controls.add(Slot({ name: 'm2', mode: 'merge' }));
        await tick();
        const senderA = sendMany('m2', item('i', 'a1'), item('i', 'a2'));
        const b = [item('b', 'b1'), item('b', 'b2')];
        sendMany('m2', ...b);
        await tick();
        const lateA = item('i', 'a3');
        senderA.controls.add(lateA);
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<i>a1</i><i>a2</i><b>b1</b><b>b2</b><i>a3</i>');
        await senderA.dispose();
        await tick();
        expect(html(host.querySelector('.slot'))).toBe('<b>b1</b><b>b2</b>');
        expect(lateA.isDisposed).toBe(true);
        expect(b.every(c => !c.isDisposed)).toBe(true);
    });

    test('a child added later stays alive in the slot and goes away with its sender', async () => {
        root.controls.add(Slot({ name: 'm3' }));
        await tick();
        const sender = sendMany('m3', item('i', 'x'));
        await tick();
        const late = item('b', 'late');
        sender.controls.add(late);
        await tick();
        expect(late.isDisposed).toBe(false);
        expect(html(host.querySelector('.slot'))).toBe('<i>x</i><b>late</b>');
        await sender.dispose();
        await tick();
        expect(late.isDisposed).toBe(true);
        expect(html(host.querySelector('.slot'))).toBe('');
    });

    test('clearSlot removes every child of a multi-child sender', async () => {
        const slot = new Transport({ name: 'm4' });
        root.controls.add(slot);
        await tick();
        const children = [item('i', '1'), item('i', '2'), item('i', '3'), item('i', '4')];
        sendMany('m4', ...children);
        await tick();
        expect(slot.controls.items.length).toBe(4);
        slot.clearSlot();
        await tick();
        expect(slot.controls.items.length).toBe(0);
        expect(children.every(c => c.isDisposed)).toBe(true);
    });
});
