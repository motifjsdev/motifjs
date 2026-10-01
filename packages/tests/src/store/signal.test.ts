import { createSignal, effect } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

describe('Signal Tests', () => {
  test('basic read/write triggers effect', async () => {
    const s = createSignal(1);
    let runs = 0;
    let latest: number = 0;
    effect(() => { runs++; latest = s.value; });
    await nextTick();
    expect(runs).toBe(1);
    expect(latest).toBe(1);
    s.value = 2;
    await nextTick();
    expect(runs).toBe(2);
    expect(latest).toBe(2);
  });

  test('setting same value does not retrigger (Object.is)', async () => {
    const s = createSignal(5);
    let runs = 0;
    effect(() => { s.value; runs++; });
    await nextTick();
    s.value = 5; // same value
    await nextTick();
    expect(runs).toBe(1); // no extra run
  });

  test('update() applies function and triggers', async () => {
    const s = createSignal(10);
    let observed: number = 0;
    effect(() => { observed = s.value; });
    await nextTick();
    s.update(v => v + 5);
    await nextTick();
    expect(observed).toBe(15);
  });

  test('mutate() triggers even if reference same', async () => {
    const s = createSignal<{ count: number }>({ count: 0 });
    let counts: number[] = [];
    effect(() => { counts.push(s.value.count); });
    await nextTick();
    s.mutate(obj => { obj.count++; });
    await nextTick();
    expect(counts).toEqual([0, 1]);
  });

  test('notify() forces trigger without change', async () => {
    const s = createSignal(1);
    let runs = 0;
    effect(() => { s.value; runs++; });
    await nextTick();
    s.notify();
    await nextTick();
    expect(runs).toBe(2);
  });

  test('dispose prevents further tracking and triggering', async () => {
    const s = createSignal(1);
    let runs = 0;
    effect(() => { s.value; runs++; });
    await nextTick();
    s.dispose();
    s.value = 2;
    await nextTick();
    expect(runs).toBe(1); // no rerun after dispose
  });
});
