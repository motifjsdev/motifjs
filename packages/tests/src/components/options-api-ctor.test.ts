/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, motifComponent, reactive } from '@motifx/core';

describe('Options API ctor', () => {
    test('ctor runs once right after creation with this = component and the props', () => {
        const calls: { self: any; props: any; built: boolean }[] = [];
        const spec = {
            el: 'div',
            data: reactive({ message: 'a' }),
            ctor(this: any, props: any) {
                calls.push({ self: this, props, built: this.isBuilt });
                this.data.message = props?.greeting ?? 'b';
            }
        };
        const comp = motifComponent(spec, { greeting: 'selam' }) as ComponentBase;

        expect(comp).toBeInstanceOf(Component);
        expect(calls.length).toBe(1);
        expect(calls[0].self).toBe(comp);
        expect(calls[0].props.greeting).toBe('selam');
        expect(calls[0].built).toBe(false);
        expect((comp as any).data.message).toBe('selam');
        expect((comp as any).ctor).toBeUndefined();
    });

    test('a factory returning an options object also runs ctor', () => {
        let runs = 0;
        const Factory = () => ({ el: 'span', ctor() { runs++; } });
        const comp = motifComponent(Factory, {}) as ComponentBase;
        expect((comp.element as HTMLElement).tagName).toBe('SPAN');
        expect(runs).toBe(1);
    });

    test('ctor errors are contained and do not break creation', () => {
        const spec = { el: 'div', ctor() { throw new Error('boom'); } };
        const comp = motifComponent(spec, {}) as ComponentBase;
        expect(comp).toBeInstanceOf(Component);
        expect(comp.isDisposed).toBe(false);
    });

    test('objects without ctor keep working', () => {
        const spec = { el: 'div', data: reactive({ n: 1 }) };
        const comp = motifComponent(spec, {}) as any;
        expect(comp.data.n).toBe(1);
    });
});
