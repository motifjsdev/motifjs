import * as motif from '@motifx/core';
import { Application, Component, ComponentBase, FNComponent, motifComponent, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'JF.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
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

function compileOnly(source: string): string {
    return new CompilerCtor().start(source, 'JF.tsx').code;
}

describe('view is an ordinary prop', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('a component tag keeps view in this.props and its class view() still renders', async () => {
        const seen: any[] = [];
        const A = evalJsx(`
            class Card extends Component {
                constructor(p){ super('section', p); seen.push(this.props.view); }
                view(){ return <b class="card-body">{this.props.view}</b>; }
            }
            function A(){ return <div><Card view="grid" /></div>; }`, 'A', { seen });
        const { host, root } = mount(A());
        expect(seen).toEqual(['grid']);
        expect(host.querySelector('section > b.card-body')?.textContent).toBe('grid');
        await root.dispose();
    });

    test('a component tag view function is not used as the template', async () => {
        let called = 0;
        const A = evalJsx(`
            class Card extends Component {
                constructor(p){ super('section', p); }
                view(){ return <i class="own" />; }
            }
            function A(){ return <Card view={() => { called(); return <u class="from-prop" />; }} />; }`, 'A', { called: () => called++ });
        const { host, root } = mount(A());
        expect(host.querySelector('i.own')).not.toBeNull();
        expect(host.querySelector('u.from-prop')).toBeNull();
        expect(called).toBe(0);
        await root.dispose();
    });

    test('a plain DOM tag writes view as an attribute', async () => {
        const A = evalJsx(`function A(){ return <div view="list" />; }`, 'A');
        const { host, root } = mount(A());
        expect(host.querySelector('div')?.getAttribute('view')).toBe('list');
        await root.dispose();
    });

    test('view in plain element props (spread path) is an attribute', async () => {
        const c = new Component('div', { view: 'tiles' } as any);
        const { root } = mount(c);
        expect((c.element as HTMLElement).getAttribute('view')).toBe('tiles');
        await root.dispose();
    });

    test('FNComponent and the object form { el, data, view } still render', async () => {
        const Fn = FNComponent((p: { text: string }) => {
            const e = new Component('em');
            (e.element as HTMLElement).textContent = p.text;
            return e;
        });
        const spec = {
            el: 'div',
            data: reactive({ n: 3 }),
            view(this: any) {
                const s = new Component('strong');
                s.element.textContent = String(this.data.n);
                return s;
            }
        };
        const obj = motifComponent(spec, {}) as ComponentBase;
        const { host, root } = mount(Fn({ text: 'fn' }));
        root.controls.add(obj);
        expect(host.querySelector('em')?.textContent).toBe('fn');
        expect(host.querySelector('div > strong')?.textContent).toBe('3');
        await root.dispose();
    });
});

describe('initializeComponent and ref on a plain DOM tag', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('initializeComponent is called once with the tag component, like on a component tag', async () => {
        const log: any[] = [];
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function A(){
                return <div>
                    <p class="plain" initializeComponent={(s, e) => log.push(['plain', s, s.isBuilt, e])} onclick={() => {}}><span /></p>
                    <Box initializeComponent={(s, e) => log.push(['comp', s, s.isBuilt, e])} />
                </div>;
            }`, 'A', { log });
        const { host, root } = mount(A());
        const plain = log.filter(x => x[0] === 'plain');
        const comp = log.filter(x => x[0] === 'comp');
        expect(plain.length).toBe(1);
        expect(comp.length).toBe(1);
        expect(plain[0][1]).toBeInstanceOf(ComponentBase);
        expect(plain[0][1].element).toBe(host.querySelector('p.plain'));
        expect(comp[0][1].element).toBe(host.querySelector('article'));
        expect(plain[0][2]).toBe(comp[0][2]);
        expect(plain[0][3]).toEqual(comp[0][3]);
        expect(host.querySelector('p.plain')!.hasAttribute('initializeComponent')).toBe(false);
        expect(host.querySelector('p.plain > span')).not.toBeNull();
        await root.dispose();
    });

    test('initializeComponent alone on a plain tag (no other statements) is called', async () => {
        const got: any[] = [];
        const A = evalJsx(`function A(){ return <hr initializeComponent={(s) => got.push(s)} />; }`, 'A', { got });
        const { host, root } = mount(A());
        expect(got.length).toBe(1);
        expect(got[0].element).toBe(host.querySelector('hr'));
        await root.dispose();
    });

    test('ref={this.x} assigns the tag component; ref={(c) => ...} receives it', async () => {
        const A = evalJsx(`
            class A extends Component {
                constructor(){ super('form'); this.fromFn = null; this.input = null; }
                view(){
                    return <div>
                        <input ref={this.input} type="text" />
                        <label ref={(c) => this.fromFn = c}>x</label>
                    </div>;
                }
            }`, 'A');
        const a = new A();
        const { host, root } = mount(a);
        expect(a.input).toBeInstanceOf(ComponentBase);
        expect(a.input.element).toBe(host.querySelector('input'));
        expect(a.fromFn).toBeInstanceOf(ComponentBase);
        expect(a.fromFn.element).toBe(host.querySelector('label'));
        expect(host.querySelector('input')!.hasAttribute('ref')).toBe(false);
        expect(host.querySelector('label')!.hasAttribute('ref')).toBe(false);
        await root.dispose();
    });

    test('ref on a plain tag has the same timing as on a component tag', async () => {
        const order: string[] = [];
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function A(){
                return <div>
                    <p ref={(c) => order.push('plain:' + c.isBuilt)} />
                    <Box ref={(c) => order.push('comp:' + c.isBuilt)} />
                </div>;
            }`, 'A', { order });
        const { root } = mount(A());
        expect(order).toEqual(['plain:false', 'comp:false']);
        await root.dispose();
    });
});

describe('two spellings of one lifecycle hook on the same tag', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('onbuilt, x-built and x:built on a plain tag all run in source order', async () => {
        const log: string[] = [];
        const A = evalJsx(`function A(){ return <div onbuilt={() => log.push('a')} x-built={() => log.push('b')} x:built={() => log.push('c')} />; }`, 'A', { log });
        const { root } = mount(A());
        expect(log).toEqual(['a', 'b', 'c']);
        await root.dispose();
    });

    test('source order is kept when x-built is written first', async () => {
        const log: string[] = [];
        const A = evalJsx(`function A(){ return <div x-built={() => log.push('x')} onBuilt={() => log.push('on')} />; }`, 'A', { log });
        const { root } = mount(A());
        expect(log).toEqual(['x', 'on']);
        await root.dispose();
    });

    test('a component tag runs both spellings in source order', async () => {
        const log: string[] = [];
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function A(){ return <Box x-built={() => log.push('x')} onbuilt={() => log.push('on')} x-config={() => log.push('cfg1')} onconfig={() => log.push('cfg2')} />; }`, 'A', { log });
        const { root } = mount(A());
        expect(log.filter(x => x.startsWith('cfg'))).toEqual(['cfg1', 'cfg2']);
        expect(log.filter(x => !x.startsWith('cfg'))).toEqual(['x', 'on']);
        await root.dispose();
    });

    test('a function component tag runs both spellings', async () => {
        const log: string[] = [];
        const A = evalJsx(`
            function Inner(){ return <section />; }
            function A(){ return <div><Inner onbuilt={() => log.push('on')} x-built={() => log.push('x')} /></div>; }`, 'A', { log });
        const { root } = mount(A());
        await tick();
        expect(log).toEqual(['on', 'x']);
        await root.dispose();
    });

    test('mounted, config, disposing and disposed pairs all run', async () => {
        const log: string[] = [];
        const A = evalJsx(`function A(){ return <div
            onconfig={() => log.push('config:1')} x:config={() => log.push('config:2')}
            onmounted={() => log.push('mounted:1')} x-mounted={() => log.push('mounted:2')}
            ondisposing={() => log.push('disposing:1')} x-disposing={() => log.push('disposing:2')}
            ondisposed={() => log.push('disposed:1')} x:disposed={() => log.push('disposed:2')} />; }`, 'A', { log });
        const { root } = mount(A());
        await tick(20);
        expect(log.filter(x => x.startsWith('config'))).toEqual(['config:1', 'config:2']);
        expect(log.filter(x => x.startsWith('mounted'))).toEqual(['mounted:1', 'mounted:2']);
        await root.dispose();
        await tick(20);
        expect(log.filter(x => x.startsWith('disposing'))).toEqual(['disposing:1', 'disposing:2']);
        expect(log.filter(x => x.startsWith('disposed'))).toEqual(['disposed:1', 'disposed:2']);
    });

    test('the compiler emits one key per hook, never a duplicate', () => {
        const code = compileOnly(`function A(){ return <div onbuilt={f} x-built={g} onmounted={m} x-mounted={n} onactivated={a} x:activated={b} />; }`);
        expect(code.match(/onbuilt:/g)?.length).toBe(1);
        expect(code.match(/onmounted:/g)?.length).toBe(1);
        expect(code.match(/onactivated:/g)?.length).toBe(1);
        expect(code).toContain('onbuilt: [f, g]');
    });

    test('an array of handlers in props is collected in order', async () => {
        const log: string[] = [];
        const c = new Component('div', { onbuilt: [() => log.push('1'), () => log.push('2')] } as any);
        const { root } = mount(c);
        expect(log).toEqual(['1', '2']);
        expect((c.element as HTMLElement).hasAttribute('onbuilt')).toBe(false);
        await root.dispose();
    });
});

describe('app.navigate(uri, options)', () => {
    let app: Application;
    beforeEach(() => { app = Application.CreateBuilder().build(); });
    afterEach(() => { try { app?.dispose(); } catch { } });

    test('forwards options to the router (replace uses replaceState)', async () => {
        app.useRouter({
            routes: [
                { path: '/one', control: () => new Component('div') },
                { path: '/two', control: () => new Component('div') },
            ],
            mode: 'history',
        });
        app.run(document.createElement('div'));
        await tick(10);
        const replaceSpy = jest.spyOn(window.history, 'replaceState');
        const pushSpy = jest.spyOn(window.history, 'pushState');
        await app.navigate('/two', { replace: true });
        expect(replaceSpy).toHaveBeenCalled();
        expect(pushSpy).not.toHaveBeenCalled();
        replaceSpy.mockRestore();
        pushSpy.mockRestore();
    });

    test('passes the same options object as router.navigate', async () => {
        app.useRouter({ routes: [{ path: '/a', control: () => new Component('div') }], mode: 'history' });
        app.run(document.createElement('div'));
        await tick(10);
        const mod = (app as any).urlRoutingModule;
        const spy = jest.spyOn(mod, 'navigate');
        const opts = { replace: true, force: true };
        await app.navigate('/a', opts as any);
        expect(spy).toHaveBeenCalledWith('/a', opts);
        spy.mockRestore();
    });
});

describe('onDeactivated', () => {
    test('the legacy OnDeactivated member is not called; onDeactivated method and prop are', async () => {
        const log: string[] = [];
        class Page extends Component {
            constructor() { super('section', { onDeactivated: () => log.push('prop'), onActivated: () => log.push('prop:act') } as any); }
            onDeactivated() { log.push('method'); }
            OnDeactivated() { log.push('legacy'); }
        }
        window.history.replaceState({}, '', '/p');
        const app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({
            routes: [
                { path: '/p', control: () => new Page(), keepAlive: true },
                { path: '/q', control: () => new Component('div') },
            ]
        });
        app.run(host);
        await tick(30);
        await app.router.navigate('/q');
        await tick(30);
        expect(log).toContain('method');
        expect(log).toContain('prop');
        expect(log).not.toContain('legacy');
        await app.router.navigate('/p');
        await tick(30);
        expect(log).toContain('prop:act');
        expect('OnDeactivated' in ComponentBase.prototype).toBe(false);
        try { app.dispose(); } catch { }
        host.remove();
    });
});

describe('on:x / on-x / on_x handlers follow the motif.on arity rule', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('on:click with one parameter receives the event', async () => {
        const got: any[] = [];
        const A = evalJsx(`function A(){ return <button on:click={(e) => got.push(e)} />; }`, 'A', { got });
        const { host, root } = mount(A());
        host.querySelector('button')!.click();
        expect(got.length).toBe(1);
        expect(got[0]).toBeInstanceOf(MouseEvent);
        await root.dispose();
    });

    test('on:click with two parameters receives sender and event', async () => {
        const got: any[] = [];
        const A = evalJsx(`function A(){ return <button on:click={(s, e) => got.push([s, e])} />; }`, 'A', { got });
        const { host, root } = mount(A());
        const btn = host.querySelector('button')!;
        btn.click();
        expect(got.length).toBe(1);
        expect(got[0][0]).toBeInstanceOf(ComponentBase);
        expect(got[0][0].element).toBe(btn);
        expect(got[0][1]).toBeInstanceOf(MouseEvent);
        await root.dispose();
    });

    test('a rest parameter counts as zero and receives the event', async () => {
        const got: any[] = [];
        const A = evalJsx(`function A(){ return <button on-click={(...a) => got.push(a)} />; }`, 'A', { got });
        const { host, root } = mount(A());
        host.querySelector('button')!.click();
        expect(got.length).toBe(1);
        expect(got[0].length).toBe(1);
        expect(got[0][0]).toBeInstanceOf(MouseEvent);
        await root.dispose();
    });

    test('a custom event on a component tag gets the payload (one param) or sender and payload (two)', async () => {
        const one: any[] = [];
        const two: any[] = [];
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function A(){ return <div>
                <Box class="b1" on:save={(e) => one.push(e)} />
                <Box class="b2" on_save={(s, e) => two.push([s, e])} />
            </div>; }`, 'A', { one, two });
        const { root } = mount(A());
        const [b1, b2] = root.controls.items[0].controls.items as any[];
        const payload = { id: 7 };
        await b1.motif.trigger('save', payload);
        await b2.motif.trigger('save', payload);
        expect(one).toEqual([payload]);
        expect(two.length).toBe(1);
        expect(two[0][0]).toBe(b2);
        expect(two[0][1]).toBe(payload);
        await root.dispose();
    });

    test('a non-function expression is passed as is (method reference)', async () => {
        const got: any[] = [];
        const handler = (e: any) => got.push(e);
        const A = evalJsx(`function A(){ return <button on:click={handler} />; }`, 'A', { handler });
        const { host, root } = mount(A());
        host.querySelector('button')!.click();
        expect(got.length).toBe(1);
        expect(got[0]).toBeInstanceOf(MouseEvent);
        await root.dispose();
    });

    test('the compiled code passes the handler directly to motif.on', () => {
        const code = compileOnly(`function A(){ return <button on:click={h} />; }`);
        expect(code).toContain('sender.motif.on("click", h)');
        expect(code).not.toContain('...args');
    });
});

describe('ref on component tags', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('ref={this.x} on a class component tag assigns the component', async () => {
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            class A extends Component {
                constructor(){ super('div'); this.box = null; }
                view(){ return <Box ref={this.box} />; }
            }`, 'A');
        const a = new A();
        const { host, root } = mount(a);
        expect(a.box).toBeInstanceOf(ComponentBase);
        expect(a.box.element).toBe(host.querySelector('article'));
        await root.dispose();
    });

    test('ref={this.x} on a function component tag assigns the returned root', async () => {
        const A = evalJsx(`
            function Inner(){ return <section class="inner" />; }
            class A extends Component {
                constructor(){ super('div'); this.inner = null; }
                view(){ return <Inner ref={this.inner} />; }
            }`, 'A');
        const a = new A();
        const { host, root } = mount(a);
        expect(a.inner).toBeInstanceOf(ComponentBase);
        expect(a.inner.element).toBe(host.querySelector('section.inner'));
        await root.dispose();
    });
});

describe('ref and x-ref are called exactly once', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('on plain, class, props-ignoring class, function and spreading function tags', async () => {
        const calls: Record<string, any[]> = { plain: [], cls: [], ignoring: [], fn: [], spread: [], xref: [] };
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            class Deaf extends Component {
                constructor(){ super('aside'); }
            }
            function Inner(){ return <section />; }
            function Spread(props){ return <nav {...props} />; }
            function A(){
                return <div>
                    <p ref={(c) => calls.plain.push(c)} />
                    <Box ref={(c) => calls.cls.push(c)} />
                    <Deaf ref={(c) => calls.ignoring.push(c)} />
                    <Inner ref={(c) => calls.fn.push(c)} />
                    <Spread ref={(c) => calls.spread.push(c)} />
                    <Box x-ref={(c) => calls.xref.push(c)} />
                </div>;
            }`, 'A', { calls });
        const { host, root } = mount(A());
        for (const key of Object.keys(calls)) {
            expect([key, calls[key].length]).toEqual([key, 1]);
        }
        expect(calls.plain[0].element).toBe(host.querySelector('p'));
        expect(calls.ignoring[0].element).toBe(host.querySelector('aside'));
        expect(calls.fn[0].element).toBe(host.querySelector('section'));
        expect(calls.spread[0].element).toBe(host.querySelector('nav'));
        await root.dispose();
    });

    test('a ref function given to new Component directly is called once', async () => {
        const got: any[] = [];
        const c = motifComponent('div', { ref: (x: any) => got.push(x) }) as ComponentBase;
        const { root } = mount(c);
        expect(got).toEqual([c]);
        await root.dispose();
    });
});

describe('ref together with x-ref on one tag', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('both run once, in source order, on a plain tag and on a component tag', async () => {
        const log: string[] = [];
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            class A extends Component {
                constructor(){ super('div'); this.p = null; this.b = null; }
                view(){
                    return <div>
                        <p x-ref={(c) => log.push('p:x-ref')} ref={this.p} />
                        <Box ref={(c) => log.push('box:ref')} x:ref={this.b} />
                    </div>;
                }
            }`, 'A', { log });
        const a = new A();
        const { host, root } = mount(a);
        expect(log).toEqual(['p:x-ref', 'box:ref']);
        expect(a.p.element).toBe(host.querySelector('p'));
        expect(a.b.element).toBe(host.querySelector('article'));
        await root.dispose();
    });
});

describe('custom event names with dashes and underscores', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('on-my-event binds my-event and on_my_event binds my_event', async () => {
        const got: string[] = [];
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function A(){ return <Box on-my-event={(e) => got.push('dash:' + e)} on_my_event={(e) => got.push('under:' + e)} />; }`, 'A', { got });
        const box = A();
        const { root } = mount(box);
        await box.motif.trigger('my-event', 1);
        await box.motif.trigger('my_event', 2);
        await box.motif.trigger('my', 3);
        expect(got).toEqual(['dash:1', 'under:2']);
        await root.dispose();
    });
});

describe('a single lifecycle spelling on a function component tag', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('x-built, x-mounted and onactivated reach the returned root without props forwarding', async () => {
        const log: any[] = [];
        const A = evalJsx(`
            function Inner(){ return <section />; }
            function A(){ return <div>
                <Inner x-built={(s) => log.push(['built', s])} />
                <Inner x-mounted={(s) => log.push(['mounted', s])} />
            </div>; }`, 'A', { log });
        const { host, root } = mount(A());
        await tick(20);
        const sections = host.querySelectorAll('section');
        expect(log.map(x => x[0])).toEqual(['built', 'mounted']);
        expect(log[0][1].element).toBe(sections[0]);
        expect(log[1][1].element).toBe(sections[1]);
        await root.dispose();
    });

    test('a class component tag still runs a single x-built once', async () => {
        const log: string[] = [];
        const A = evalJsx(`
            class Box extends Component {
                constructor(p){ super('article', p); }
            }
            function A(){ return <Box x-built={() => log.push('b')} onmounted={() => log.push('m')} />; }`, 'A', { log });
        const { root } = mount(A());
        await tick(20);
        expect(log).toEqual(['b', 'm']);
        await root.dispose();
    });
});
