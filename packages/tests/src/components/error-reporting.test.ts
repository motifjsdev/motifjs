import { Application, Component, errorHandler, motifComponent, setUnexpectedErrorHandler } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const boom = () => { throw new Error('boom'); };

let reported: any[];
let unbind: () => void;
let log: jest.SpyInstance;

beforeEach(() => {
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    log = jest.spyOn(console, 'error').mockImplementation(() => { });
    errorHandler.setDevelopmentMode(false);
});

afterEach(() => {
    unbind();
    log.mockRestore();
    document.body.innerHTML = '';
});

function mount(c: Component) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(c);
    return root;
}

function expectReported(code: string, text: string) {
    const error = reported.find(e => e?.code === code);
    expect(error?.name).toBe('MotifError');
    expect(error.message).toContain(text);
    expect(error.cause?.message).toBe('boom');
    expect(log).toHaveBeenCalled();
}

describe('component hook errors', () => {
    test.each(['onConfigured', 'onBuilding', 'onBuilt', 'onMounted', 'onDisposing', 'onDisposed'])('%s is reported as MJX122', async (hook) => {
        class C extends Component { constructor() { super('div'); } }
        (C.prototype as any)[hook] = boom;
        const root = mount(new C());
        await tick();
        await root.dispose();
        await tick();
        expectReported('MJX122', `The component ${hook} hook threw.`);
    });

    test('a rejected async hook is reported', async () => {
        class C extends Component {
            constructor() { super('div'); }
            async onBuilding() { await tick(); boom(); }
        }
        const root = mount(new C());
        await tick(10);
        expectReported('MJX122', 'onBuilding');
        await root.dispose();
    });

    test('a throwing ref callback is reported', async () => {
        const probe = () => new Component('div');
        motifComponent(probe, { ref: boom });
        expectReported('MJX122', 'ref');
    });

    test('a throwing ref on a plain tag or a class component is reported and the component is created', async () => {
        class C extends Component { constructor(props?: any) { super('div', props); } }
        const plain = motifComponent('span', { ref: boom });
        const cls = motifComponent(C, { ref: boom });
        expect(plain).toBeInstanceOf(Component);
        expect(cls).toBeInstanceOf(C);
        expect(reported.filter(e => e?.code === 'MJX122' && e.message.includes('ref'))).toHaveLength(2);
    });

    test.each(['x:built', 'x:configured', 'x:disposed'])('a throwing %s listener is reported', async (event) => {
        const c = new Component('div');
        c.motif.on(event as any, boom);
        const root = mount(c);
        await tick();
        await root.dispose();
        await tick();
        expectReported('MJX122', `The component ${event} hook threw.`);
    });

    test('a throwing x:mounted listener is reported', async () => {
        const c = new Component('div');
        c.motif.on('x:mounted' as any, boom);
        const root = mount(c);
        await tick(10);
        expectReported('MJX122', 'x:mounted');
        await root.dispose();
    });

    test('the component still builds after its hook throws', async () => {
        class C extends Component { constructor() { super('section'); } onBuilt() { boom(); } }
        const root = mount(new C());
        await tick();
        expect(document.querySelector('section')).not.toBeNull();
        await root.dispose();
    });
});

describe('event handler errors', () => {
    test('a throwing handler is reported as MJX123', async () => {
        const c = new Component('button');
        c.motif.on('click', boom);
        const root = mount(c);
        (c.element as HTMLElement).click();
        expectReported('MJX123', `'click'`);
        await root.dispose();
    });

    test('a rejected async handler is reported', async () => {
        const c = new Component('button');
        c.motif.on('click', async () => { await tick(); boom(); });
        const root = mount(c);
        (c.element as HTMLElement).click();
        await tick(10);
        expectReported('MJX123', `'click'`);
        await root.dispose();
    });
});

describe('custom events with a data object', () => {
    test('cancel, :prevent and :stop raise no error', async () => {
        const unexpected: any[] = [];
        const previous = errorHandler.getUnexpectedErrorHandler();
        setUnexpectedErrorHandler(e => unexpected.push(e));
        try {
            const c = new Component('div');
            const seen: string[] = [];
            c.motif.on('saved' as any, () => { seen.push('plain'); return false; });
            c.motif.on('saved:prevent:stop' as any, () => { seen.push('mods'); });
            const root = mount(c);
            await c.motif.trigger('saved' as any, { id: 1 } as any);
            await c.motif.trigger('saved:prevent:stop' as any, { id: 2 } as any);
            await tick();
            expect(seen).toEqual(['plain', 'mods']);
            expect(unexpected).toEqual([]);
            expect(reported).toEqual([]);
            await root.dispose();
        } finally {
            setUnexpectedErrorHandler(previous);
        }
    });
});

describe('application event errors', () => {
    test('a throwing onRouterChanged handler is reported as MJX123', async () => {
        const app = Application.CreateBuilder().build();
        app.onRouterChanged(boom);
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/a', control: () => new Component('div') }], mode: 'shell' });
        app.run(document.createElement('div'));
        const result: any = await app.navigate('/a');
        expect(result.ok).toBe(true);
        expectReported('MJX123', `'motifjs-router-navigated'`);
        app.dispose();
    });
});

describe('guard errors', () => {
    test('a throwing guard is reported as MJX306 and cancels the navigation', async () => {
        const app = Application.CreateBuilder().build();
        let on = false;
        app.useGuard((_c, next) => { if (on) boom(); next(); });
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/a', control: () => new Component('div') }], mode: 'shell' });
        app.run(document.createElement('div'));
        await app.navigate('/');
        on = true;
        const result: any = await app.navigate('/a');
        expect(result).toMatchObject({ ok: false, cancelled: true, reason: 'guard' });
        expect(app.router.uri).toBe('/');
        expectReported('MJX306', 'The guard hook threw.');
        app.dispose();
    });
});
