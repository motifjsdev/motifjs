/**
 * Memory / GC leak tests
 *
 * Verifies that the dispose chain releases everything a component grabbed:
 *  - effect subscriptions on long-lived reactive models
 *  - the component object graph itself (GC-collectable after dispose)
 *
 * GC-dependent tests only run under `npm run test:memory`
 * (node --expose-gc); otherwise they are skipped.
 */

import { Component, ComponentBase, reactive, createSignal } from '@motifx/core';
import { debugGetDeps } from '@motifx/core/devtools';
import { nextTick, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

const gcAvailable = typeof (globalThis as any).gc === 'function';
const testGc = gcAvailable ? test : test.skip;

async function forceGC() {
    for (let i = 0; i < 5; i++) {
        (globalThis as any).gc();
        await new Promise(r => setTimeout(r, 0));
    }
}

describe('memory / dispose chain', () => {
    let container: HTMLElement;

    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => { cleanupTestContainer(container); });

    test('disposing a component removes its effects from a long-lived model', async () => {
        // Simulates the global-store scenario: the model outlives the component.
        const model = reactive({ msg: 'hello' });

        const component = new Component('div', {
            initializeComponent: (sender: ComponentBase) => {
                sender.bindings.text(() => model.msg);
            }
        });
        component.build();
        container.appendChild(component.element as Node);
        await nextTick();

        const depsBefore = debugGetDeps(model);
        const subscribersBefore = depsBefore?.get('msg')?.size ?? 0;
        expect(subscribersBefore).toBeGreaterThan(0);

        await component.dispose();
        await nextTick();

        const depsAfter = debugGetDeps(model);
        const subscribersAfter = depsAfter?.get('msg')?.size ?? 0;
        expect(subscribersAfter).toBe(0);
    });

    test('disposing a component tree removes all child effects from shared models', async () => {
        const model = reactive({ a: 1, b: 2, c: 3 });
        const keys = ['a', 'b', 'c'] as const;

        const parent = new Component('div');
        for (const key of keys) {
            parent.controls.add(new Component('span', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => String((model as any)[key]));
                }
            }));
        }
        parent.build();
        container.appendChild(parent.element as Node);
        await nextTick();

        for (const key of keys) {
            expect(debugGetDeps(model)?.get(key)?.size ?? 0).toBeGreaterThan(0);
        }

        await parent.dispose();
        await nextTick();

        for (const key of keys) {
            expect(debugGetDeps(model)?.get(key)?.size ?? 0).toBe(0);
        }
    });

    test('signal bound to a disposed component no longer triggers its effect', async () => {
        const sig = createSignal(0);
        let bindingRuns = 0;

        const component = new Component('div', {
            initializeComponent: (sender: ComponentBase) => {
                sender.bindings.text(() => { bindingRuns++; return String(sig.value); });
            }
        });
        component.build();
        container.appendChild(component.element as Node);
        await nextTick();

        const runsBeforeDispose = bindingRuns;
        expect(runsBeforeDispose).toBeGreaterThan(0);

        await component.dispose();
        await nextTick();

        sig.value = 42;
        await nextTick();
        sig.value = 43;
        await nextTick();

        expect(bindingRuns).toBe(runsBeforeDispose);
    });
});

describe('memory / GC collectability (requires --expose-gc)', () => {
    let container: HTMLElement;

    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => { cleanupTestContainer(container); });

    // NOTE: creation + dispose happen inside an inner function so its stack
    // frame is gone before GC runs — V8 conservatively keeps objects alive
    // that are still reachable from the current frame.
    testGc('disposed component becomes garbage collectable', async () => {
        const ref = await (async () => {
            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => 'static');
                }
            });
            component.build();
            container.appendChild(component.element as Node);
            await nextTick();
            const r = new WeakRef(component);
            await component.dispose();
            await nextTick();
            return r;
        })();

        await forceGC();
        expect(ref.deref()).toBeUndefined();
    });

    testGc('disposed component bound to a surviving model becomes collectable', async () => {
        // The model stays alive; only the component must be collectable.
        const model = reactive({ text: 'persistent' });

        const ref = await (async () => {
            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => model.text);
                }
            });
            component.build();
            container.appendChild(component.element as Node);
            await nextTick();
            const r = new WeakRef(component);
            await component.dispose();
            await nextTick();
            return r;
        })();

        await forceGC();
        expect(ref.deref()).toBeUndefined();

        // The surviving model must not retain dead subscribers either.
        expect(debugGetDeps(model)?.get('text')?.size ?? 0).toBe(0);
    });

    testGc('disposed component tree (parent + children) becomes collectable', async () => {
        const model = reactive({ n: 0 });

        const { parentRef, childRefs } = await (async () => {
            const parent = new Component('div');
            const refs: WeakRef<object>[] = [];
            for (let i = 0; i < 10; i++) {
                const child = new Component('span', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.bindings.text(() => String(model.n + i));
                    }
                });
                parent.controls.add(child);
                refs.push(new WeakRef(child));
            }
            parent.build();
            container.appendChild(parent.element as Node);
            await nextTick();

            const pRef = new WeakRef(parent);
            await parent.dispose();
            await nextTick();
            return { parentRef: pRef, childRefs: refs };
        })();

        await forceGC();
        expect(parentRef.deref()).toBeUndefined();
        const aliveChildren = childRefs.filter(r => r.deref() !== undefined).length;
        expect(aliveChildren).toBe(0);
    });

    testGc('released reactive model becomes collectable after effects stop', async () => {
        const { effect } = require('@motifx/core');
        const ref = await (async () => {
            const model: any = reactive({ x: 1 });
            const stops: (() => void)[] = [];
            for (let i = 0; i < 5; i++) {
                stops.push(effect(() => { model.x; }));
            }
            await nextTick();
            const r = new WeakRef(model);
            stops.forEach(s => s());
            return r;
        })();

        await forceGC();
        expect(ref.deref()).toBeUndefined();
    });
});
