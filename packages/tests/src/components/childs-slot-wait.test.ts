/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'Slots.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const source = `
import { Component, reactive } from '@motifx/core';
const log = [];
const gate = reactive({ wait: true });
function Child() { return <span class="kid" onbuilt={() => log.push('built')} ondisposed={() => log.push('disposed')}>c</span>; }

class Tagged extends Component<HTMLDivElement> {
  view() { return <div class="inner" x-wait={() => gate.wait}>{this.childs}</div>; }
}
class Fragmented extends Component {
  view() { return <div class="inner" x-wait={() => gate.wait}>{this.childs}</div>; }
}
class Nested extends Component<HTMLDivElement> {
  view() { return <section><div class="inner" x-wait={() => gate.wait}>{this.childs}</div></section>; }
}
class Getter extends Component<HTMLDivElement> {
  view() { return <div class="inner" x-wait={() => gate.wait}>{() => this.childs}</div>; }
}
class Concrete extends Component<HTMLDivElement> {
  constructor(props) { super('div', props); }
  view() { return <div class="inner" x-wait={() => gate.wait}>{this.childs}</div>; }
}
class NoSlot extends Component<HTMLDivElement> {}
class Inherited extends Tagged {}
function Fn(props) { return <div class="inner" x-wait={() => gate.wait}>{props.childs}</div>; }
const Opt = () => ({ el: 'div', view() { return <div class="inner" x-wait={() => gate.wait}>{this.childs}</div>; } });

const make = {
  Tagged: () => <Tagged><Child /></Tagged>,
  Fragmented: () => <Fragmented><Child /></Fragmented>,
  Nested: () => <Nested><Child /></Nested>,
  Getter: () => <Getter><Child /></Getter>,
  Concrete: () => <Concrete><Child /></Concrete>,
  NoSlot: () => <NoSlot><Child /></NoSlot>,
  Inherited: () => <Inherited><Child /></Inherited>,
  Fn: () => <Fn><Child /></Fn>,
  Opt: () => <Opt><Child /></Opt>,
};
`;

const m = load(source, ['log', 'gate', 'make', 'Tagged', 'NoSlot']);
const settle = () => new Promise(r => setTimeout(r, 0));

let host: HTMLElement;
let root: Component;

beforeEach(() => {
    m.log.length = 0;
    m.gate.wait = true;
    host = document.body.appendChild(document.createElement('div'));
    root = new Component(host);
    root.build();
});

afterEach(() => {
    root.dispose();
    host.remove();
});

const kidsIn = (selector: string) => host.querySelectorAll(selector).length;

describe('{this.childs} inside a waiting slot', () => {
    const waiting = ['Tagged', 'Fragmented', 'Nested', 'Getter', 'Concrete', 'Inherited', 'Fn', 'Opt'];

    test.each(waiting)('%s: the children are not built or shown while the slot waits', async (name) => {
        root.controls.add(m.make[name]());
        await settle();
        expect(m.log).toEqual([]);
        expect(kidsIn('.kid')).toBe(0);
    });

    test.each(waiting)('%s: releasing the wait builds the children once, inside the slot', async (name) => {
        root.controls.add(m.make[name]());
        await settle();
        m.gate.wait = false;
        await settle();
        expect(m.log).toEqual(['built']);
        expect(kidsIn('.inner > .kid')).toBe(1);
        expect(kidsIn('.kid')).toBe(1);
        m.gate.wait = true;
        await settle();
        m.gate.wait = false;
        await settle();
        expect(m.log).toEqual(['built']);
        expect(kidsIn('.kid')).toBe(1);
    });

    test.each(waiting)('%s: disposing before the slot opens disposes the children', async (name) => {
        const c = m.make[name]();
        root.controls.add(c);
        await settle();
        await c.disposeAsync();
        await settle();
        expect(m.log).toEqual(['disposed']);
    });

    test.each(waiting)('%s: disposing after the slot opened disposes the children once', async (name) => {
        const c = m.make[name]();
        root.controls.add(c);
        m.gate.wait = false;
        await settle();
        await c.disposeAsync();
        await settle();
        expect(m.log).toEqual(['built', 'disposed']);
    });
});

describe('a class that does not place {this.childs}', () => {
    test('still appends the children to its root', async () => {
        root.controls.add(m.make.NoSlot());
        await settle();
        expect(m.log).toEqual(['built']);
        expect(kidsIn('.kid')).toBe(1);
        expect(m.NoSlot._placesChilds).toBeUndefined();
    });

    test('a slot-placing class is marked by the compiler', () => {
        expect(m.Tagged._placesChilds).toBe(true);
    });
});
