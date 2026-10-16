/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'SwitchEmpty.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    code = code.replace(/^export\s+/gm, '');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

const settle = async () => {
    for (let i = 0; i < 4; i++) {
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

const text = (el: Element | null) => (el?.textContent ?? '').trim();

describe('switch dalında null/undefined dönüşü yeri boşaltır', () => {
    test('default: return null önceki dalı kaldırır', async () => {
        const state = reactive({ status: 'idle' });
        const { View } = load(`
            export function View(props) {
                return <span class="status">{() => {
                    switch (props.state.status) {
                        case "saving": return <i>Kaydediliyor</i>;
                        default: return null;
                    }
                }}</span>;
            }
        `, ['View']);
        root.controls.add(View({ state }));
        await settle();
        expect(text(host.querySelector('.status'))).toBe('');
        state.status = 'saving';
        await settle();
        expect(text(host.querySelector('.status'))).toBe('Kaydediliyor');
        state.status = 'idle';
        await settle();
        expect(host.querySelector('.status i')).toBeNull();
        expect(text(host.querySelector('.status'))).toBe('');
    });

    test('case içinde return undefined ve koşullu null da yeri boşaltır', async () => {
        const state = reactive({ status: 'saving', show: true });
        const { View } = load(`
            export function View(props) {
                return <span class="status">{() => {
                    switch (props.state.status) {
                        case "saving": return props.state.show ? <i>Kaydediliyor</i> : null;
                        case "saved": return undefined;
                        default: return <b>Bekliyor</b>;
                    }
                }}</span>;
            }
        `, ['View']);
        root.controls.add(View({ state }));
        await settle();
        expect(text(host.querySelector('.status'))).toBe('Kaydediliyor');
        state.status = 'saved';
        await settle();
        expect(host.querySelector('.status i')).toBeNull();
        expect(text(host.querySelector('.status'))).toBe('');
        state.status = 'other';
        await settle();
        expect(text(host.querySelector('.status'))).toBe('Bekliyor');
    });
});
