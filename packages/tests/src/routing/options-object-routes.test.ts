/**
 * @jest-environment jsdom
 */
import { Application, Component, Lazy, RouteItem, errorHandler, reactive } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

const created: any[] = [];
const ctorArgs: any[] = [];
const factoryArgs: any[] = [];

const counter = (label: string) => (arg?: any) => {
    factoryArgs.push(arg);
    return {
        el: 'section',
        data: reactive({ n: 1 }),
        view() {
            const span = new Component('span');
            (span.element as HTMLElement).textContent = `${label}:${(this as any).data.n}`;
            return [span];
        },
        ctor(props: any) {
            ctorArgs.push(props);
            created.push(this);
            (this as any).element.id = `page-${label}`;
        },
    };
};

describe('Options API factories as route components', () => {
    let app: Application;
    let host: HTMLElement;
    let reported: string[];
    let unbind: () => void;

    function start(routes: RouteItem[], url: string) {
        window.history.replaceState({}, '', url);
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes });
        app.run(host);
    }

    beforeEach(() => {
        created.length = 0;
        ctorArgs.length = 0;
        factoryArgs.length = 0;
        reported = [];
        unbind = errorHandler.addListener(e => reported.push(String(e?.code)));
    });

    afterEach(() => {
        unbind();
        host?.remove();
    });

    test('a factory as control renders its view', async () => {
        start([{ path: '/', control: counter('home') as any }], '/');
        await tick();
        expect(host.querySelector('#page-home')?.textContent).toBe('home:1');
        expect(reported).toEqual([]);
        await app.dispose();
        await tick(10);
        expect(reported).toEqual([]);
        expect(created[0].isDisposed).toBe(true);
    });

    test('the factory receives the app, the component does not', async () => {
        start([{ path: '/', control: counter('home') as any }], '/');
        await tick();
        expect(factoryArgs[0]).toBe(app);
        expect(ctorArgs).toEqual([undefined]);
        expect(created[0].props).not.toBe(app);
        await app.dispose();
    });

    test('a lazy import whose default is a factory', async () => {
        start([{ path: '/', control: (() => Promise.resolve({ default: counter('lazy') })) as any }], '/');
        await tick();
        expect(host.querySelector('#page-lazy')?.textContent).toBe('lazy:1');
        expect(reported).toEqual([]);
        await app.dispose();
    });

    test('an options object as control', async () => {
        start([{ path: '/', control: counter('plain')() as any }], '/');
        await tick();
        expect(host.querySelector('#page-plain')?.textContent).toBe('plain:1');
        await app.dispose();
    });

    test('navigating between factory routes replaces and disposes the page', async () => {
        start([
            { path: '/a', control: counter('a') as any },
            { path: '/b', control: counter('b') as any },
        ], '/a');
        await tick();
        expect(host.querySelector('#page-a')).not.toBeNull();
        await app.router.navigate('/b');
        await tick();
        expect(host.querySelector('#page-a')).toBeNull();
        expect(host.querySelector('#page-b')?.textContent).toBe('b:1');
        expect(created[0].isDisposed).toBe(true);
        expect(reported).toEqual([]);
        await app.dispose();
    });
});

describe('Options API factory inside Lazy', () => {
    test('the loaded default factory is rendered', async () => {
        const reported: string[] = [];
        const unbind = errorHandler.addListener(e => reported.push(String(e?.code)));
        const root = new Component(document.body.appendChild(document.createElement('div')));
        root.build();
        root.controls.add(Lazy({ caller: () => Promise.resolve({ default: counter('lazy-view') }) }));
        await tick();
        expect((root.element as HTMLElement).querySelector('#page-lazy-view')?.textContent).toBe('lazy-view:1');
        expect(reported).toEqual([]);
        await root.dispose();
        unbind();
    });
});
