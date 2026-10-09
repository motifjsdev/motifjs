import { Component, ComponentBase, motifComponent } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));

const HOOKS = [
    'initializeComponent', 'onInitializing', 'onInitialized', 'onConfig', 'onConfigured', 'onBuilding', 'onBuilt',
    'onMounted', 'onVisibilityChanged', 'onDeactivated', 'onActivated', 'onDisposing', 'onDisposed',
] as const;

async function drive(c: ComponentBase) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(c);
    await settle();
    await c.motif.hide();
    await settle();
    await c.motif.show();
    await settle();
    await c.dispose();
    root.dispose();
    host.remove();
}

function recorder() {
    const log: string[] = [];
    const make = (name: string) => (sender: any, e: any) => { log.push(`${name}${sender instanceof ComponentBase ? '' : '!sender'}${e && e.cancel === false ? '' : '!ev'}`); };
    return { log, make };
}

const turns = (hook: string, seq: string[]) => hook === 'onVisibilityChanged' ? [...seq, ...seq] : seq;

afterEach(() => { document.body.innerHTML = ''; });

describe('lifecycle handlers given as props', () => {
    test.each(HOOKS)('%s: one handler runs once', async hook => {
        const { log, make } = recorder();
        const c = new Component('div', { [hook]: make('a') } as any);
        await drive(c);
        expect(log).toEqual(turns(hook, ['a']));
    });

    test.each(HOOKS)('%s: several handlers run in order and a repeated one runs once', async hook => {
        const { log, make } = recorder();
        const a = make('a'), b = make('b'), c3 = make('c');
        const c = new Component('div', { [hook]: [a, b, a], runover: { [hook]: c3 } } as any);
        await drive(c);
        expect(log).toEqual(turns(hook, ['a', 'b', 'c']));
    });

    test.each(HOOKS)('%s: runover and own handler', async hook => {
        const { log, make } = recorder();
        const c = new Component('div', { runover: { [hook]: [make('r1'), make('r2')] } } as any);
        await drive(c);
        expect(log).toEqual(turns(hook, ['r1', 'r2']));
    });

    test('lower case x- prefixed names reach the same lists', async () => {
        const { log, make } = recorder();
        const c = new Component('div', { 'x-built': make('xb'), 'x-disposing': make('xd'), onBuilt: make('ob') } as any);
        await drive(c);
        expect(log).toEqual(['xb', 'ob', 'xd']);
    });

    test('a handler that is not a function is left as a prop', () => {
        const c = new Component('div', { onBuilt: 'text' } as any);
        expect((c as any)._base._onBuiltHandlers).toBeUndefined();
    });
});

describe('order between the kinds of hooks', () => {
    test('class method, prop handlers, lower case method, x: listener', async () => {
        const log: string[] = [];
        class Probe extends Component<HTMLDivElement> {
            constructor(props: any) { super('div', props); }
            onBuilt() { log.push('built:method'); }
            onbuilt() { log.push('built:lower'); }
            onDisposing() { log.push('disposing:method'); }
            ondisposing() { log.push('disposing:lower'); }
            initializeComponent() { log.push('init:method'); }
            oninitializeComponent() { log.push('init:on-method'); }
        }
        const c = new Probe({
            onBuilt: [() => log.push('built:p1'), () => log.push('built:p2')],
            onDisposing: () => log.push('disposing:p1'),
            initializeComponent: () => log.push('init:p1'),
            oninitializeComponent: () => log.push('init:on-p1'),
        });
        c.motif.on('x:built' as any, () => log.push('built:x'));
        c.motif.on('x:disposing' as any, () => log.push('disposing:x'));
        await drive(c);
        expect(log).toEqual([
            'init:method', 'init:p1', 'init:on-method', 'init:on-p1',
            'built:method', 'built:p1', 'built:p2', 'built:lower', 'built:x',
            'disposing:method', 'disposing:p1', 'disposing:lower', 'disposing:x',
        ]);
    });
});

describe('handlers added later', () => {
    test('a handler added while the same hook runs is called in the same turn', async () => {
        const log: string[] = [];
        const c = new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                log.push('a');
                motifComponent(() => s, { runover: { initializeComponent: () => log.push('b') } });
            },
        } as any);
        await drive(c);
        expect(log).toEqual(['a', 'b']);
    });

    test('a third handler added while the second runs is called too', async () => {
        const log: string[] = [];
        const c = new Component('div', {
            onBuilt: [
                () => log.push('a'),
                (s: ComponentBase) => { log.push('b'); motifComponent(() => s, { runover: { onBuilt: () => log.push('c') } }); },
            ],
        } as any);
        await drive(c);
        expect(log).toEqual(['a', 'b', 'c']);
    });

    test('function component runover hooks added after config run once', async () => {
        const log: string[] = [];
        const Fn = () => new Component('div', { onConfig: () => log.push('own-config') } as any);
        const c = motifComponent(Fn, {
            runover: {
                onConfig: () => log.push('run-config'),
                onInitializing: () => log.push('run-initializing'),
                onInitialized: () => log.push('run-initialized'),
                onBuilt: () => log.push('run-built'),
            },
        }) as ComponentBase;
        await drive(c);
        expect(log.filter(x => x === 'run-config')).toEqual(['run-config']);
        expect(log.filter(x => x === 'run-initializing')).toEqual(['run-initializing']);
        expect(log.filter(x => x === 'run-initialized')).toEqual(['run-initialized']);
        expect(log.filter(x => x === 'own-config')).toEqual(['own-config']);
        expect(log.filter(x => x === 'run-built')).toEqual(['run-built']);
    });

    test('the same function from props and runover runs once', async () => {
        const log: string[] = [];
        const f = () => log.push('f');
        const c = new Component('div', { onBuilt: f, runover: { onBuilt: [f, () => log.push('g')] } } as any);
        await drive(c);
        expect(log).toEqual(['f', 'g']);
    });
});

describe('hook presence and errors', () => {
    test('onMounted with one handler waits for the document', async () => {
        const log: string[] = [];
        const c = new Component('div', { onMounted: () => log.push('mounted') } as any);
        const detached = new Component(document.createElement('section'));
        detached.build();
        detached.controls.add(c);
        await settle();
        expect(log).toEqual([]);
        document.body.appendChild(detached.element as unknown as Node);
        await settle();
        expect(log).toEqual(['mounted']);
        detached.dispose();
    });

    test('a component without hooks runs without lifecycle lists', async () => {
        const c = new Component('div', {} as any);
        await drive(c);
        expect(Object.keys((c as any)._base ?? {}).filter(k => /Handlers$/.test(k) && (c as any)._base[k] !== undefined)).toEqual([]);
    });

    test('a throwing handler does not stop the next one', async () => {
        const log: string[] = [];
        const errors: any[] = [];
        const orig = console.error;
        console.error = (...a: any[]) => { errors.push(a); };
        try {
            const c = new Component('div', { onBuilt: [() => { throw new Error('boom'); }, () => log.push('after')] } as any);
            await drive(c);
        } finally {
            console.error = orig;
        }
        expect(log).toEqual(['after']);
    });
});
