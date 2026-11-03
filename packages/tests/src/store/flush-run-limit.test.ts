import { effect, errorHandler, reactive } from '@motifx/core';

const flush = () => new Promise((r) => setTimeout(r, 0));

let warn: jest.SpyInstance;
const warnings = () => warn.mock.calls.map((call) => String(call[0])).filter((text) => text.includes('MJX203'));

beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    errorHandler.setDevelopmentMode(true);
});

afterEach(() => {
    errorHandler.setDevelopmentMode(false);
    warn.mockRestore();
});

describe('runs of one effect in one flush', () => {
    test('an effect that writes what it reads runs fifty times in a flush and warns once', async () => {
        const state = reactive({ n: 0 });
        let runs = 0;
        const stop = effect(() => { runs++; state.n = state.n + 1; });
        await flush();
        expect(runs).toBe(51);
        expect(state.n).toBe(51);
        expect(warnings()).toHaveLength(1);
        state.n = 100;
        await flush();
        expect(runs).toBe(101);
        expect(state.n).toBe(150);
        expect(warnings()).toHaveLength(2);
        stop();
    });

    test('an effect woken late in a flush is counted from its first run in that flush', async () => {
        const a = reactive({ n: 0 });
        const b = reactive({ n: 0 });
        const c = reactive({ n: 0 });
        let loops = 0;
        const stops = [
            effect(() => { b.n = a.n; }),
            effect(() => { c.n = b.n; }),
            effect(() => { if (c.n > 0) { loops++; c.n = c.n + 1; } }),
        ];
        await flush();
        expect(loops).toBe(0);
        a.n = 1;
        await flush();
        expect(loops).toBe(50);
        expect(warnings()).toHaveLength(1);
        stops.forEach((stop) => stop());
    });

    test('effects that wake each other stop at fifty runs each', async () => {
        const state = reactive({ x: 0, y: 0 });
        let xRuns = 0;
        let yRuns = 0;
        const stops = [
            effect(() => { xRuns++; state.y = state.x + 1; }),
            effect(() => { yRuns++; state.x = state.y + 1; }),
        ];
        await flush();
        const x = xRuns;
        const y = yRuns;
        state.x = 1000;
        await flush();
        expect(xRuns - x).toBe(50);
        expect(yRuns - y).toBe(50);
        stops.forEach((stop) => stop());
    });
});
