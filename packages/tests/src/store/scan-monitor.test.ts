/**
 * @jest-environment jsdom
 */
import { Application, Component, configureReactivityLeakMonitor, effect, errorHandler, reactive, untracked } from '@motifx/core';

const flush = () => new Promise((r) => setTimeout(r, 0));
type Row = { id: number; title: string; on: boolean };
const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i, title: 'row ' + i, on: i % 2 === 0 }));

let warn: jest.SpyInstance;
const warnings = () => warn.mock.calls.map((call) => String(call[0])).filter((text) => text.includes('MJX210'));

let app: Application;
let host: HTMLElement;

beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
    errorHandler.setDevelopmentMode(true);
    configureReactivityLeakMonitor({ scans: true });
    host = document.createElement('div');
    document.body.appendChild(host);
    app = Application.CreateBuilder().build();
    app.useDevelopment(true);
});

afterEach(async () => {
    app.useDevelopment(false);
    await app.dispose();
    errorHandler.setDevelopmentMode(false);
    warn.mockRestore();
    document.body.innerHTML = '';
});

class ListRow extends Component<HTMLLIElement, { id: number; rows: Row[] }> {
    constructor(props: { id: number; rows: Row[] }) { super('li', props); }
    onConfigured() { this.bindings.add('textContent', () => this.props.rows.find((row) => row.id === this.props.id)?.title ?? ''); }
}

const mount = (...children: Component[]) => {
    const root = new Component('ul');
    root.controls.add(...children);
    app.run(host, root);
    return root;
};

describe('MJX210: instances of one component scanning the same reactive list', () => {
    test('two rows scanning the list that came through props warn once, naming the component, the binding and the method', async () => {
        const state = reactive({ rows: rows(5) });
        const root = mount(new ListRow({ id: 1, rows: state.rows }), new ListRow({ id: 2, rows: state.rows }));
        await flush();
        expect(warnings()).toHaveLength(1);
        expect(warnings()[0]).toContain('"find()"');
        expect(warnings()[0]).toContain('2 instances of ListRow (binding:textContent)');
        root.controls.add(new ListRow({ id: 3, rows: state.rows }));
        await flush();
        expect(warnings()).toHaveLength(1);
    });

    test('one instance with two effects of the same kind counts as one instance', async () => {
        const state = reactive({ rows: rows(5) });
        class Twice extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            onConfigured() {
                this.bindings.watch(() => { state.rows.find((row) => row.id === 1); });
                this.bindings.watch(() => { state.rows.find((row) => row.id === 2); });
            }
        }
        mount(new Twice());
        await flush();
        expect(warnings()).toHaveLength(0);
    });

    test('a list shorter than the number of scanners stays quiet: settings lists and one-item lists', async () => {
        const settings = reactive({ rows: rows(3) });
        const single = reactive({ rows: rows(1) });
        const many = Array.from({ length: 10 }, (_, i) => new ListRow({ id: i % 3, rows: settings.rows }));
        mount(...many, new ListRow({ id: 0, rows: single.rows }), new ListRow({ id: 0, rows: single.rows }));
        await flush();
        expect(warnings()).toHaveLength(0);
    });

    test('one component aggregating with some() does not warn', async () => {
        const state = reactive({ rows: rows(5) });
        class Toolbar extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            onConfigured() { this.bindings.add('textContent', () => state.rows.some((row) => row.on) ? 'on' : 'off'); }
        }
        mount(new Toolbar());
        await flush();
        expect(warnings()).toHaveLength(0);
    });

    test('rows reading a keyed Map do not warn', async () => {
        const state = reactive({ byId: new Map(rows(5).map((row) => [row.id, row])) });
        class KeyedRow extends Component<HTMLLIElement, { id: number }> {
            constructor(props: { id: number }) { super('li', props); }
            onConfigured() { this.bindings.add('textContent', () => state.byId.get(this.props.id)?.title ?? ''); }
        }
        mount(new KeyedRow({ id: 1 }), new KeyedRow({ id: 2 }), new KeyedRow({ id: 3 }));
        await flush();
        expect(warnings()).toHaveLength(0);
    });

    test('lookups inside untracked or outside any effect do not count', async () => {
        const state = reactive({ rows: rows(5) });
        class QuietRow extends Component<HTMLLIElement, { id: number }> {
            constructor(props: { id: number }) { super('li', props); }
            onConfigured() { this.bindings.add('textContent', () => untracked(() => state.rows.find((row) => row.id === this.props.id))?.title ?? ''); }
        }
        mount(new QuietRow({ id: 1 }), new QuietRow({ id: 2 }), new QuietRow({ id: 3 }));
        for (let i = 0; i < 10; i++) state.rows.find((row) => row.id === i);
        await flush();
        expect(warnings()).toHaveLength(0);
    });

    test('rows scanning their own lists do not warn', async () => {
        class OwnRow extends Component<HTMLLIElement, { id: number }> {
            private readonly list = reactive({ rows: rows(3) });
            constructor(props: { id: number }) { super('li', props); }
            onConfigured() { this.bindings.add('textContent', () => this.list.rows.find((row) => row.id === this.props.id)?.title ?? ''); }
        }
        mount(new OwnRow({ id: 1 }), new OwnRow({ id: 2 }), new OwnRow({ id: 3 }));
        await flush();
        expect(warnings()).toHaveLength(0);
    });

    test('useReactiveMonitor({ scans: false }) switches the check off', async () => {
        app.useReactiveMonitor({ scans: false });
        const state = reactive({ rows: rows(5) });
        mount(new ListRow({ id: 1, rows: state.rows }), new ListRow({ id: 2, rows: state.rows }));
        await flush();
        expect(warnings()).toHaveLength(0);
    });

    test('without devtools the owner is unknown and the check stays silent', async () => {
        app.useDevelopment(false);
        const state = reactive({ rows: rows(5) });
        mount(new ListRow({ id: 1, rows: state.rows }), new ListRow({ id: 2, rows: state.rows }));
        await flush();
        expect(warnings()).toHaveLength(0);
    });

    test('owner-less effects need eight scanners on a list at least that long, and stopped ones drop out of the count', async () => {
        const short = reactive({ rows: rows(5) });
        const shortStops = Array.from({ length: 9 }, (_, i) => effect(() => short.rows.find((row) => row.id === i % 5)));
        await flush();
        expect(warnings()).toHaveLength(0);
        for (const stop of shortStops) stop();
        const state = reactive({ rows: rows(10) });
        const stops: (() => void)[] = [];
        for (let i = 0; i < 7; i++) stops.push(effect(() => state.rows.find((row) => row.id === i)));
        await flush();
        expect(warnings()).toHaveLength(0);
        stops.pop()!();
        stops.push(effect(() => state.rows.find((row) => row.id === 6)));
        await flush();
        expect(warnings()).toHaveLength(0);
        stops.push(effect(() => state.rows.find((row) => row.id === 7)));
        await flush();
        expect(warnings()).toHaveLength(1);
        expect(warnings()[0]).toContain('8 effects (effect)');
        for (const stop of stops) stop();
    });
});
