import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise(r => setTimeout(r, 0));

function evalJsx(source: string, exportName: string) {
    const out = new CompilerCtor().start(source, 'Online.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(
        /import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g,
        (_m: string, list: string) => `const {${list.replace(/\bas\b/g, ':')}} = motif;`,
    );
    return new Function('motif', `${code}\nreturn ${exportName};`)(motif);
}

function mount(...children: any[]) {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    for (const c of children) root.controls.add(c);
    return root;
}

const online = (el: any) => (el as HTMLElement).dispatchEvent(new Event('online'));

afterEach(() => { document.body.innerHTML = ''; });

describe('the online DOM event keeps its own name', () => {
    test('motif.on("online") listens to online, as motif.on("ononline") does', () => {
        const log: string[] = [];
        const a: any = new Component('div');
        const b: any = new Component('div');
        a.motif.on('online', (e: Event) => log.push('a ' + e.type));
        b.motif.on('ononline', (e: Event) => log.push('b ' + e.type));
        const root = mount(a, b);
        online(a.element);
        online(b.element);
        expect(log).toEqual(['a online', 'b online']);
        expect(a.motif.options.hasEvent('online')).toBe(true);
        expect(b.motif.options.hasEvent('ononline')).toBe(true);
        root.dispose();
    });

    test('online:once runs once and off("online") removes the handler', () => {
        const log: string[] = [];
        const once: any = new Component('div');
        const kept: any = new Component('div');
        const f = (e: Event) => log.push('kept ' + e.type);
        once.motif.on('online:once', (e: Event) => log.push('once ' + e.type));
        kept.motif.on('online', f);
        const root = mount(once, kept);
        online(once.element);
        online(once.element);
        online(kept.element);
        expect(log).toEqual(['once online', 'kept online']);
        kept.motif.off('online', f);
        online(kept.element);
        expect(log).toEqual(['once online', 'kept online']);
        root.dispose();
    });

    test('ononline, onOnline, ononline:once and on:online on a plain tag listen to online', async () => {
        const Net = evalJsx(`function Net(props){ return <div>
            <i id="net-lower" ononline={(e) => props.log.push('lower ' + e.type)} />
            <i id="net-camel" onOnline={(e) => props.log.push('camel ' + e.type)} />
            <i id="net-once" ononline:once={(e) => props.log.push('once ' + e.type)} />
            <i id="net-context" on:online={(e) => props.log.push('context ' + e.type)} />
        </div>; }`, 'Net');
        const log: string[] = [];
        const root = mount(Net({ log }));
        await tick();
        for (const id of ['net-lower', 'net-camel', 'net-once', 'net-context', 'net-once']) {
            online(document.getElementById(id));
        }
        expect(log).toEqual(['lower online', 'camel online', 'once online', 'context online']);
        root.dispose();
    });
});
