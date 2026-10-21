/**
 * @jest-environment jsdom
 *
 * Derleyicinin try/catch'e aldığı üç JSX biçimi ({this.part()}, {a ?? b}, {cond && <X/>}) hata fırlatınca
 * hata MJX208 olarak raporlanır; geri dönüş değeri değişmez (yuva boş, sağ taraf, dal gizli).
 * Not: compiler dist derlenmiş olmalı (`npm run build --workspace=@motifx/compiler`).
 */
import * as motif from '@motifx/core';
import { Component, errorHandler, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise(r => setTimeout(r, 0));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'RC.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', '_mr', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, (motif as any).motifReport, Component, reactive, ...Object.values(extra)];
    const fn = new Function(...names, `${code}\nreturn ${exportName};`);
    return fn(...values);
}

function mount(child: any): { host: HTMLElement; root: Component } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

let reported: any[];
let unbind: () => void;
let log: jest.SpyInstance;

beforeEach(() => {
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    log = jest.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    unbind();
    log.mockRestore();
    document.body.innerHTML = '';
});

describe('derleyicinin yakaladığı hatalar raporlanır', () => {
    test('üye çağrısı çocuk fırlatınca MJX208 raporlanır, yuva boş kalır', async () => {
        const A = evalJsx(`
            class A extends Component {
                constructor(){ super('div'); }
                part(){ throw new Error('part broke'); }
                view(){ return <section>{this.part()}</section>; }
            }`, 'A');
        const { host, root } = mount(new A());
        await tick();
        expect(reported.map(e => e.code)).toEqual(['MJX208']);
        expect(reported[0].cause?.message).toBe('part broke');
        expect(host.querySelector('section')!.textContent).toBe('');
        await root.dispose();
    });

    test('?? sol tarafı fırlatınca rapor gider, sağ taraf gösterilir, sonraki değerde canlı kalır', async () => {
        const A = evalJsx(`function A(props){ return <span>{props.user.name ?? 'Anon'}</span>; }`, 'A');
        const p = reactive({ user: null as { name: string } | null });
        const { host, root } = mount(A(p));
        expect(host.textContent).toBe('Anon');
        expect(reported.map(e => e.code)).toEqual(['MJX208']);
        expect(reported[0].cause).toBeInstanceOf(TypeError);
        p.user = { name: 'Ali' };
        await tick();
        expect(host.textContent).toBe('Ali');
        expect(reported.length).toBe(1);
        await root.dispose();
    });

    test('&& koşulu fırlatınca rapor gider, dal gösterilmez', async () => {
        const B = evalJsx(`
            class B extends Component {
                constructor(){ super('div'); }
                ok(){ throw new Error('ok broke'); }
                view(){ return <div>{this.ok() && <b class="x"/>}</div>; }
            }`, 'B');
        const { host, root } = mount(new B());
        await tick();
        expect(reported.map(e => e.code)).toEqual(['MJX208']);
        expect(reported[0].cause?.message).toBe('ok broke');
        expect(host.querySelector('b.x')).toBeNull();
        await root.dispose();
    });

    test('rapor konsola da düşer (useLogging varsayılanı açık)', async () => {
        const A = evalJsx(`function A(props){ return <i>{props.user.name ?? '-'}</i>; }`, 'A');
        const { root } = mount(A(reactive({ user: null })));
        await tick();
        expect(log).toHaveBeenCalled();
        await root.dispose();
    });
});
