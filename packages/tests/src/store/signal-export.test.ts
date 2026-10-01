import { Signal, Computed, createSignal, createComputed, effect } from '@motifx/core';
import type { TransitionProps } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

describe('store exports', () => {
  test('Signal and Computed classes are importable from @motifx/core', () => {
    expect(typeof Signal).toBe('function');
    expect(typeof Computed).toBe('function');
    expect(createSignal(1)).toBeInstanceOf(Signal);
    expect(createComputed(() => 1)).toBeInstanceOf(Computed);
  });

  test('Signal accepts a custom equality comparer', async () => {
    const s = new Signal(0, (a, b) => Math.abs(a - b) < 0.001);
    let runs = 0;
    effect(() => { void s.value; runs++; });
    await nextTick();
    s.value = 0.0001;
    await nextTick();
    expect(runs).toBe(1);
    s.value = 1;
    await nextTick();
    expect(runs).toBe(2);
  });

  test('TransitionProps type is importable', () => {
    const t: TransitionProps = { name: 'fade', duration: { enter: 100, leave: 50 } };
    expect(t.name).toBe('fade');
  });
});
