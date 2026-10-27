/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Application, Component } from '@motifx/core';

const h = (motif as any).motifComponent;

function Card(_props: any) {
    return new Component('article');
}

class Panel extends Component<HTMLElement> {
    constructor(props?: any) { super('section', props); }
}

describe('devtools readValue', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    function mount(...children: any[]) {
        const root = new Component('main');
        root.controls.add(...children);
        app.run(host, root);
    }

    test('reads one level of a nested object, array, Map and Set', () => {
        const stat = { title: 'Orders', tags: ['a', 'b'], byId: new Map([[1, { n: 1 }]]), seen: new Set(['x']), nested: { deep: { v: 1 } } };
        mount(h(Card, { stat }));
        const read = (keys: string[]) => hook().readValue([0, 0, 0], 'functionProps', keys);
        expect(read(['stat'])).toEqual({
            ok: true,
            value: {
                value: { kind: 'object', type: 'Object', keys: 5 },
                total: 5,
                entries: [
                    { key: 'title', value: 'Orders' },
                    { key: 'tags', value: { kind: 'array', length: 2 } },
                    { key: 'byId', value: { kind: 'object', type: 'Map', keys: 0 } },
                    { key: 'seen', value: { kind: 'object', type: 'Set', keys: 0 } },
                    { key: 'nested', value: { kind: 'object', type: 'Object', keys: 1 } },
                ],
            },
        });
        expect(read(['stat', 'tags']).value.entries).toEqual([{ key: '0', value: 'a' }, { key: '1', value: 'b' }]);
        expect(read(['stat', 'byId']).value.entries).toEqual([{ key: '1', value: { kind: 'object', type: 'Object', keys: 1 } }]);
        expect(read(['stat', 'byId', '1']).value.entries).toEqual([{ key: 'n', value: 1 }]);
        expect(read(['stat', 'seen']).value.entries).toEqual([{ key: '0', value: 'x' }]);
        expect(read(['stat', 'nested', 'deep']).value.entries).toEqual([{ key: 'v', value: 1 }]);
        expect(read(['stat', 'title'])).toEqual({ ok: true, value: { value: 'Orders', entries: [], total: 0 } });
    });

    test('never calls getters or functions', () => {
        let calls = 0;
        const data = { plain: 1 };
        Object.defineProperty(data, 'lazy', { enumerable: true, get: () => { calls++; return { x: 1 }; } });
        const format = () => { calls++; return 'x'; };
        mount(h(Card, { data, format }));
        const read = (keys: string[]) => hook().readValue([0, 0, 0], 'functionProps', keys);
        expect(read(['data']).value.entries).toEqual([{ key: 'plain', value: 1 }, { key: 'lazy', value: null, getter: true }]);
        expect(read(['data', 'lazy'])).toEqual({ ok: false, error: 'getter' });
        expect(read(['format'])).toEqual({ ok: true, value: { value: { kind: 'function', name: 'format' }, entries: [], total: 0 } });
        expect(calls).toBe(0);
    });

    test('rejects blocked keys, missing keys and paths', () => {
        mount(h(Card, { stat: { a: 1 } }));
        const read = (path: number[], keys: string[]) => hook().readValue(path, 'functionProps', keys);
        expect(read([0, 0, 0], ['__proto__'])).toEqual({ ok: false, error: 'invalid key' });
        expect(read([0, 0, 0], ['stat', 'constructor'])).toEqual({ ok: false, error: 'invalid key' });
        expect(read([0, 0, 0], ['nope'])).toEqual({ ok: false, error: 'missing key' });
        expect(read([0, 0, 0], ['stat', 'a', 'b'])).toEqual({ ok: false, error: 'not an object' });
        expect(read([0, 0, 9], ['stat'])).toEqual({ ok: false, error: 'no component at path' });
    });

    test('cuts long values at 100 entries and reports the total', () => {
        mount(h(Card, { list: Array.from({ length: 150 }, (_, i) => i) }));
        const r = hook().readValue([0, 0, 0], 'functionProps', ['list']);
        expect(r.value.entries).toHaveLength(100);
        expect(r.value.total).toBe(150);
    });

    test('reads class component props, and functionProps only on function components', () => {
        mount(h(Panel, { info: { a: 1 } }), h(Card, { b: 2 }));
        expect(hook().readValue([0, 0, 0], 'props', ['info']).value.entries).toEqual([{ key: 'a', value: 1 }]);
        expect(hook().readValue([0, 0, 0], 'functionProps', [])).toEqual({ ok: false, error: 'no functionProps' });
        expect(hook().readValue([0, 0, 1], 'functionProps', []).value.entries).toEqual([{ key: 'b', value: 2 }]);
    });
});
