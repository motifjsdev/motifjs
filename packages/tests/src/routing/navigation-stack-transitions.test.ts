import { Application, Component, RouterView, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const settle = () => tick(260);

const waitFor = async (cond: () => boolean, timeout = 3000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

class Page extends Component {
    static all: Page[] = [];
    constructor(public name: string) {
        super('section');
        Page.all.push(this);
        (this.element as HTMLElement).id = `page-${name}`;
        (this.element as HTMLElement).className = 'page';
        this.motif.options.transition.classes = { name: 'pg', duration: 40 };
    }
}

class ConfigPage extends Component {
    constructor() {
        super('section');
        (this.element as HTMLElement).id = 'page-cfg';
        (this.element as HTMLElement).className = 'page';
    }
    override onConfig() {
        this.motif.options.transition.classes = { name: 'pg', duration: 40 };
    }
}

class PlainPage extends Component {
    constructor() {
        super('section');
        (this.element as HTMLElement).id = 'page-plain';
        (this.element as HTMLElement).className = 'page';
    }
}

const page = (name: string) => () => new Page(name);
const live = (name: string) => Page.all.filter(p => p.name === name && !p.isDisposed);
const el = (p: Page) => p.element as unknown as HTMLElement;
const pgClasses = (e: HTMLElement) => Array.from(e.classList).filter(c => c.startsWith('pg-'));

const routes = (): RouteItem[] => [
    { path: '/', control: page('root') },
    { path: '/a', control: page('a') },
    { path: '/b', control: page('b') },
    { path: '/cfg', control: () => new ConfigPage() },
    { path: '/plain', control: () => new PlainPage() },
] as any;

describe('stack navigation plays the pages\' own transitions', () => {
    let app: Application;
    let host: HTMLElement;
    let log: string[];
    let observer: MutationObserver;
    let popCount: number;
    const onPop = () => { popCount++; };

    const record = (list: MutationRecord[]) => {
        for (const m of list) {
            const target = m.target as HTMLElement;
            if (m.type === 'attributes' && target.classList?.contains('page')) {
                if (m.attributeName === 'class') {
                    const cls = pgClasses(target).join(' ');
                    if (cls) log.push(`${target.id} ${cls}`);
                } else if (m.attributeName === 'data-nav-direction') {
                    log.push(`${target.id} dir ${target.getAttribute('data-nav-direction') ?? '-'}`);
                } else if (m.attributeName === 'style' && target.style.display === 'none') {
                    log.push(`${target.id} hidden`);
                }
            }
            if (m.type === 'childList') {
                m.addedNodes.forEach(n => {
                    const added = n as HTMLElement;
                    if (!added.classList?.contains('page')) return;
                    log.push(`${added.id} add`);
                    if (added.hasAttribute('data-nav-direction')) log.push(`${added.id} dir ${added.getAttribute('data-nav-direction')}`);
                });
                m.removedNodes.forEach(n => { if ((n as HTMLElement).classList?.contains('page')) log.push(`${(n as HTMLElement).id} remove`); });
            }
        }
    };
    const at = (entry: string) => {
        const i = log.findIndex(l => l === entry || l.startsWith(entry));
        if (i < 0) throw new Error(`"${entry}" not in log:\n${log.join('\n')}`);
        return i;
    };

    const back = async () => {
        const before = popCount;
        window.history.back();
        await waitFor(() => popCount > before);
        await tick();
    };

    const start = async (stack: any) => {
        app.useRouter({ routes: routes(), mode: 'history', ...(stack === undefined ? {} : { stack }) });
        app.run(host);
        await settle();
        await app.navigate('/a');
        await settle();
        log = [];
    };

    beforeEach(() => {
        Page.all = [];
        log = [];
        popCount = 0;
        sessionStorage.clear();
        window.history.replaceState(null, '', '/');
        window.addEventListener('popstate', onPop);
        host = document.createElement('div');
        document.body.appendChild(host);
        observer = new MutationObserver(record);
        observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'data-nav-direction'] });
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        observer.disconnect();
        window.removeEventListener('popstate', onPop);
        try { app?.dispose(); } catch { }
        host.remove();
    });

    test('push: the page leaves with its transition, then is retained, then the new page enters', async () => {
        await start({});
        const a = live('a')[0];
        await app.navigate('/b');
        await settle();

        expect(at('page-a dir push')).toBeLessThan(at('page-a pg-leave'));
        expect(at('page-a pg-leave')).toBeLessThan(at('page-a remove'));
        expect(at('page-a remove')).toBeLessThan(at('page-b add'));
        expect(at('page-b add')).toBeLessThan(at('page-b pg-enter'));
        expect(a.isDisposed).toBe(false);
        expect(pgClasses(el(a))).toEqual([]);
        expect(el(a).hasAttribute('data-nav-direction')).toBe(false);
        const b = live('b')[0];
        expect(pgClasses(el(b))).toEqual([]);
        expect(el(b).hasAttribute('data-nav-direction')).toBe(false);
    });

    test('the direction is on the entering page while it enters', async () => {
        await start({});
        await app.navigate('/b');
        await settle();
        expect(at('page-b dir push')).toBeLessThan(at('page-b pg-enter'));
        expect(at('page-b pg-enter')).toBeLessThan(log.lastIndexOf('page-b dir -'));
    });

    test('a page that defines its transition in onConfig keeps the direction until its enter ends', async () => {
        await start({});
        await app.navigate('/cfg');
        await settle();
        expect(at('page-cfg dir push')).toBeLessThan(at('page-cfg pg-enter'));
        expect(at('page-cfg pg-enter')).toBeLessThan(log.lastIndexOf('page-cfg dir -'));
    });

    test('a page without an enter transition does not keep the direction', async () => {
        await start({});
        await app.navigate('/plain');
        await settle();
        expect(document.getElementById('page-plain')!.hasAttribute('data-nav-direction')).toBe(false);
    });

    test('push with retain: the page is hidden only after its leave transition', async () => {
        await start({ retain: true });
        const a = live('a')[0];
        await app.navigate('/b');
        await settle();

        expect(at('page-a pg-leave')).toBeLessThan(at('page-a hidden'));
        expect(at('page-a hidden')).toBeLessThan(at('page-b add'));
        expect(pgClasses(el(a))).toEqual([]);
    });

    test('back with retain: the leaving page leaves, the retained page enters again', async () => {
        await start({ retain: true });
        const a = live('a')[0];
        await app.navigate('/b');
        await settle();
        log = [];
        await back();
        await settle();

        expect(at('page-b dir back')).toBeLessThan(at('page-b pg-leave'));
        expect(at('page-b pg-leave')).toBeLessThan(at('page-b remove'));
        expect(at('page-b remove')).toBeLessThan(at('page-a pg-enter'));
        expect(at('page-a dir back')).toBeLessThan(at('page-a pg-enter'));
        expect(live('b').length).toBe(0);
        expect(live('a')[0]).toBe(a);
        expect(pgClasses(el(a))).toEqual([]);
        expect(el(a).hasAttribute('data-nav-direction')).toBe(false);
    });

    test('back without retain: the retained page is inserted again and enters', async () => {
        await start({});
        const a = live('a')[0];
        await app.navigate('/b');
        await settle();
        log = [];
        await back();
        await settle();

        expect(at('page-b pg-leave')).toBeLessThan(at('page-b remove'));
        expect(at('page-b remove')).toBeLessThan(at('page-a add'));
        expect(at('page-a add')).toBeLessThan(at('page-a pg-enter'));
        expect(live('a')[0]).toBe(a);
    });

    test('a stack animation takes over: the pages\' own transitions do not run', async () => {
        const calls: string[] = [];
        await start({ animation: (ctx: any) => { calls.push(`${ctx.direction}:${ctx.entering?.id}:${ctx.leaving?.id}`); } });
        calls.length = 0;
        await app.navigate('/b');
        await settle();
        await back();
        await settle();

        expect(calls).toEqual(['push:page-b:page-a', 'back:page-a:page-b']);
        expect(log.filter(l => / pg-/.test(l) || / dir /.test(l))).toEqual([]);
    });

    test('swipe back: the drag is the animation, the pages\' own transitions do not run', async () => {
        const touch = (type: string, x: number) => {
            const ev: any = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: 100 }] });
            document.dispatchEvent(ev);
        };
        await start({ retain: true, swipeBack: true });
        await app.navigate('/b');
        await settle();
        log = [];
        const before = popCount;
        touch('touchstart', 5);
        touch('touchmove', 15);
        touch('touchmove', 700);
        touch('touchend', 700);
        await waitFor(() => popCount > before);
        await settle();

        expect(app.router.uri).toBe('/a');
        expect(live('b').length).toBe(0);
        expect(log.filter(l => / pg-/.test(l) || / dir /.test(l))).toEqual([]);
    });

    test('without the stack the order is unchanged and no direction attribute is set', async () => {
        await start(undefined);
        await app.navigate('/b');
        await settle();

        expect(at('page-a pg-leave')).toBeLessThan(at('page-a remove'));
        expect(at('page-a remove')).toBeLessThan(at('page-b add'));
        expect(log.filter(l => / dir /.test(l))).toEqual([]);
    });
});
