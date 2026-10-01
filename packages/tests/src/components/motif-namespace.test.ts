import * as motif from '@motifx/core';
import { Component, ComponentBase, Frame, reactive, toDisposable } from '@motifx/core';
import { wait } from '../helpers/test-utils';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise(r => setTimeout(r, 0));

const MOVED_METHODS = ['show', 'hide', 'toggle', 'on', 'off', 'trigger', 'addHandler', 'clear', 'register', 'setDisposable', 'stopAnimations'];
const REMOVED_NAMES = [...MOVED_METHODS, 'options'];

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'MN.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    const fn = new Function(...names, `${code}\nreturn ${exportName};`);
    return fn(...values);
}

function mount(child: any): { host: HTMLElement; root: Component } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

describe('this.motif: API and removed names', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('the 12 old names are absent from the instance and the prototype chain', () => {
        const c = new Component('div');
        const f = new Frame();
        for (const name of REMOVED_NAMES) {
            expect(name in c).toBe(false);
            expect(name in f).toBe(false);
            expect(name in ComponentBase.prototype).toBe(false);
            expect(name in Component.prototype).toBe(false);
            expect(name in Frame.prototype).toBe(false);
        }
    });

    test('motif methods live on the prototype and are shared between components', () => {
        const a = new Component('div');
        const b = new Component('span');
        expect(a.motif).toBeDefined();
        expect(a.motif).not.toBe(b.motif);
        const proto = Object.getPrototypeOf(a.motif);
        for (const name of MOVED_METHODS) {
            expect(typeof (a.motif as any)[name]).toBe('function');
            expect(Object.prototype.hasOwnProperty.call(a.motif, name)).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(proto, name)).toBe(true);
            expect((a.motif as any)[name]).toBe((b.motif as any)[name]);
        }
        expect(Object.keys(a.motif).sort()).toEqual(['_component', 'options']);
    });

    test('show / hide / toggle', async () => {
        const c = new Component('div');
        const { host, root } = mount(c);
        expect(host.contains(c.element as Node)).toBe(true);
        await c.motif.hide();
        expect(c.isVisible).toBe(false);
        expect(host.contains(c.element as Node)).toBe(false);
        await c.motif.show();
        expect(c.isVisible).toBe(true);
        expect(host.contains(c.element as Node)).toBe(true);
        c.motif.toggle();
        await tick();
        expect(c.isVisible).toBe(false);
        c.motif.toggle();
        await tick();
        expect(c.isVisible).toBe(true);
        await root.dispose();
    });

    test('on / trigger / off return the component and route handlers', async () => {
        const c = new Component('div');
        const { root } = mount(c);
        const got: any[] = [];
        const cb = (ev: any) => { got.push(ev); };
        expect(await c.motif.on('ping' as any, cb, false)).toBe(c);
        expect(await c.motif.trigger('ping', { n: 1 })).toBe(c);
        expect(got).toEqual([{ n: 1 }]);
        expect(await c.motif.off('ping' as any, cb)).toBe(c);
        await c.motif.trigger('ping', { n: 2 });
        expect(got).toEqual([{ n: 1 }]);

        let sender: any = null;
        await c.motif.on('click', (s, _e) => { sender = s; });
        (c.element as HTMLElement).dispatchEvent(new Event('click'));
        expect(sender).toBe(c);
        await root.dispose();
    });

    test('addHandler subscribes a DOM handler', async () => {
        const c = new Component('div');
        const { root } = mount(c);
        let n = 0;
        c.motif.addHandler('click', () => { n++; });
        (c.element as HTMLElement).dispatchEvent(new Event('click'));
        expect(n).toBe(1);
        await root.dispose();
    });

    test('register and setDisposable run on dispose', async () => {
        const c = new Component('div');
        const { root } = mount(c);
        const ran: string[] = [];
        c.motif.register(toDisposable(() => ran.push('register')));
        c.motif.setDisposable(() => ran.push('setDisposable'));
        expect(ran).toEqual([]);
        await root.dispose();
        expect(ran.sort()).toEqual(['register', 'setDisposable']);
    });

    test('clear disposes the children unless disableDisposal is set', async () => {
        const parent = new Component('div');
        const a = new Component('span');
        const b = new Component('span');
        parent.controls.add(a, b);
        const { root } = mount(parent);
        await parent.motif.clear();
        expect(a.isDisposed).toBe(true);
        expect(b.isDisposed).toBe(true);
        expect(parent.controls.length).toBe(0);

        const kept = new Component('span');
        parent.controls.add(kept);
        parent.motif.options.disableDisposal = true;
        await parent.motif.clear();
        expect(kept.isDisposed).toBe(false);
        expect(parent.controls.length).toBe(1);
        await root.dispose();
    });

    test('stopAnimations cancels the CSS transition and empties the animation list', async () => {
        const c = new Component('div');
        const { root } = mount(c);
        const cancel = jest.fn();
        c.motif.options.transition.activeCssCancel = cancel;
        c.motif.options.transition.activeAnimations = [{ finished: Promise.resolve() } as any];
        await c.motif.stopAnimations();
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(c.motif.options.transition.activeAnimations).toEqual([]);
        await root.dispose();
    });

    test('options carries the framework settings, the options prop and the transition prop', () => {
        const c = new Component('div', { options: { hideStrategy: 'detach', disableDisposal: true, foo: 1 }, transition: 'fade' } as any);
        expect(c.motif.options.hideStrategy).toBe('detach');
        expect((c.motif.options as any).disableDisposal).toBe(true);
        expect((c.motif.options as any).foo).toBeUndefined();
        expect(c.motif.options.transition.name).toBe('fade');
        expect(c.motif.options.getInstance()).toBe(c);
    });

    test('motif calls on a disposed component do not throw', async () => {
        const c = new Component('div');
        const { root } = mount(c);
        await root.dispose();
        expect(c.isDisposed).toBe(true);
        await expect(c.motif.show()).resolves.toBeUndefined();
        await expect(c.motif.hide()).resolves.toBeUndefined();
        expect(() => c.motif.toggle()).not.toThrow();
        await expect(c.motif.trigger('ping', {})).resolves.toBe(c);
        await expect(c.motif.clear()).resolves.toBeUndefined();
    });
});

describe('this.motif: a subclass reusing the old names does not break the framework', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    function build() {
        const calls: string[] = [];
        const clicks: string[] = [];
        const cleaned: string[] = [];
        const st = reactive({
            vis: true,
            items: [{ id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' }]
        });
        const Host = evalJsx(`
            class Trap extends Component {
                options = { user: true };
                constructor(p){
                    super('div', p);
                    this.motif.setDisposable(() => cleaned.push('set:' + (this.props && this.props.tag)));
                    this.motif.register({ dispose: () => cleaned.push('reg:' + (this.props && this.props.tag)) });
                }
                show(){ calls.push('show'); }
                hide(){ calls.push('hide'); }
                on(){ calls.push('on'); }
                off(){ calls.push('off'); }
                trigger(){ calls.push('trigger'); }
                clear(){ calls.push('clear'); }
                register(){ calls.push('register'); }
                view(){ return <span class="lbl">{this.props.label}</span>; }
            }
            class Host extends Component {
                constructor(){ super('div'); }
                view(){
                    return <section>
                        <Trap id="shown" tag="shown" label="s" x-display={() => st.vis} />
                        <Trap id="clicked" tag="clicked" label="c" onClick={() => clicks.push('trap')} />
                        <Trap id="faded" tag="faded" label="f" transition="fade" />
                        <ul>{st.items.map(it => <Trap key={it.id} tag={'row' + it.id} label={it.label} />)}</ul>
                    </section>;
                }
            }`, 'Host', { calls, clicks, cleaned, st });
        const host = new Host();
        const mounted = mount(host);
        return { ...mounted, calls, clicks, cleaned, st };
    }

    test('x-display toggles visibility', async () => {
        const { host, root, st, calls } = build();
        await tick();
        expect(host.querySelector('#shown')).not.toBeNull();
        st.vis = false;
        await tick();
        expect(host.querySelector('#shown')).toBeNull();
        st.vis = true;
        await tick();
        expect(host.querySelector('#shown')).not.toBeNull();
        expect(calls).toEqual([]);
        await root.dispose();
    });

    test('the onClick JSX event reaches the handler', async () => {
        const { host, root, clicks, calls } = build();
        await tick();
        (host.querySelector('#clicked') as HTMLElement).dispatchEvent(new Event('click'));
        expect(clicks).toEqual(['trap']);
        expect(calls).toEqual([]);
        await root.dispose();
    });

    test('the transition prop is applied and the user options field is untouched', async () => {
        const { host, root, calls } = build();
        await tick();
        const el = host.querySelector('#faded') as HTMLElement;
        expect(el.hasAttribute('transition')).toBe(false);
        expect(el.classList.contains('fade-enter-from') || el.classList.contains('fade-enter-active') || el.classList.contains('fade-enter-to')).toBe(true);
        const trap = (root.controls.items[0] as any);
        const faded = findByTag(trap, 'faded');
        expect(faded.motif.options.transition.name).toBe('fade');
        expect(faded.options).toEqual({ user: true });
        expect(calls).toEqual([]);
        await root.dispose();
    });

    test('keyed list rows are kept when the list is reordered', async () => {
        const { host, root, st, calls } = build();
        await tick();
        const rows = () => Array.from(host.querySelectorAll('ul > div')) as HTMLElement[];
        const before = rows();
        expect(before.map(r => r.textContent)).toEqual(['a', 'b', 'c']);
        st.items = [st.items[2], st.items[0], st.items[1]];
        await tick();
        const after = rows();
        expect(after.map(r => r.textContent)).toEqual(['c', 'a', 'b']);
        expect(after[0]).toBe(before[2]);
        expect(after[1]).toBe(before[0]);
        expect(after[2]).toBe(before[1]);
        const row = findByTag(root.controls.items[0], 'row1');
        expect(row.motif.options.__fromList).toBe(true);
        expect(row.options).toEqual({ user: true });
        expect(calls).toEqual([]);
        await root.dispose();
    });

    test('dispose runs the registered cleanups', async () => {
        const { root, st, cleaned, calls } = build();
        await tick();
        st.items = st.items.filter(i => i.id !== 2);
        await wait(20);
        expect(cleaned.sort()).toEqual(['reg:row2', 'set:row2']);
        await root.dispose();
        const tags = ['shown', 'clicked', 'faded', 'row1', 'row3'];
        const expected = [...tags.map(t => 'reg:' + t), ...tags.map(t => 'set:' + t), 'reg:row2', 'set:row2'].sort();
        expect(cleaned.sort()).toEqual(expected);
        expect(calls).toEqual([]);
    });
});

describe('this.motif: Frame', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('frame.motif.clear() disposes the navigation target', async () => {
        const frame = new Frame();
        const { host, root } = mount(frame);
        const page = new Component('p');
        (page.element as HTMLElement).textContent = 'page';
        await frame.navigate(page);
        expect(host.textContent).toBe('page');
        await frame.motif.clear();
        expect(page.isDisposed).toBe(true);
        expect(host.textContent).toBe('');
        await root.dispose();
    });
});

function findByTag(root: any, tag: string): any {
    if (!root) return null;
    if (root.props && root.props.tag === tag) return root;
    for (const c of root.controls?.items ?? []) {
        const hit = findByTag(c, tag);
        if (hit) return hit;
    }
    return null;
}
