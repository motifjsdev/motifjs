/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, motifComponent, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));
const settle = async () => { await tick(); await tick(); await tick(); };

function mount(child: ComponentBase) {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    host.controls.add(child);
    return host;
}

const tag = (name: string, text: string) => motifComponent(name, {
    initializeComponent: (s: ComponentBase) => { s.setText(text); }
}) as ComponentBase;

const html = (c: ComponentBase) => (c.element as unknown as HTMLElement).innerHTML;

function nestedPanel(st: { a: boolean; b: boolean }, onInnerRun: () => void) {
    return new Component('div', {
        initializeComponent: (s: ComponentBase) => {
            s.bindings.ternary(
                () => st.a,
                (frame: any) => { frame.navigate(tag('b', 'A')); },
                (frame: any) => {
                    (s.bindings as any).ternaryCall(
                        () => { onInnerRun(); return st.b; },
                        () => { frame.navigate(tag('i', 'B')); },
                        () => { frame.navigate(tag('u', 'C')); }
                    );
                }
            );
        }
    } as any);
}

describe('conditional bindings stop with their component', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('stops the when() condition effect on dispose', async () => {
        const st = reactive({ on: true });
        let runs = 0;
        const panel = new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.when(() => { runs++; return st.on; }, () => tag('b', 'shown'));
            }
        } as any);
        mount(panel);
        await settle();
        expect(html(panel)).toContain('<b>shown</b>');

        await panel.dispose();
        const before = runs;
        st.on = false;
        await settle();
        st.on = true;
        await settle();
        expect(runs).toBe(before);
    });

    it('stops the ternary() condition effect on dispose', async () => {
        const st = reactive({ on: true });
        let runs = 0;
        const panel = new Component('div', {
            initializeComponent: (s: ComponentBase) => {
                s.bindings.ternary(
                    () => { runs++; return st.on; },
                    (frame: any) => { frame.navigate(tag('b', 'yes')); },
                    (frame: any) => { frame.navigate(tag('i', 'no')); }
                );
            }
        } as any);
        mount(panel);
        await settle();
        expect(html(panel)).toContain('<b>yes</b>');

        await panel.dispose();
        const before = runs;
        st.on = false;
        await settle();
        st.on = true;
        await settle();
        expect(runs).toBe(before);
    });

    it('stops a nested ternary effect when the outer branch switches away', async () => {
        const st = reactive({ a: false, b: true });
        let innerRuns = 0;
        const panel = nestedPanel(st, () => { innerRuns++; });
        mount(panel);
        await settle();
        expect(html(panel)).toContain('<i>B</i>');

        st.a = true;
        await settle();
        expect(html(panel)).toContain('<b>A</b>');

        const before = innerRuns;
        st.b = false;
        await settle();
        expect(html(panel)).toContain('<b>A</b>');
        expect(html(panel)).not.toContain('<u>C</u>');
        expect(innerRuns).toBe(before);
    });

    it('keeps a single inner effect after the outer branch is entered repeatedly', async () => {
        const st = reactive({ a: false, b: true });
        let innerRuns = 0;
        const panel = nestedPanel(st, () => { innerRuns++; });
        mount(panel);
        await settle();
        for (let i = 0; i < 3; i++) {
            st.a = true;
            await settle();
            st.a = false;
            await settle();
        }
        const before = innerRuns;
        st.b = false;
        await settle();
        expect(innerRuns - before).toBe(1);
        expect(html(panel)).toContain('<u>C</u>');
    });

    it('stops nested ternary effects on dispose', async () => {
        const st = reactive({ a: false, b: true });
        let innerRuns = 0;
        const panel = nestedPanel(st, () => { innerRuns++; });
        mount(panel);
        await settle();
        await panel.dispose();
        const before = innerRuns;
        st.b = false;
        await settle();
        expect(innerRuns).toBe(before);
    });
});
