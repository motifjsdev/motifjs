/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'ClassExpression.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component } from '@motifx/core';
const Panel = class extends Component<HTMLDivElement> {
  view() { return <b>panel</b>; }
};
const withSlot = (Base) => class extends Base {
  view() { return <div class="slot">{this.childs}</div>; }
};
const Slotted = withSlot(Component);
const make = {
  panel: () => <Panel class="p" />,
  slotted: () => <Slotted><i class="kid">k</i></Slotted>,
};
`;
const m = load(source, ['make', 'Panel']);

let host: HTMLElement;
let root: Component;

beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host);
    root.build();
});

afterEach(() => {
    root.dispose();
    host.remove();
});

describe('sınıf ifadesiyle yazılan bileşen', () => {
    test('generic ile bildirilen kök elemanla kurulur', () => {
        const panel = m.make.panel();
        root.controls.add(panel);
        expect(m.Panel.elementTag).toBe("div");
        expect((panel.element as HTMLElement).outerHTML).toBe('<div class="p"><b>panel</b></div>');
    });

    test('mixin ile üretilen sınıf çocukları kendi slotuna yerleştirir', () => {
        root.controls.add(m.make.slotted());
        expect(host.querySelectorAll('.slot > .kid').length).toBe(1);
        expect(host.querySelectorAll('.kid').length).toBe(1);
    });
});
