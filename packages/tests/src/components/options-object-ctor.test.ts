/**
 * @jest-environment jsdom
 */
import { Component, reactive } from '@motifx/core';

const ctorArgs: any[] = [];

const Counter = (props?: any) => ({
    el: 'section',
    data: reactive({ n: props?.start ?? 1 }),
    view() {
        const span = new Component('span');
        (span.element as HTMLElement).textContent = `n:${(this as any).data.n}`;
        return [span];
    },
    ctor(p: any) {
        ctorArgs.push(p);
    },
});

beforeEach(() => { ctorArgs.length = 0; });
afterEach(() => { document.body.innerHTML = ''; });

describe('new Component(factory) with an Options API object', () => {
    test('the factory result becomes a component with its own element and view', async () => {
        const c: any = new Component(Counter as any);
        c.build();
        expect(c).toBeInstanceOf(Component);
        expect((c.element as HTMLElement).tagName).toBe('SECTION');
        expect((c.element as HTMLElement).textContent).toBe('n:1');
        await c.dispose();
    });

    test('the options reach the factory and ctor', async () => {
        const c: any = new Component(Counter as any, { start: 5 } as any);
        c.build();
        expect((c.element as HTMLElement).textContent).toBe('n:5');
        expect(ctorArgs[0].start).toBe(5);
        await c.dispose();
    });

    test('an object passed directly stays a props object', async () => {
        const c: any = new Component({ el: 'section' } as any);
        expect(c.element).toBeInstanceOf(Comment);
        expect(c.props.el).toBe('section');
        await c.dispose();
    });
});
