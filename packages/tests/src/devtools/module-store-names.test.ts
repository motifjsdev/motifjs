/**
 * @jest-environment jsdom
 */
import { Application, Component, reactive, createSignal } from '@motifx/core';
import { nameModuleStore } from '@motifx/core/devtools';

const early = reactive({ items: [] as string[] });
nameModuleStore(early, 'cart', 'src/stores/cart.ts');

describe('devtools module store names', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        app.run(host, new Component('main'));
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
    });

    const find = (value: object) => hook().getStores().find((s: any) => s.value === value);

    test('a module store created before devtools was enabled is listed with its name and file', () => {
        expect(find(early)).toMatchObject({ name: 'cart', file: 'src/stores/cart.ts', type: 'reactive', holders: [] });
    });

    test('a store recorded before it is named takes the name', () => {
        const theme = createSignal('theme-value');
        const byValue = () => hook().getStores().find((s: any) => s.value === 'theme-value');
        expect(byValue().name).toBe('signal');
        nameModuleStore(theme, 'theme', 'src/theme.ts');
        expect(byValue()).toMatchObject({ name: 'theme', file: 'src/theme.ts', type: 'signal' });
    });

    test('a store without a module name has no file', () => {
        const loose = reactive({ a: 1 });
        expect('file' in find(loose)).toBe(false);
    });

    test('a value that is not a store is ignored', () => {
        const plain = { a: 1 };
        expect(() => nameModuleStore(plain, 'plain', 'src/plain.ts')).not.toThrow();
        expect(() => nameModuleStore(null, 'nothing', 'src/plain.ts')).not.toThrow();
        expect(hook().getStores().some((s: any) => s.name === 'plain' || s.name === 'nothing')).toBe(false);
    });
});
