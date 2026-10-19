import * as motif from '@motifx/core';
import { Component, ComponentBase, motifComponent } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

const tick = () => new Promise(r => setTimeout(r, 0));

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'OptionsNode.tsx');
    expect(out).not.toBeNull();
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mf', '_mfc', '_mv', 'Component', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).motifFragment, (motif as any).FNComponent, (motif as any).motifCompiled, Component, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

function mount(child: any) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

const tagProps = () => ({ data: { id: 1 }, label: 'Başlık', value: 'v', class: 'c', id: 'i', 'aria-label': 'al', 'data-k': 'v' });

describe('an Options component whose el is a ready DOM node treats the tag props like any component root', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('JSX-free: only the common attributes reach the node, everything stays in this.props, ctor gets the props', () => {
        const seen: any[] = [];
        const byNode: any = motifComponent({ el: document.createElement('div'), ctor(this: ComponentBase, p: any) { seen.push(p); } }, tagProps());
        const byName: any = motifComponent({ el: 'div', ctor(this: ComponentBase, p: any) { seen.push(p); } }, tagProps());
        mount(byNode);
        mount(byName);
        const node = byNode.element as HTMLElement;
        expect(node.outerHTML).toBe('<div class="c" id="i" aria-label="al" data-k="v"></div>');
        expect(node.outerHTML).toBe((byName.element as HTMLElement).outerHTML);
        expect(node.hasAttribute('data')).toBe(false);
        expect(node.hasAttribute('label')).toBe(false);
        expect(node.hasAttribute('value')).toBe(false);
        expect(Object.keys(byNode.props)).toEqual(Object.keys(tagProps()));
        expect(byNode.props.data).toEqual({ id: 1 });
        expect(seen).toHaveLength(2);
        expect(seen[0].label).toBe('Başlık');
    });

    test('compiled JSX tag: same attributes as a tag-name el, the view reads this.props and the tag event is bound', async () => {
        const log: string[] = [];
        const A = evalJsx(`
            const NodePanel = () => ({ el: document.createElement('div'), view() { return <span class="in">{this.props.label}</span>; } });
            const NamePanel = () => ({ el: 'div', view() { return <span class="in">{this.props.label}</span>; } });
            function A(){ return <main>
                <NodePanel data={{ id: 1 }} label="Başlık" value="v" class="c" id="n" aria-label="al" data-k="v" onclick={() => log.push('node')} />
                <NamePanel data={{ id: 1 }} label="Başlık" value="v" class="c" id="s" aria-label="al" data-k="v" onclick={() => log.push('name')} />
            </main>; }`, 'A', { log });
        const { host } = mount(A());
        await tick();
        const node = host.querySelector('#n') as HTMLElement;
        const name = host.querySelector('#s') as HTMLElement;
        expect(node.outerHTML).toBe('<div class="c" id="n" aria-label="al" data-k="v"><span class="in">Başlık</span></div>');
        expect(node.outerHTML.replace('id="n"', 'id="s"')).toBe(name.outerHTML);
        expect(node.hasAttribute('data')).toBe(false);
        expect(node.hasAttribute('label')).toBe(false);
        expect(node.hasAttribute('value')).toBe(false);
        node.click();
        name.click();
        expect(log).toEqual(['node', 'name']);
    });
});
