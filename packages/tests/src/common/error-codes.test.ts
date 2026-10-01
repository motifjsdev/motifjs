import { Application, Component, ComponentBase, DisposableStore, RouterNavigatedEventArgs, Virtualization, errorHandler, motifCompiled, motifComponent, toDisposable } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

let reported: any[];
let unbind: () => void;
let log: jest.SpyInstance;
let warn: jest.SpyInstance;

beforeEach(() => {
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    log = jest.spyOn(console, 'error').mockImplementation(() => { });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    unbind();
    log.mockRestore();
    warn.mockRestore();
    delete (globalThis as any).__MOTIF_DEV__;
    errorHandler.setDevelopmentMode(false);
    document.body.innerHTML = '';
});

describe('MJX121', () => {
    test('a mismatch seen before useDevelopment is shown once development mode is on', () => {
        motifCompiled(77);
        expect(warn).not.toHaveBeenCalled();
        const app = Application.CreateBuilder().build();
        try {
            app.useDevelopment(true);
            motifCompiled(77);
            const lines = warn.mock.calls.map(c => String(c[0])).filter(l => l.includes('MJX121'));
            expect(lines).toHaveLength(1);
            expect(lines[0]).toContain('compiler contract 77');
        } finally {
            app.dispose();
        }
    });
});

describe('MJX112', () => {
    test('a self-returning factory is reported', () => {
        const loop: any = () => loop;
        motifComponent(loop);
        const error = reported.find(e => e?.code === 'MJX112');
        expect(error?.name).toBe('MotifError');
        expect(log).toHaveBeenCalled();
    });
});

describe('MJX503', () => {
    test('several dispose errors are thrown as one MotifError with the errors in cause', () => {
        const store = new DisposableStore();
        store.add(toDisposable(() => { throw new Error('a'); }));
        store.add(toDisposable(() => { throw new Error('b'); }));
        let thrown: any;
        try { store.dispose(); } catch (e) { thrown = e; }
        expect(thrown?.name).toBe('MotifError');
        expect(thrown.code).toBe('MJX503');
        expect(thrown.cause).toBeInstanceOf(AggregateError);
        expect(thrown.cause.errors.map((e: Error) => e.message)).toEqual(['a', 'b']);
    });
});

describe('bindings.html', () => {
    test('works when added after build', async () => {
        const c = new Component('div');
        c.build();
        c.bindings.html(() => '<b>x</b>');
        await tick();
        expect((c.element as HTMLElement).innerHTML).toBe('<b>x</b>');
    });
});

describe('Virtualization next page', () => {
    test('a failing next page is reported and keeps the loaded rows', async () => {
        let first!: () => void;
        const loaded = new Promise<void>(r => { first = r; });
        const virt = new Virtualization<any>({
            itemHeight: 20,
            pageSize: 2,
            autoRefresh: false,
            dataRequest: async ({ page }) => {
                if (page === 0) { first(); return { items: [{ id: 1 }, { id: 2 }], totalCount: 4, hasMore: true }; }
                throw new Error('page failed');
            },
            itemTemplate: () => new Component('div', { initializeComponent: (s: ComponentBase) => { s.class.add('row'); } }),
        });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        root.controls.add(virt);
        await loaded;
        await tick();

        await (virt as any)._loadMore();

        const error = reported.find(e => e?.code === 'MJX207');
        expect(error?.cause?.message).toBe('page failed');
        expect(virt.getState().error?.message).toBe('page failed');
        expect(virt.getState().data).toHaveLength(2);
        await root.dispose();
    });
});

describe('route onShow', () => {
    test('a rejected async onShow is reported as MJX306', async () => {
        const app = Application.CreateBuilder().build();
        const navigated = () => new Promise<void>(resolve => {
            const handler = (_e?: RouterNavigatedEventArgs) => { app.off('motifjs-router-navigated', handler); resolve(); };
            app.onRouterChanged(handler);
        });
        let rejected!: () => void;
        const settled = new Promise<void>(r => { rejected = r; });
        app.useRouter({
            routes: [
                { path: '/', control: () => new Component('div') },
                { path: '/a', control: () => new Component('div'), onShow: async () => { await tick(); rejected(); throw new Error('show failed'); } },
            ],
            mode: 'shell',
        });
        const started = navigated();
        app.run(document.createElement('div'));
        await started;
        await app.navigate('/a');
        await settled;
        await tick();
        const error = reported.find(e => e?.code === 'MJX306');
        expect(error?.message).toContain('onShow');
        expect(error?.cause?.message).toBe('show failed');
        app.dispose();
    });
});
