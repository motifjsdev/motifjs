/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

function textInput(bind: (s: ComponentBase) => void) {
    return new Component('input', {
        onconfig: (s: ComponentBase) => bind(s),
        initializeComponent: (s: ComponentBase) => { s.attr.add({ type: 'text' }); }
    } as any);
}

async function typeInto(source: any, member: string, text: string) {
    const input = textInput(s => s.bindings.model(source, member));
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    host.controls.add(input);
    await tick();
    const el = input.element as unknown as HTMLInputElement;
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    return host;
}

describe('bindings.model write-back path', () => {
    afterEach(() => {
        delete (Object.prototype as any).polluted;
        delete (Function.prototype as any).polluted;
        document.body.innerHTML = '';
    });

    it('does not write through __proto__', async () => {
        const state = reactive({ name: '' });
        await typeInto(state, '__proto__.polluted', 'yes');
        expect(({} as any).polluted).toBeUndefined();
        expect((state as any).polluted).toBeUndefined();
    });

    it('does not write through __proto__ on a plain object', async () => {
        const plain: any = { name: '' };
        await typeInto(plain, '__proto__.polluted', 'yes');
        expect(({} as any).polluted).toBeUndefined();
    });

    it('does not write through an inherited constructor or prototype', async () => {
        const state = reactive({ name: '' });
        await typeInto(state, 'constructor.prototype.polluted', 'yes');
        expect(({} as any).polluted).toBeUndefined();
        expect((Function.prototype as any).polluted).toBeUndefined();
    });

    it('does not create a constructor field the model does not own', async () => {
        const state: any = reactive({ name: '' });
        await typeInto(state, 'constructor', 'x');
        expect(state.constructor).toBe(Object);
    });

    it('writes to an own field named constructor', async () => {
        const state: any = reactive({ constructor: 'old' });
        await typeInto(state, 'constructor', 'Ahmet');
        expect(state.constructor).toBe('Ahmet');
    });

    it('writes to an own nested field named prototype', async () => {
        const state: any = reactive({ meta: { prototype: 'a' } });
        await typeInto(state, 'meta.prototype', 'b');
        expect(state.meta.prototype).toBe('b');
    });

    it('still writes ordinary nested paths', async () => {
        const state: any = reactive({ user: { name: '' } });
        await typeInto(state, 'user.name', 'Ayşe');
        expect(state.user.name).toBe('Ayşe');
    });
});
