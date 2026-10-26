/**
 * @jest-environment jsdom
 *
 * A2: onMounted kancası + x:mounted dinleyicisinin dispose'a bağlanması.
 * A3: class.add SVG elementlerinde de çalışmalı.
 */
import { Component } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));
const until = async (done: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!done() && Date.now() < end) await tick();
};

describe('onMounted (A2)', () => {
    it('fires once, only after the component is placed under a parent that is in the document', async () => {
        const calls: string[] = [];
        class X extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            onBuilt() { calls.push('built:' + document.contains(this.element as any)); }
            onMounted() { calls.push('mounted:' + document.contains(this.element as any)); }
        }
        const x = new X();
        x.build();
        await tick();
        expect(calls).toEqual(['built:false']);

        const host = document.createElement('div');
        document.body.appendChild(host);
        const parent = new Component(host);
        parent.build();
        parent.controls.add(x);
        await until(() => calls.length === 2);
        expect(calls).toEqual(['built:false', 'mounted:true']);

        // yeniden yerleşme ikinci kez tetiklemez
        await parent.controls.detach(x);
        parent.controls.add(x);
        await tick();
        await tick();
        expect(calls.length).toBe(2);
        parent.dispose();
        host.remove();
    });

    it('supports the onMounted prop and fires once the component is placed in an attached parent', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const parent = new Component(host);
        parent.build();
        let mounted = 0;
        parent.controls.add(new Component('span', { onMounted: () => mounted++ }));
        await until(() => mounted === 1);
        await tick();
        expect(mounted).toBe(1);
        parent.dispose();
        host.remove();
    });

    it('never runs the hook of a component that is disposed before it is placed', async () => {
        const mounted = jest.fn();
        const x = new Component('div', { onMounted: mounted });
        x.build();
        await x.dispose();
        await tick();
        await tick();
        expect(mounted).not.toHaveBeenCalled();
    });

    it('x:mounted listener dies with the component', async () => {
        const x = new Component('div');
        x.build();
        const cb = jest.fn();
        const el = x.element as HTMLElement;
        await x.motif.on('x:mounted' as any, cb);
        await x.dispose();
        document.body.appendChild(el);
        await tick();
        await tick();
        expect(cb).not.toHaveBeenCalled();
        el.remove();
    });
});

describe('class.add on SVG (A3)', () => {
    it('writes classes on an SVG root element', () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const c = new Component(svg as any);
        c.class.add('progress-ring');
        expect(svg.getAttribute('class')).toContain('progress-ring');
        expect(c.class.has('progress-ring')).toBe(true);
        c.class.remove('progress-ring');
        expect(svg.classList.contains('progress-ring')).toBe(false);
        c.dispose();
    });
});
