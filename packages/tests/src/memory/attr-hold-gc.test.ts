import { Component } from '@motifx/core';

const gcAvailable = typeof (globalThis as any).gc === 'function';
const testGc = gcAvailable ? test : test.skip;

async function forceGC() {
    for (let i = 0; i < 5; i++) {
        (globalThis as any).gc();
        await new Promise(r => setTimeout(r, 0));
    }
}

describe('attr.hold and memory', () => {
    testGc('a held component that is disposed is collected while the holder still keeps the handle', async () => {
        const handles: { dispose(): void }[] = [];
        const refs: WeakRef<object>[] = [];
        await (async () => {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const root: any = new Component(host);
            root.build();
            for (let i = 0; i < 20; i++) {
                const button: any = new Component('button');
                button.attr.add({ disabled: () => false });
                root.controls.add(button);
                handles.push(button.attr.hold({ disabled: true, tabindex: -1 }));
                refs.push(new WeakRef(button));
                refs.push(new WeakRef(button.attr));
            }
            await new Promise(r => setTimeout(r, 0));
            await root.dispose();
            host.remove();
        })();
        await forceGC();
        expect(handles.length).toBe(20);
        expect(refs.filter(x => x.deref() !== undefined).length).toBe(0);
        expect(() => { for (const x of handles) { x.dispose(); } }).not.toThrow();
    });

    testGc('a released hold keeps nothing of the component', async () => {
        const refs: WeakRef<object>[] = [];
        await (async () => {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const root: any = new Component(host);
            root.build();
            for (let i = 0; i < 20; i++) {
                const button: any = new Component('button');
                root.controls.add(button);
                const held = button.attr.hold({ tabindex: -1 });
                held.dispose();
                refs.push(new WeakRef(held));
            }
            await new Promise(r => setTimeout(r, 0));
        })();
        await forceGC();
        expect(refs.filter(x => x.deref() !== undefined).length).toBe(0);
    });
});
