/**
 * @jest-environment jsdom
 */
import { Application, Component, createSignal, createComputed, createLazyComputed } from '@motifx/core';

let getterRuns = 0;

class Prefs extends Component {
    theme = createSignal('dark');
    user = createSignal({ name: 'Ada', tags: ['a', 'b'] });
    count = createSignal(2);
    double = createComputed(() => this.count.value * 2);
    later = createLazyComputed(() => { getterRuns++; return this.count.value + 1; });
    constructor() { super('section'); }
}

class ThemeService {
    theme = createSignal({ mode: 'dark', contrast: 1 });
}

describe('devtools signal previews', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    let prefs: Prefs;

    beforeEach(() => {
        getterRuns = 0;
        host = document.createElement('div');
        document.body.appendChild(host);
        const builder = Application.CreateBuilder();
        builder.services.addSingleton(ThemeService, ThemeService);
        app = builder.build();
        app.useDevelopment(true);
        prefs = new Prefs();
        app.run(host, prefs);
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
    });

    test('a signal field shows its value', () => {
        const fields = hook().inspect([0, 0]).fields;
        expect(fields.theme).toEqual({ kind: 'signal', type: 'signal', value: 'dark' });
        expect(fields.user).toEqual({ kind: 'signal', type: 'signal', value: { kind: 'object', type: 'Object', keys: 2 } });
    });

    test('a computed shows its value, and one not computed yet is stale without running the getter', () => {
        const fields = hook().inspect([0, 0]).fields;
        expect(fields.double).toEqual({ kind: 'signal', type: 'computed', value: 4 });
        expect(fields.later).toMatchObject({ kind: 'signal', type: 'computed', stale: true });
        expect(hook().readValue([0, 0], 'fields', ['later']).ok).toBe(true);
        expect(getterRuns).toBe(0);
    });

    test('reading through a signal opens its value', () => {
        const opened = hook().readValue([0, 0], 'fields', ['user']);
        expect(opened.value.value).toEqual({ kind: 'signal', type: 'signal', value: { kind: 'object', type: 'Object', keys: 2 } });
        expect(opened.value.entries).toEqual([{ key: 'name', value: 'Ada' }, { key: 'tags', value: { kind: 'array', length: 2 } }]);
        expect(hook().readValue([0, 0], 'fields', ['user', 'tags']).value.entries).toEqual([{ key: '0', value: 'a' }, { key: '1', value: 'b' }]);
        expect(hook().readValue([0, 0], 'fields', ['theme']).value).toEqual({ value: { kind: 'signal', type: 'signal', value: 'dark' }, entries: [], total: 0 });
    });

    test('a service field holding a signal opens to its value', () => {
        app.provider.get(ThemeService);
        const root = hook().getScopes()[0];
        expect(root.services.find((s: any) => s.token === 'ThemeService').instance).toEqual({ kind: 'object', type: 'ThemeService', keys: 1 });
        expect(hook().readService(root.id, 'ThemeService', []).value.entries).toEqual([
            { key: 'theme', value: { kind: 'signal', type: 'signal', value: { kind: 'object', type: 'Object', keys: 2 } } },
        ]);
        expect(hook().readService(root.id, 'ThemeService', ['theme']).value.entries).toEqual([{ key: 'mode', value: 'dark' }, { key: 'contrast', value: 1 }]);
    });

    test('signals and computeds are still recorded as stores', () => {
        const types = hook().getStores().filter((s: any) => s.holders.some((h: any) => h.type === 'Prefs')).map((s: any) => `${s.holders[0].field}:${s.type}`);
        expect(types.sort()).toEqual(['count:signal', 'double:computed', 'later:computed', 'theme:signal', 'user:signal']);
    });
});
