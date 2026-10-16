/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'ComponentModel.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    code = code.replace(/^export\s+/gm, '');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const settle = async () => {
    for (let i = 0; i < 3; i++) {
        await Promise.resolve();
        await new Promise(r => setTimeout(r, 0));
    }
};

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

const label = (id: string) => (host.querySelector('#' + id)?.textContent ?? '').trim();

describe('kendi value erişicisi olan bileşende x-model', () => {
    test('elemanı <button> olan sınıf bileşeni: model bileşenin value erişicisine yazılır, writeModel geri yazar', async () => {
        const note = reactive({ pinned: false });
        const { Host } = load(`
            import { Component, reactive } from "@motifx/core";
            export class PinSwitch extends Component<HTMLButtonElement> {
                state = reactive({ on: false });
                set value(v) { this.state.on = !!v; }
                get value() { return this.state.on; }
                onConfigured() { this.attr.add({ id: "cls", type: "button" }); this.motif.on("click", () => this.bindings.writeModel(!this.state.on)); }
                view() { return <>{() => (this.state.on ? "Sabit" : "Serbest")}</>; }
            }
            export class Host extends Component { view() { return <PinSwitch x-model={() => this.props.note.pinned} />; } }
        `, ['Host']);
        root.controls.add(new Host({ note }));
        await settle();
        expect(label('cls')).toBe('Serbest');
        note.pinned = true;
        await settle();
        expect(label('cls')).toBe('Sabit');
        expect((host.querySelector('#cls') as HTMLButtonElement).hasAttribute('value')).toBe(false);
        (host.querySelector('#cls') as HTMLButtonElement).click();
        await settle();
        expect(note.pinned).toBe(false);
        expect(label('cls')).toBe('Serbest');
    });

    test('Options nesnesindeki get/set erişici olarak bileşene taşınır', async () => {
        const note = reactive({ pinned: false });
        const { Host } = load(`
            import { Component, reactive } from "@motifx/core";
            export const PinSwitch = () => ({
                el: "div",
                data: reactive({ on: false }),
                set value(v) { this.data.on = !!v; },
                get value() { return this.data.on; },
                onConfigured() { this.attr.add({ id: "opt" }); this.motif.on("click", () => this.bindings.writeModel(!this.data.on)); },
                view() { return <>{() => (this.data.on ? "Sabit" : "Serbest")}</>; },
            });
            export class Host extends Component { view() { return <PinSwitch x-model={() => this.props.note.pinned} />; } }
        `, ['Host']);
        root.controls.add(new Host({ note }));
        await settle();
        expect(label('opt')).toBe('Serbest');
        note.pinned = true;
        await settle();
        expect(label('opt')).toBe('Sabit');
        (host.querySelector('#opt') as HTMLElement).click();
        await settle();
        expect(note.pinned).toBe(false);
    });

    test('elemanı <button> olan fonksiyon bileşeni: initializeComponent içinde kurulan erişici model yazımını alır', async () => {
        const note = reactive({ pinned: false });
        const { Host } = load(`
            import { Component, reactive } from "@motifx/core";
            export function PinSwitch() {
                const state = reactive({ on: false });
                return (
                    <button id="fn" type="button"
                        initializeComponent={(root) => Object.defineProperty(root, "value", { get: () => state.on, set: (v) => (state.on = !!v), configurable: true })}
                        onclick={(root, _e) => root.bindings.writeModel(!state.on)}>
                        {() => (state.on ? "Sabit" : "Serbest")}
                    </button>
                );
            }
            export class Host extends Component { view() { return <PinSwitch x-model={() => this.props.note.pinned} />; } }
        `, ['Host']);
        note.pinned = true;
        root.controls.add(new Host({ note }));
        await settle();
        expect(label('fn')).toBe('Sabit');
        expect((host.querySelector('#fn') as HTMLButtonElement).hasAttribute('value')).toBe(false);
        (host.querySelector('#fn') as HTMLButtonElement).click();
        await settle();
        expect(note.pinned).toBe(false);
        expect(label('fn')).toBe('Serbest');
    });

    test('kendi value erişicisi olmayan düz <button> değeri elemana yazmaya devam eder', async () => {
        const state = reactive({ v: 'a' });
        const { Host } = load(`
            import { Component, reactive } from "@motifx/core";
            export class Host extends Component { view() { return <button id="plain" type="button" x-model={() => this.props.state.v} />; } }
        `, ['Host']);
        root.controls.add(new Host({ state }));
        await settle();
        expect((host.querySelector('#plain') as HTMLButtonElement).value).toBe('a');
        state.v = 'b';
        await settle();
        expect((host.querySelector('#plain') as HTMLButtonElement).value).toBe('b');
    });
});
