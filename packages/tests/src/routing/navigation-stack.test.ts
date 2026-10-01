import { Application, Component, RouterView } from '@motifx/core';
import { RouteItem } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 30));

const waitFor = async (cond: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

const names = new WeakMap<object, string>();

class Page extends Component {
    static all: Page[] = [];
    activated = 0;
    deactivated = 0;
    constructor(name: string) {
        super('section');
        Page.all.push(this);
        names.set(this, name);
        (this.element as HTMLElement).id = `page-${name}`;
        (this.element as HTMLElement).className = 'page';
        (this.element as HTMLElement).textContent = name;
    }
    onActivated() { this.activated++; }
    onDeactivated() { this.deactivated++; }
}

class Layout extends Component {
    static all: Layout[] = [];
    constructor() {
        super('div');
        Layout.all.push(this);
        (this.element as HTMLElement).id = 'layout';
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

const page = (name: string) => () => new Page(name);
const instances = (name: string) => Page.all.filter(p => names.get(p) === name);
const live = (name: string) => instances(name).filter(p => !p.isDisposed);
const el = (p: Page) => p.element as unknown as HTMLElement;
const isHidden = (p: Page) => el(p).style.display === 'none' && el(p).hasAttribute('inert');
const visiblePages = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('.page')).filter(e => e.style.display !== 'none');

const routes = (): RouteItem[] => [
    { path: '/', control: page('root') },
    { path: '/a', control: page('a') },
    { path: '/b', control: page('b') },
    { path: '/c', control: page('c') },
    { path: '/d', control: page('d') },
    { path: '/p/{id}', control: (app: any) => new Page('p' + (app?.router?.params?.id ?? '')) },
    { path: '/alive', control: page('alive'), keepAlive: true },
    {
        path: '/app', control: Layout, childs: [
            { path: '/x', control: page('x') },
            { path: '/y', control: page('y') },
        ]
    },
] as any;

describe('Navigation stack', () => {
    let app: Application;
    let host: HTMLElement;
    let popCount: number;
    const onPop = () => { popCount++; };

    const traverse = async (fn: () => void) => {
        const before = popCount;
        fn();
        await waitFor(() => popCount > before);
        await tick();
    };
    const back = () => traverse(() => window.history.back());
    const forward = () => traverse(() => window.history.forward());

    const start = async (stack: any, extra: any = {}) => {
        app.useRouter({ routes: routes(), mode: 'history', stack, ...extra });
        app.run(host);
        await tick();
    };

    beforeEach(() => {
        Page.all = [];
        Layout.all = [];
        popCount = 0;
        sessionStorage.clear();
        window.history.replaceState(null, '', '/');
        window.addEventListener('popstate', onPop);
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        window.removeEventListener('popstate', onPop);
        try { app?.dispose(); } catch { }
        host.remove();
    });

    it('without the option previous pages are disposed as before', async () => {
        await start(undefined);
        await app.navigate('/a');
        await app.navigate('/b');
        await tick();

        expect(instances('a')[0].isDisposed).toBe(true);
        expect(app.router.stack).toBeUndefined();
    });

    describe('detached retention (retain: false)', () => {
        it('keeps the previous page alive and brings the same instance back', async () => {
            await start(true);
            await app.navigate('/a');
            const a = live('a')[0];
            el(a).dataset.mark = 'kept';
            await app.navigate('/b');
            await tick();

            expect(a.isDisposed).toBe(false);
            expect(el(a).isConnected).toBe(false);
            expect(a.deactivated).toBe(1);

            await back();
            expect(app.router.uri).toBe('/a');
            expect(instances('a').length).toBe(1);
            expect(el(a).isConnected).toBe(true);
            expect(el(a).dataset.mark).toBe('kept');
            expect(a.activated).toBe(1);
            expect(instances('b')[0].isDisposed).toBe(true);
            expect(host.querySelectorAll('.page').length).toBe(1);
        });

        it('forward after back creates a fresh page because the popped one was released', async () => {
            await start(true);
            await app.navigate('/a');
            await app.navigate('/b');
            await back();
            await forward();

            expect(app.router.uri).toBe('/b');
            expect(instances('b').length).toBe(2);
            expect(instances('b')[0].isDisposed).toBe(true);
            expect(live('a').length).toBe(1);
        });

        it('same route with other params gets its own instance per entry', async () => {
            await start(true);
            await app.navigate('/p/1');
            const p1 = live('p1')[0];
            await app.navigate('/p/2');
            await tick();

            expect(p1.isDisposed).toBe(false);
            expect(live('p2').length).toBe(1);

            await back();
            expect(app.router.uri).toBe('/p/1');
            expect(live('p1')).toEqual([p1]);
            expect(instances('p1').length).toBe(1);
            expect(live('p2').length).toBe(0);
        });

        it('respects depth and releases the oldest page', async () => {
            await start({ depth: 2 });
            await app.navigate('/a');
            await app.navigate('/b');
            await app.navigate('/c');
            await app.navigate('/d');
            await tick();

            expect(live('a').length).toBe(0);
            expect(live('b').length).toBe(1);
            expect(live('c').length).toBe(1);
            expect(live('d').length).toBe(1);
        });

        it('replace does not keep the replaced page', async () => {
            await start(true);
            await app.navigate('/a');
            await app.navigate('/b', { replace: true });
            await tick();

            expect(live('a').length).toBe(0);
        });

        it('push after going back drops the stale forward pages', async () => {
            await start(true);
            await app.navigate('/a');
            await app.navigate('/b');
            await app.navigate('/c');
            await back();
            await back();
            expect(app.router.uri).toBe('/a');
            await app.navigate('/d');
            await tick();

            expect(live('b').length).toBe(0);
            expect(live('c').length).toBe(0);
            expect(live('a').length).toBe(1);
        });

        it('restores scroll positions inside the kept page', async () => {
            await start(true);
            await app.navigate('/a');
            const a = live('a')[0];
            let top = 0;
            Object.defineProperty(el(a), 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
            top = 340;
            await app.navigate('/b');
            top = 0;
            await back();

            expect(top).toBe(340);
        });

        it('keepAlive routes keep their own caching', async () => {
            await start(true);
            await app.navigate('/alive');
            const alive = live('alive')[0];
            await app.navigate('/b');
            await back();

            expect(live('alive')).toEqual([alive]);
            expect(instances('alive').length).toBe(1);
        });

        it('nested routes keep the inner page when the layout is shared', async () => {
            await start(true);
            await app.navigate('/app/x');
            const x = live('x')[0];
            await app.navigate('/app/y');
            await tick();
            expect(x.isDisposed).toBe(false);
            expect(Layout.all.filter(l => !l.isDisposed).length).toBe(1);

            await back();
            expect(app.router.uri).toBe('/app/x');
            expect(live('x')).toEqual([x]);
            expect(el(x).isConnected).toBe(true);
            expect(live('y').length).toBe(0);
        });

        it('nested routes keep the whole layout when leaving it', async () => {
            await start(true);
            await app.navigate('/app/x');
            const layout = Layout.all[0];
            const x = live('x')[0];
            await app.navigate('/b');
            await tick();
            expect(layout.isDisposed).toBe(false);
            expect(x.isDisposed).toBe(false);

            await back();
            expect(app.router.uri).toBe('/app/x');
            expect(Layout.all.length).toBe(1);
            expect(live('x')).toEqual([x]);
            expect(el(x).isConnected).toBe(true);
        });

        it('a guard-cancelled back keeps the page stack intact', async () => {
            let block = false;
            app.useGuard(({ to }, next) => { if (block && to.path === '/a') return; next(); });
            await start(true);
            await app.navigate('/a');
            const a = live('a')[0];
            await app.navigate('/b');
            block = true;
            await back();
            await tick();
            expect(app.router.uri).toBe('/b');
            expect(window.location.pathname).toBe('/b');

            block = false;
            await back();
            expect(app.router.uri).toBe('/a');
            expect(live('a')).toEqual([a]);
        });
    });

    describe('attached retention (retain: true)', () => {
        it('hides the previous page in place and reveals it on back', async () => {
            await start({ retain: true });
            await app.navigate('/a');
            const a = live('a')[0];
            el(a).setAttribute('style', 'color: red;');
            await app.navigate('/b');
            await tick();

            expect(el(a).isConnected).toBe(true);
            expect(isHidden(a)).toBe(true);
            expect(el(a).getAttribute('aria-hidden')).toBe('true');
            expect(a.deactivated).toBe(1);

            await back();
            expect(app.router.uri).toBe('/a');
            expect(el(a).getAttribute('style')).toBe('color: red;');
            expect(el(a).hasAttribute('inert')).toBe(false);
            expect(el(a).hasAttribute('aria-hidden')).toBe(false);
            expect(a.activated).toBe(1);
            expect(instances('a').length).toBe(1);
            expect(visiblePages(host).map(e => e.id)).toEqual(['page-a']);
        });

        it('keeps several pages hidden and walks back through them', async () => {
            await start({ retain: true });
            await app.navigate('/a');
            await app.navigate('/b');
            await app.navigate('/c');
            await tick();
            expect(host.querySelectorAll('.page').length).toBe(4);
            expect(visiblePages(host).map(e => e.id)).toEqual(['page-c']);

            await back();
            await back();
            expect(app.router.uri).toBe('/a');
            expect(instances('a').length).toBe(1);
            expect(instances('b').length).toBe(1);
            expect(visiblePages(host).map(e => e.id)).toEqual(['page-a']);
            expect(host.querySelectorAll('.page').length).toBe(2);
        });

        it('onShow runs again for a revealed page', async () => {
            const shows: string[] = [];
            const r = routes();
            (r as any)[1] = { path: '/a', control: page('a'), onShow: () => shows.push('a') };
            app.useRouter({ routes: r, mode: 'history', stack: { retain: true } });
            app.run(host);
            await tick();
            await app.navigate('/a');
            await app.navigate('/b');
            await back();

            expect(shows).toEqual(['a', 'a']);
        });
    });

    describe('stack information and persistence', () => {
        it('describes the entries with current and retained flags', async () => {
            await start(true);
            await app.navigate('/a');
            await app.navigate('/b');

            const s = app.router.stack!;
            expect(s.map(e => e.uri)).toEqual(['/', '/a', '/b']);
            expect(s.map(e => e.current)).toEqual([false, false, true]);
            expect(s.map(e => e.retained)).toEqual([true, true, false]);

            await back();
            const t = app.router.stack!;
            expect(t.find(e => e.current)!.uri).toBe('/a');
        });

        it('persist writes the entries and a restart on the same entry reads them back', async () => {
            await start({ persist: true });
            await app.navigate('/a');
            await app.navigate('/b');
            expect(JSON.parse(sessionStorage.getItem('motifjs:stack')!).uris.length).toBe(3);

            const router: any = (app as any).urlRoutingModule;
            router.dispose();
            const again: any = new (router.constructor)({ RouteItems: routes(), mode: 'history', middlewareCollections: () => [], stack: { persist: true } }, app);
            (app as any).urlRoutingModule = again;
            again.start((app as any).getAppShell());
            await tick();

            expect(app.router.uri).toBe('/b');
            expect(app.router.stack!.map(e => e.uri)).toEqual(['/', '/a', '/b']);
            expect(app.router.stack!.map(e => e.retained)).toEqual([false, false, false]);
            again.dispose();
        });
    });

    describe('release', () => {
        it('many pushes never keep more than depth pages alive', async () => {
            await start({ retain: true, depth: 3 });
            const targets = ['/a', '/b', '/c', '/d'];
            for (let i = 0; i < 40; i++) await app.navigate(targets[i % 4] + (i % 4 === 0 ? '' : ''), { force: true } as any);
            await tick();

            const alive = Page.all.filter(p => !p.isDisposed);
            expect(alive.length).toBeLessThanOrEqual(4);
            expect(host.querySelectorAll('.page').length).toBe(alive.length);
            expect(visiblePages(host).length).toBe(1);
        });

        it('back and forward cycles do not accumulate pages', async () => {
            await start({ retain: true });
            await app.navigate('/a');
            await app.navigate('/b');
            for (let i = 0; i < 8; i++) {
                await back();
                await forward();
            }
            await tick();

            const alive = Page.all.filter(p => !p.isDisposed);
            expect(alive.length).toBe(3);
            expect(host.querySelectorAll('.page').length).toBe(3);
            expect(visiblePages(host).map(e => e.id)).toEqual(['page-b']);
        });

        it('disposing the application releases every kept page', async () => {
            await start({ retain: true });
            await app.navigate('/a');
            await app.navigate('/b');
            await app.navigate('/c');
            await tick();
            const all = Page.all.slice();
            app.dispose();
            await tick();

            expect(all.every(p => p.isDisposed)).toBe(true);
        });
    });

    describe('transitions', () => {
        it('slide falls back to an instant switch without Web Animations', async () => {
            await start({ retain: true, animation: 'slide' });
            await app.navigate('/a');
            const a = live('a')[0];
            await app.navigate('/b');
            await tick();
            const b = live('b')[0];

            expect(isHidden(a)).toBe(true);
            expect(el(b).getAttribute('style')).toBeNull();

            await back();
            expect(el(a).getAttribute('style')).toBeNull();
            expect(b.isDisposed).toBe(true);
        });

        it('custom animation receives both pages with the leaving one layered, then styles are restored', async () => {
            const calls: any[] = [];
            const animation = async (ctx: any) => {
                calls.push({
                    direction: ctx.direction,
                    entering: ctx.entering?.id,
                    leaving: ctx.leaving?.id,
                    leavingPosition: ctx.leaving?.style.position,
                    enteringZ: ctx.entering?.style.zIndex,
                    leavingConnected: ctx.leaving?.isConnected,
                });
            };
            await start({ retain: true, animation });
            await app.navigate('/a');
            const a = live('a')[0];
            await app.navigate('/b');
            await tick();
            await back();

            expect(calls.slice(1)).toEqual([
                { direction: 'push', entering: 'page-b', leaving: 'page-a', leavingPosition: 'absolute', enteringZ: '1', leavingConnected: true },
                { direction: 'back', entering: 'page-a', leaving: 'page-b', leavingPosition: 'absolute', enteringZ: '', leavingConnected: true },
            ]);
            expect(el(a).getAttribute('style')).toBeNull();
            expect(live('b').length).toBe(0);
        });

        it('back animation also works without attached retention', async () => {
            const calls: string[] = [];
            await start({ animation: (ctx: any) => { calls.push(ctx.direction + ':' + ctx.leaving?.id); } });
            await app.navigate('/a');
            await app.navigate('/b');
            await back();

            expect(calls).toContain('back:page-b');
            expect(live('b').length).toBe(0);
        });
    });

    describe('swipe back', () => {
        const touch = (type: string, x: number, y = 100) => {
            const ev: any = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
            document.dispatchEvent(ev);
            return ev;
        };

        const drag = (to: number, from = 5, y = 100) => {
            touch('touchstart', from, y);
            touch('touchmove', from + 10, y);
            const mid = touch('touchmove', to, y);
            touch('touchend', to, y);
            return mid;
        };

        it('dragging far enough from the edge goes back', async () => {
            await start({ retain: true, swipeBack: true });
            await app.navigate('/a');
            const a = live('a')[0];
            await app.navigate('/b');
            await tick();
            const b = live('b')[0];

            const before = popCount;
            const mid = drag(700);
            expect(mid.defaultPrevented).toBe(true);
            await waitFor(() => popCount > before);
            await tick();

            expect(app.router.uri).toBe('/a');
            expect(b.isDisposed).toBe(true);
            expect(el(a).getAttribute('style')).toBeNull();
            expect(a.activated).toBe(1);
        });

        it('a short drag snaps back and keeps everything as it was', async () => {
            await start({ retain: true, swipeBack: true });
            await app.navigate('/a');
            const a = live('a')[0];
            await app.navigate('/b');
            await tick();
            const b = live('b')[0];

            drag(100);
            await tick();

            expect(app.router.uri).toBe('/b');
            expect(el(b).getAttribute('style')).toBeNull();
            expect(isHidden(a)).toBe(true);
        });

        it('a quick flick goes back even when short', async () => {
            await start({ retain: true, swipeBack: true });
            await app.navigate('/a');
            await app.navigate('/b');
            await tick();

            const before = popCount;
            touch('touchstart', 5);
            await new Promise(r => setTimeout(r, 20));
            touch('touchmove', 40);
            await new Promise(r => setTimeout(r, 20));
            touch('touchmove', 120);
            await new Promise(r => setTimeout(r, 20));
            touch('touchmove', 200);
            touch('touchend', 200);
            await waitFor(() => popCount > before);
            await tick();

            expect(app.router.uri).toBe('/a');
        });

        it('a slow short drag does not go back', async () => {
            await start({ retain: true, swipeBack: true });
            await app.navigate('/a');
            await app.navigate('/b');
            await tick();

            touch('touchstart', 5);
            for (const x of [20, 40, 60, 80, 100]) {
                await new Promise(r => setTimeout(r, 40));
                touch('touchmove', x);
            }
            touch('touchend', 100);
            await tick();
            await tick();

            expect(app.router.uri).toBe('/b');
        });

        it('touches away from the edge or vertical moves are ignored', async () => {
            await start({ retain: true, swipeBack: true });
            await app.navigate('/a');
            await app.navigate('/b');
            await tick();
            const b = live('b')[0];

            const far = drag(700, 200);
            expect(far.defaultPrevented).toBe(false);
            touch('touchstart', 5, 100);
            const vertical = touch('touchmove', 8, 300);
            touch('touchend', 8, 300);
            await tick();

            expect(vertical.defaultPrevented).toBe(false);
            expect(app.router.uri).toBe('/b');
            expect(el(b).getAttribute('style')).toBeNull();
        });

        it('a guard cancelling the swipe puts the page back', async () => {
            let block = false;
            app.useGuard(({ to }, next) => { if (block && to.path === '/a') return; next(); });
            await start({ retain: true, swipeBack: true });
            await app.navigate('/a');
            const a = live('a')[0];
            await app.navigate('/b');
            await tick();
            const b = live('b')[0];

            block = true;
            const before = popCount;
            drag(700);
            await waitFor(() => popCount > before);
            await tick();
            await tick();

            expect(app.router.uri).toBe('/b');
            expect(window.location.pathname).toBe('/b');
            expect(b.isDisposed).toBe(false);
            expect(el(b).getAttribute('style')).toBeNull();
            expect(isHidden(a)).toBe(true);
        });

        it('disabled unless asked for', async () => {
            await start({ retain: true });
            await app.navigate('/a');
            await app.navigate('/b');
            await tick();

            const mid = drag(700);
            await tick();
            expect(mid.defaultPrevented).toBe(false);
            expect(app.router.uri).toBe('/b');
        });
    });
});
