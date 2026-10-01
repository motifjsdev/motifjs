import { reactive, effect } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';

describe('reactive array tests', () => {
  test('push triggers length dependency', async () => {
    const arr = reactive<number[]>([]);
    let runs = 0; let len = 0;
    effect(() => { len = arr.length; runs++; });
    await nextTick();
    arr.push(1);
    await nextTick();
    expect(len).toBe(1);
    expect(runs).toBe(2);
  });

  test('splice triggers effects', async () => {
    const arr = reactive<number[]>([1,2,3]);
    let sum = 0; let runs = 0;
    effect(() => { sum = arr.reduce((a,b)=>a+b,0); runs++; });
    await nextTick();
    arr.splice(1,1); // remove 2
    await nextTick();
    expect(sum).toBe(4);
    expect(runs).toBe(2);
  });

  test('multiple mutations inside microtask cause single flush', async () => {
    const arr = reactive<number[]>([]);
    let runs = 0; let len = 0;
    effect(() => { len = arr.length; runs++; });
    await nextTick();
    arr.push(1); arr.push(2); arr.push(3);
    await nextTick();
    expect(len).toBe(3);
    expect(runs).toBe(2);
  });
});
