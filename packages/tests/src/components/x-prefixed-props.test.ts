/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'XProps.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    code = code.replace(/^export\s+/gm, '');
    const fn = new Function('__motif', 'seen', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif, seen);
}

let seen: any[];
let host: HTMLElement;
let root: Component;

beforeEach(() => {
    seen = [];
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host);
    root.build();
});

afterEach(() => {
    root.dispose();
    host.remove();
});

describe('x ile başlayan prop adları çalışma anında', () => {
    test('sınıf bileşeninin props nesnesine ulaşır', () => {
        const { Page } = load(`
            import { Component } from '@motifx/core';
            class Chart extends Component {
                onBuilt() { seen.push({ ...this.props }); }
                view() { return <div></div>; }
            }
            export class Page extends Component {
                view() { return <div><Chart xField="date" xAxis={{ min: 2 }} x={10} xs={6} xStacked /></div>; }
            }
        `, ['Page']);
        root.controls.add(new Page());
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ xField: 'date', xAxis: { min: 2 }, x: 10, xs: 6, xStacked: true });
    });

    test('fonksiyon bileşeni parametresine ulaşır', () => {
        const { Page } = load(`
            import { Component } from '@motifx/core';
            function Chart(props) { seen.push(props.xField); return <span>{props.xField}</span>; }
            export class Page extends Component {
                view() { return <div><Chart xField="date" /></div>; }
            }
        `, ['Page']);
        root.controls.add(new Page());
        expect(seen).toEqual(['date']);
        expect(host.querySelector('span')!.textContent).toBe('date');
    });

    test('getter olarak verilen değer alıcıda canlıdır', async () => {
        const state = reactive({ on: true });
        const { Page } = load(`
            import { Component } from '@motifx/core';
            function Chart(props) { return <span>{props.xField}</span>; }
            export class Page extends Component {
                constructor(s) { super(); this.s = s; }
                view() { return <div><Chart xField={this.s.on ? 'a' : 'b'} /></div>; }
            }
        `, ['Page']);
        root.controls.add(new Page(state));
        expect(host.querySelector('span')!.textContent).toBe('a');
        state.on = false;
        await new Promise(r => setTimeout(r, 0));
        expect(host.querySelector('span')!.textContent).toBe('b');
    });

    test('x- ve x: adları sınıf bileşeninin props nesnesine adı bozulmadan ulaşır', () => {
        const { Page } = load(`
            import { Component } from '@motifx/core';
            class Chart extends Component {
                onBuilt() { seen.push({ ...this.props }); }
                view() { return <div></div>; }
            }
            export class Page extends Component {
                view() { return <div><Chart x-field="date" x:field="time" x-Axis={2} x-to="/a" x-list /></div>; }
            }
        `, ['Page']);
        root.controls.add(new Page());
        expect(seen[0]).toMatchObject({ 'x-field': 'date', 'x:field': 'time', 'x-Axis': 2, 'x-to': '/a', 'x-list': true });
    });

    test('x- ve x: adları fonksiyon bileşenine adı bozulmadan ulaşır', () => {
        const { Page } = load(`
            import { Component } from '@motifx/core';
            function Chart(props) { seen.push({ ...props }); return <span></span>; }
            export class Page extends Component {
                view() { return <div><Chart x-field="date" x:field="time" /></div>; }
            }
        `, ['Page']);
        root.controls.add(new Page());
        expect(seen[0]).toMatchObject({ 'x-field': 'date', 'x:field': 'time' });
    });

    test('düz etikette öznitelik olarak yazılır', () => {
        const { Page } = load(`
            import { Component } from '@motifx/core';
            export class Page extends Component {
                view() { return <div><a id="link" x-command="router" x-to="/a" x:field="date"></a></div>; }
            }
        `, ['Page']);
        root.controls.add(new Page());
        const a = host.querySelector('#link')!;
        expect(a.getAttribute('x-command')).toBe('router');
        expect(a.getAttribute('x-to')).toBe('/a');
        expect(a.getAttribute('x:field')).toBe('date');
    });

    test('düz etikette yayma ile gelen ad öznitelik olur, çekirdek yönergesi olmaz', () => {
        const { Page } = load(`
            import { Component } from '@motifx/core';
            export class Page extends Component {
                view() {
                    const rest = { 'x-field': 'date', 'x-wait': () => false, 'x-built': () => {} };
                    return <div><span id="spread" {...rest}></span></div>;
                }
            }
        `, ['Page']);
        root.controls.add(new Page());
        const el = host.querySelector('#spread')!;
        expect(el.getAttribute('x-field')).toBe('date');
        expect(el.hasAttribute('x-wait')).toBe(false);
        expect(el.hasAttribute('x-built')).toBe(false);
    });

    test('nesneyle kurulan bileşende de props içinde kalır, çekirdek yönergesi çalışır', () => {
        class Chart extends Component<HTMLDivElement> {}
        const hidden = reactive({ on: true });
        const chart = (motif as any).motifComponent(Chart, { 'x-field': 'date', 'x-wait': () => hidden.on });
        root.controls.add(chart);
        expect(chart.props['x-field']).toBe('date');
        expect(chart.props['x-wait']).toBeUndefined();
    });

    test('yaşam döngüsü kancası x- yazımıyla çalışmaya devam eder', () => {
        const { Page } = load(`
            import { Component } from '@motifx/core';
            function Chart(props) { return <span x-built={() => seen.push('ic')}></span>; }
            export class Page extends Component {
                view() { return <div><Chart x-built={() => seen.push('dis')} x-field="date" /></div>; }
            }
        `, ['Page']);
        root.controls.add(new Page());
        expect(seen).toEqual(expect.arrayContaining(['ic', 'dis']));
    });
});
