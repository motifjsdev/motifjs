import { Component, ComponentBase, errorHandler, MotifError } from '@motifx/core';

describe('x:initializing and x:initialized subscribed after construction', () => {
    test('a handler added with motif.on runs once right away, with the sender and the event', () => {
        const box = new Component('div');
        const calls: any[] = [];
        box.motif.on('x:initialized' as any, (sender: ComponentBase, e: any) => { calls.push(['initialized', sender, e]); });
        box.motif.on('x:initializing' as any, (sender: ComponentBase, e: any) => { calls.push(['initializing', sender, e]); });
        expect(calls.map(c => c[0])).toEqual(['initialized', 'initializing']);
        expect(calls[0][1]).toBe(box);
        expect(calls[0][2].cancel).toBe(false);
    });

    test('a one-parameter handler receives the event', () => {
        const box = new Component('div');
        const got: any[] = [];
        box.motif.on('x:initialized' as any, (e: any) => { got.push(e); });
        expect(got.length).toBe(1);
        expect(got[0].cancel).toBe(false);
    });

    test('a subscription in a subclass constructor runs', () => {
        const seen: string[] = [];
        class Panel extends Component<HTMLDivElement> {
            constructor() {
                super('div');
                this.motif.on('x:initialized' as any, () => { seen.push('initialized'); });
            }
        }
        new Panel();
        expect(seen).toEqual(['initialized']);
    });

    test('a handler that throws is reported as MJX122 and does not throw', () => {
        const reports: unknown[] = [];
        const listener = (error: unknown) => { reports.push(error); };
        const off = errorHandler.addListener(listener as any);
        const err = console.error;
        console.error = () => { };
        try {
            const box = new Component('div');
            expect(() => box.motif.on('x:initialized' as any, () => { throw new Error('boom'); })).not.toThrow();
        } finally {
            console.error = err;
            off();
        }
        expect(reports.some(r => r instanceof MotifError && (r as MotifError).code === 'MJX122')).toBe(true);
    });
});
