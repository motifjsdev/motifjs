/**
 * @jest-environment node
 */
import { dom } from '@motifx/core';

const g = globalThis as any;

afterEach(() => { delete g.motifDom; });

describe('dom.window without a browser window', () => {
    test('no window and no motifDom: falls back to globalThis instead of throwing', () => {
        expect(g.window).toBeUndefined();
        expect(() => dom.window).not.toThrow();
        expect(dom.window).toBe(g);
    });

    test('a DOM given with setDom (globalThis.motifDom) is used for dom.window', () => {
        const fake = { window: { name: 'fake-window' }, document: {} };
        g.motifDom = fake;
        expect(dom.window).toBe(fake.window);
    });
});
