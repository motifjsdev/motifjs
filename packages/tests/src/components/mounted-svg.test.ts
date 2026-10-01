/**
 * @jest-environment jsdom
 *
 * A2: onMounted kancası + x:mounted gözlemcisinin dispose'a bağlanması.
 * A3: class.add SVG elementlerinde de çalışmalı.
 */
import { Component } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('onMounted (A2)', () => {
    it('fires once, only after the element is attached to document', async () => {
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

        document.body.appendChild(x.element as any);
        await tick();
        expect(calls).toEqual(['built:false', 'mounted:true']);

        // yeniden bağlanma ikinci kez tetiklemez
        (x.element as HTMLElement).remove();
        document.body.appendChild(x.element as any);
        await tick();
        expect(calls.length).toBe(2);
        x.dispose();
        (x.element as HTMLElement | null)?.remove?.();
    });

    it('supports the onmounted prop and fires immediately when already attached', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const parent = new Component(host);
        parent.build();
        let mounted = 0;
        parent.controls.add(new Component('span', { onmounted: () => mounted++ }));
        await tick();
        expect(mounted).toBe(1);
        parent.dispose();
        host.remove();
    });

    it('disconnects the observer when a never-attached component is disposed', async () => {
        const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
        try {
            const x = new Component('div', { onmounted: () => { } });
            x.build();
            expect(disconnect).not.toHaveBeenCalled();
            await x.dispose();
            expect(disconnect).toHaveBeenCalledTimes(1);
        } finally {
            disconnect.mockRestore();
        }
    });

    it('x:mounted observer is also bound to dispose', async () => {
        const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
        try {
            const x = new Component('div');
            x.build();
            const cb = jest.fn();
            const el = x.element as HTMLElement;
            await x.motif.on('x:mounted' as any, cb);
            await x.dispose();
            expect(disconnect).toHaveBeenCalledTimes(1);
            document.body.appendChild(el);
            await tick();
            expect(cb).not.toHaveBeenCalled();
            el.remove();
        } finally {
            disconnect.mockRestore();
        }
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
