/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'Fields.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component } from '@motifx/core';

class Dialog extends Component<HTMLDivElement> {
  declare props: { title: string };
  view() { return <h1>{this.props.title}</h1>; }
}

abstract class Labeled extends Component<HTMLDivElement> {
  abstract label: string;
  view() { return <span class="label">{this.label}</span>; }
}
class Fixed extends Labeled {
  get label() { return 'fixed'; }
}

const make = {
  dialog: () => <Dialog title="Hello" />,
  fixed: () => <Fixed />,
};
`;

const m = load(source, ['make', 'Dialog']);

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

describe('yalnız tip bildiren sınıf alanları', () => {
    test('declare props taban sınıfın kurduğu props değerini korur', () => {
        const dialog = m.make.dialog();
        root.controls.add(dialog);
        expect(dialog.props.title).toBe('Hello');
        expect(host.querySelector('h1')!.textContent).toBe('Hello');
    });

    test('abstract alanı getter ile karşılayan alt sınıf kurulur', () => {
        const fixed = m.make.fixed();
        root.controls.add(fixed);
        expect(fixed.label).toBe('fixed');
        expect(host.querySelector('.label')!.textContent).toBe('fixed');
    });
});
