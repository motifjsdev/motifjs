/**
 * @jest-environment jsdom
 *
 * A1: alt sınıf bileşenlerinde onConfig, sınıf alanları ilklendikten sonra
 * (build/onConfigured'dan hemen önce) çalışmalı. Düz `new Component(tag, { onConfig })`
 * kullanımında eski davranış (yapıcıda) korunur.
 */
import { Component, reactive } from '@motifx/core';

describe('onConfig timing for subclasses (A1)', () => {
    it('sees subclass fields (state = reactive(...)) in onConfig', () => {
        class X extends Component<HTMLDivElement> {
            state = reactive({ n: 0 });
            configured: string[] = [];
            constructor() { super('div'); }
            onConfig() { this.state.n++; this.configured.push('config'); }
            onConfigured() { this.configured.push('configured'); }
        }
        const x = new X();
        // henüz build edilmedi: ertelenmiş
        expect(x.isConfigured).toBe(false);
        expect(() => x.build()).not.toThrow();
        expect(x.state.n).toBe(1);
        expect(x.configured).toEqual(['config', 'configured']);
        expect(x.isConfigured).toBe(true);
        x.dispose();
    });

    it('runs onConfig before onConfigured when added to a built parent', () => {
        const order: string[] = [];
        class Child extends Component<HTMLSpanElement> {
            label = 'ready';
            constructor() { super('span'); }
            onConfig() { order.push('config:' + this.label); }
            onConfigured() { order.push('configured'); }
        }
        const parent = new Component('div');
        parent.build();
        parent.controls.add(new Child());
        expect(order).toEqual(['config:ready', 'configured']);
        parent.dispose();
    });

    it('keeps constructor-time onConfig for plain Component instances', () => {
        const calls: string[] = [];
        const c = new Component('div', { onConfig: () => calls.push('config') });
        expect(calls).toEqual(['config']);
        expect(c.isConfigured).toBe(true);
        c.build();
        expect(calls).toEqual(['config']); // yalnızca bir kez
        c.dispose();
    });

    it('calls a deferred onConfig only once even if build is repeated', () => {
        let count = 0;
        class Y extends Component<HTMLDivElement> {
            constructor() { super('div'); }
            onConfig() { count++; }
        }
        const y = new Y();
        y.build(); y.build();
        expect(count).toBe(1);
        y.dispose();
    });
});
