/**
 * @jest-environment jsdom
 */
import { Application, Component, errorHandler } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('devtools router and errors', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let events: any[];
    let off: () => void;
    let quiet: jest.SpyInstance;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        quiet = jest.spyOn(console, 'error').mockImplementation(() => { });
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        events = [];
        off = hook().on((ev: any) => { events.push(ev); });
    });

    afterEach(async () => {
        off();
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
        quiet.mockRestore();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    async function start() {
        app.useGuard(({ to }: any, next: any) => {
            if (to.path === '/b') next(false);
            else if (to.path === '/secret') next('/login');
            else next();
        });
        app.useRouter({
            routes: [
                { path: '/', control: () => new Component('div') },
                { path: '/a/{id}', control: () => new Component('section') },
                { path: '/b', control: () => new Component('p') },
                { path: '/secret', control: () => new Component('p') },
                { path: '/login', control: () => new Component('form') },
            ]
        });
        app.run(host);
        await tick();
    }

    const navigations = () => hook().getNavigations();
    const last = () => navigations()[navigations().length - 1];
    const ends = () => events.filter(e => e.type === 'route:navigation-end').map(e => e.payload);

    test('a finished navigation is recorded and becomes the current route', async () => {
        await start();
        await app.router.navigate('/a/5');
        expect(last()).toMatchObject({ requested: '/a/5', uri: '/a/5', outcome: 'done' });
        expect(typeof last().duration).toBe('number');
        const route = hook().getRoute();
        expect(route.uri).toBe('/a/5');
        expect(route.params).toMatchObject({ id: '5' });
        expect(Array.isArray(route.chain)).toBe(true);
        expect(route.chain.length).toBe(1);
        expect(ends().pop()).toMatchObject({ uri: '/a/5', requested: '/a/5', outcome: 'done' });
    });

    test('the same address is recorded as skipped', async () => {
        await start();
        await app.router.navigate('/a/1');
        await app.router.navigate('/a/1');
        expect(last()).toMatchObject({ requested: '/a/1', outcome: 'skipped' });
    });

    test('a guard that refuses is recorded as cancelled and the current route stays', async () => {
        await start();
        await app.router.navigate('/a/2');
        await app.router.navigate('/b');
        expect(last()).toMatchObject({ requested: '/b', outcome: 'cancelled', reason: 'guard' });
        expect(hook().getRoute().uri).toBe('/a/2');
        expect(ends().pop()).toMatchObject({ requested: '/b', outcome: 'cancelled', reason: 'guard' });
    });

    test('a guard redirect records the inner and the outer navigation', async () => {
        await start();
        await app.router.navigate('/secret');
        const list = navigations();
        expect(list[list.length - 2]).toMatchObject({ requested: '/login', uri: '/login', outcome: 'done' });
        expect(list[list.length - 1]).toMatchObject({ requested: '/secret', uri: '/login', outcome: 'done' });
    });

    test('an unknown address is recorded as notFound', async () => {
        await start();
        await app.router.navigate('/nowhere');
        expect(last()).toMatchObject({ requested: '/nowhere', outcome: 'notFound' });
    });

    test('at most 50 navigations are kept', async () => {
        await start();
        for (let i = 0; i < 60; i++) await app.router.navigate('/a/' + i);
        expect(navigations().length).toBe(50);
        expect(last().requested).toBe('/a/59');
    });

    test('the same error is kept once with a count and still published each time', () => {
        for (let i = 0; i < 3; i++) errorHandler.report(new Error('boom'));
        const records = hook().getErrors().filter((e: any) => e.message === 'boom');
        expect(records.length).toBe(1);
        expect(records[0]).toMatchObject({ context: 'Error', name: 'Error', message: 'boom', count: 3 });
        expect(records[0].error).toMatchObject({ name: 'Error', message: 'boom' });
        expect(records[0].lastAt).toBeGreaterThanOrEqual(records[0].firstAt);
        expect(events.filter(e => e.type === 'error:caught').length).toBe(3);
    });

    test('with devtools off nothing is recorded', async () => {
        app.useDevelopment(false);
        await start();
        await app.router.navigate('/a/9');
        errorHandler.report(new Error('quiet'));
        app.useDevelopment(true);
        expect(navigations().some((n: any) => n.requested === '/a/9')).toBe(false);
        expect(hook().getErrors().some((e: any) => e.message === 'quiet')).toBe(false);
    });
});
