import { reactive, effect } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

describe('effect tests', () => {
  test('basic effect reruns when dependency changes', async () => {
    const state = reactive({ n: 1 });
    let runs = 0; let val = 0;
    effect(() => { val = (state as any).n; runs++; });
    await nextTick();
    (state as any).n = 2;
    await nextTick();
    expect(runs).toBe(2);
    expect(val).toBe(2);
  });

  test('stop effect prevents future runs', async () => {
    const state = reactive({ n: 1 });
    let runs = 0;
    const stop = effect(() => { (state as any).n; runs++; });
    await nextTick();
    stop();
    (state as any).n = 10;
    await nextTick();
    expect(runs).toBe(1);
  });

  test('multiple dependencies cleaned up after change', async () => {
    const state = reactive({ a: 1, b: 2 });
    let sum = 0; let runs = 0;
    const stop = effect(() => { sum = (state as any).a + (state as any).b; runs++; });
    await nextTick();
    (state as any).a = 2;
    (state as any).b = 3;
    await nextTick();
    expect(sum).toBe(5);
    expect(runs).toBe(2); // batched flush
    stop();
  });

  test('nested effects stack isolation', async () => {
    const state = reactive({ a: 1, b: 1 });
    let outerRuns = 0; let innerRuns = 0;
    let innerStop: (()=>void) | undefined;
    const outerStop = effect(() => {
      (state as any).a; outerRuns++;
      if (!innerStop) {
        innerStop = effect(() => { (state as any).b; innerRuns++; });
      }
    });
    await nextTick();
    (state as any).a = 2;
    (state as any).b = 3;
    await nextTick();
    // The inner effect will run an extra time at creation + when b changes
    expect(outerRuns).toBe(2);
    expect(innerRuns).toBe(2);
    outerStop(); innerStop && innerStop();
  });
});
