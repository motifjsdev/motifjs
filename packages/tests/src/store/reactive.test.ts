import { reactive, clearModel, effect } from '@motifx/core';
import { debugGetDeps } from '@motifx/core/devtools';
import { nextTick } from '../helpers/test-utils';

// Legacy reactiveListeners() was replaced by debugGetDeps(); keep the old call shape
const reactiveDeps = (model: any) => debugGetDeps(model) ?? new Map();

describe('reactive object tests', () => {
  test('primitive wraps into value property', async () => {
    const r = reactive(5);
    expect((r as any).value).toBe(5);
    let runs = 0; let latest = 0;
    effect(() => { latest = (r as any).value; runs++; });
    await nextTick();
    (r as any).value = 6;
    await nextTick();
    expect(runs).toBe(2);
    expect(latest).toBe(6);
  });

  test('nested property triggers effect', async () => {
    const state = reactive({ a: 1, nested: { b: 2 } });
    let val = 0; let runs = 0;
    effect(() => { val = state.nested.b; runs++; });
    await nextTick();
    state.nested.b = 3;
    await nextTick();
    expect(val).toBe(3);
    expect(runs).toBe(2);
  });

  test('same object returns same proxy', () => {
    const obj = { x: 1 };
    const r1 = reactive(obj);
    const r2 = reactive(obj);
    expect(r1).toBe(r2);
  });

  test('array push triggers length effect', async () => {
    const arr = reactive<number[]>([]);
    let len = -1; let runs = 0;
    effect(() => { len = arr.length; runs++; });
    await nextTick();
    arr.push(10);
    await nextTick();
    expect(len).toBe(1);
    expect(runs).toBe(2);
  });

  test('clearModel removes proxy tracking', async () => {
    const obj = reactive({ a: 1 });
    let runs = 0; let aVal = 0;
    const stop = effect(() => { aVal = (obj as any).a; runs++; });
    await nextTick();
    clearModel(obj);
    (obj as any).a = 2; // after clear, should not trigger effect
    await nextTick();
    expect(runs).toBe(1);
    stop();
  });

  test('debugGetDeps returns dependency map', async () => {
    const state = reactive({ x: 1 });
    effect(() => { (state as any).x; });
    await nextTick();
    const deps = reactiveDeps(state) as Map<any, any>; // narrow to target-specific map
    expect(deps.size).toBeGreaterThan(0);
    expect(deps.has('x')).toBe(true);
  });
});

