/**
 * @jest-environment jsdom
 */
import { Application, Component, configureReactivityLeakMonitor, effect, errorHandler, reactive } from '@motifx/core';

const flush = () => new Promise((r) => setTimeout(r, 0));
const items = (count: number) => Array.from({ length: count }, (_, i) => ({ v: i }));

let warn: jest.SpyInstance;
const warnings = () => warn.mock.calls.map((call) => String(call[0])).filter((text) => text.includes('MJX209'));

beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    errorHandler.setDevelopmentMode(true);
    configureReactivityLeakMonitor({ dependencies: 1000 });
});

afterEach(() => {
    errorHandler.setDevelopmentMode(false);
    warn.mockRestore();
    configureReactivityLeakMonitor({ dependencies: 1000 });
});

describe('dependency count warning', () => {
    test('an effect that tracks more than the limit warns once, not on every run', async () => {
        const state = reactive({ list: items(1200) });
        let sum = 0;
        const stop = effect(() => { sum = 0; for (const item of state.list) sum += item.v; });
        await flush();
        expect(warnings()).toHaveLength(1);
        expect(warnings()[0]).toMatch(/tracked 120\d dependencies in one run \(limit 1000\)/);
        state.list[3].v = 100;
        await flush();
        expect(sum).toBeGreaterThan(0);
        expect(warnings()).toHaveLength(1);
        stop();
    });

    test('an effect below the limit does not warn', async () => {
        const state = reactive({ list: items(900) });
        const stop = effect(() => { let sum = 0; for (const item of state.list) sum += item.v; return sum; });
        await flush();
        expect(warnings()).toHaveLength(0);
        stop();
    });

    test('the limit can be lowered or switched off', async () => {
        configureReactivityLeakMonitor({ dependencies: 50 });
        const state = reactive({ list: items(60) });
        const first = effect(() => { for (const item of state.list) item.v; });
        await flush();
        expect(warnings()).toHaveLength(1);
        first();
        configureReactivityLeakMonitor({ dependencies: 0 });
        const second = effect(() => { for (const item of state.list) item.v; });
        await flush();
        expect(warnings()).toHaveLength(1);
        second();
    });

    test('the warning names the owner component and binding when devtools are on', async () => {
        class Report extends Component<HTMLElement> {
            constructor(private readonly state: { list: { v: number }[] }) { super('p'); }
            onConfigured() { this.bindings.add('textContent', () => String(this.state.list.reduce((sum, item) => sum + item.v, 0))); }
        }
        const host = document.createElement('div');
        document.body.appendChild(host);
        const app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        const state = reactive({ list: items(1200) });
        const root = new Component('main');
        root.controls.add(new Report(state));
        app.run(host, root);
        await flush();
        const [message] = warnings();
        expect(message).toContain('owner Report at [0, 0, 0] (binding:textContent)');
        app.useDevelopment(false);
        await app.dispose();
        document.body.innerHTML = '';
    });
});
