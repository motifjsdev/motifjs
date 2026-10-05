/**
 * @jest-environment jsdom
 */
import { Application, Component, Lazy, RouteItem, errorHandler } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

class HomePage extends Component {
    constructor() {
        super('section');
        (this.element as HTMLElement).id = 'home';
    }
}

const moduleOf = (exports: Record<string, unknown>) =>
    Object.freeze(Object.defineProperty({ ...exports }, Symbol.toStringTag, { value: 'Module' }));

const optionsPage = () => ({
    el: 'section',
    ctor(this: any) { this.element.id = 'options-page'; },
});

let reported: any[];
let unbind: () => void;
let log: jest.SpyInstance;

beforeEach(() => {
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    log = jest.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    unbind();
    log.mockRestore();
    document.body.innerHTML = '';
});

const codes = () => reported.map(e => e?.code);

describe('lazy route modules', () => {
    let app: Application;
    let host: HTMLElement;

    function start(routes: RouteItem[]) {
        window.history.replaceState({}, '', '/');
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes });
        app.run(host);
    }

    test('a module without a default export reports MJX127 instead of placing the module', async () => {
        start([{ path: '/', control: () => Promise.resolve(moduleOf({ HomePage })) }]);
        await tick();
        const failure = reported.find(e => e?.code === 'MJX304');
        expect(failure?.cause?.code).toBe('MJX127');
        expect(failure.cause.message).toContain('has no default export');
        expect(codes()).not.toContain('MJX114');
        expect(host.querySelector('#home')).toBeNull();
        await app.dispose();
        await tick(10);
        expect(codes()).not.toContain('MJX307');
    });

    test('mapping the named export works', async () => {
        start([{ path: '/', control: () => Promise.resolve(moduleOf({ HomePage })).then(m => (m as any).HomePage) }]);
        await tick();
        expect(host.querySelector('#home')).not.toBeNull();
        expect(reported).toEqual([]);
        await app.dispose();
    });

    test('a default export that is an Options API object is placed', async () => {
        start([{ path: '/', control: () => Promise.resolve(moduleOf({ default: optionsPage() })) }]);
        await tick();
        expect(host.querySelector('#options-page')).not.toBeNull();
        expect(reported).toEqual([]);
        await app.dispose();
    });

    test('a control that resolves to a non-component reports MJX127 with the type', async () => {
        start([{ path: '/', control: (() => 42) as any }]);
        await tick();
        const failure = reported.find(e => e?.code === 'MJX304');
        expect(failure?.cause?.code).toBe('MJX127');
        expect(failure.cause.message).toContain('got number');
        expect(codes()).not.toContain('MJX114');
        await app.dispose();
    });
});

describe('Lazy with a module', () => {
    function mount(child: Component) {
        const root = new Component(document.body.appendChild(document.createElement('div')));
        root.build();
        root.controls.add(child);
        return root;
    }

    test('a module without a default export shows the Fallbackview and passes MJX127 to onError', async () => {
        const errors: any[] = [];
        const fallback = new Component('p');
        (fallback.element as HTMLElement).id = 'fallback';
        const root = mount(Lazy({
            caller: () => Promise.resolve(moduleOf({ HomePage })),
            options: { Fallbackview: fallback, onError: (e: any) => errors.push(e) },
        }));
        await tick();
        expect(errors[0]?.code).toBe('MJX127');
        expect((root.element as HTMLElement).querySelector('#fallback')).not.toBeNull();
        expect(reported).toEqual([]);
        await root.dispose();
    });

    test('without a Fallbackview the failure is MJX126 with MJX127 as the cause', async () => {
        const root = mount(Lazy({ caller: () => Promise.resolve(moduleOf({ HomePage })) }));
        await tick();
        const failure = reported.find(e => e?.code === 'MJX126');
        expect(failure?.cause?.code).toBe('MJX127');
        expect(codes()).not.toContain('MJX114');
        await root.dispose();
    });

    test('the minDelayMs path reports the same way', async () => {
        const errors: any[] = [];
        const root = mount(Lazy({
            caller: () => Promise.resolve(moduleOf({ HomePage })),
            options: { minDelayMs: 20, onError: (e: any) => errors.push(e) },
        }));
        await tick(60);
        expect(errors[0]?.code).toBe('MJX127');
        expect(reported.find(e => e?.code === 'MJX126')?.cause?.code).toBe('MJX127');
        await root.dispose();
    });

    test('a default export that is an Options API object is placed', async () => {
        const root = mount(Lazy({ caller: () => Promise.resolve(moduleOf({ default: optionsPage() })) }));
        await tick();
        expect((root.element as HTMLElement).querySelector('#options-page')).not.toBeNull();
        expect(reported).toEqual([]);
        await root.dispose();
    });
});
