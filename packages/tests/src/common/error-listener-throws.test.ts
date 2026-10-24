/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, Emitter, errorHandler, motifComponent, safeCall, setUnexpectedErrorHandler } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

describe('an errorHandler listener that throws', () => {
    let offs: (() => void)[] = [];
    let errorSpy: jest.SpyInstance;
    const keepUnexpected = errorHandler.getUnexpectedErrorHandler();

    beforeEach(() => {
        offs = [];
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        offs.forEach(off => off());
        setUnexpectedErrorHandler(keepUnexpected);
        errorSpy.mockRestore();
        jest.useRealTimers();
    });

    function listeners() {
        const heard: any[] = [];
        offs.push(errorHandler.addListener(() => { throw new Error('listener failed'); }));
        offs.push(errorHandler.addListener((error) => heard.push(error)));
        return heard;
    }

    test('does not keep the report from the listeners after it, and its own error is thrown later', () => {
        jest.useFakeTimers();
        const heard = listeners();

        expect(() => errorHandler.report(new Error('reported'))).not.toThrow();
        expect(heard.map(e => e.message)).toEqual(['reported']);
        expect(() => jest.runOnlyPendingTimers()).toThrow('listener failed');
    });

    test('safeCall still returns its fallback', () => {
        jest.useFakeTimers();
        setUnexpectedErrorHandler(() => { });
        const heard = listeners();

        const value = safeCall(() => { throw new Error('inside safeCall'); }, 'test', 7);

        expect(value).toBe(7);
        expect(heard.map(e => e.message)).toEqual(['inside safeCall']);
        expect(() => jest.runOnlyPendingTimers()).toThrow('listener failed');
    });

    test('an event handler error reaches every listener and the other handlers still run', async () => {
        let other = 0;
        const button = motifComponent('button', (b: ComponentBase) => {
            b.motif.on('click', () => { throw new Error('click failed'); });
            b.motif.on('click', () => { other++; });
        });
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = new Component(host);
        root.build();
        root.controls.add(button);
        await tick();

        jest.useFakeTimers();
        const heard = listeners();
        expect(() => button.element.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();

        expect(heard.map(e => e.code)).toEqual(['MJX123']);
        expect(other).toBe(1);
        expect(() => jest.runOnlyPendingTimers()).toThrow('listener failed');
        jest.useRealTimers();
        await root.dispose();
        host.remove();
    });

    test('an Emitter listener error reaches every listener', () => {
        jest.useFakeTimers();
        setUnexpectedErrorHandler(() => { });
        const heard = listeners();
        const emitter = new Emitter<number>();
        let second = 0;
        emitter.event(() => { throw new Error('emitter listener failed'); });
        emitter.event(() => { second++; });

        expect(() => emitter.fire(1)).not.toThrow();

        expect(heard.map(e => e.message)).toEqual(['emitter listener failed']);
        expect(second).toBe(1);
        expect(() => jest.runOnlyPendingTimers()).toThrow('listener failed');
    });
});
