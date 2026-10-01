import { reactive, untracked } from '@motifx/core';
import { nextTick } from '../helpers/test-utils';
import { effect } from '@motifx/core';

describe('tracking control tests', () => {
  test('untracked prevents tracking inside callback', async () => {
    const state = reactive({ a: 1 });
    let runs = 0; let val = 0;
    effect(() => { val = (state as any).a; runs++; });
    await nextTick();
    untracked(() => { (state as any).a = 2; });
    await nextTick();
    // untracked still applied change but dependency was already tracked; here behavior: effect should rerun because trigger fires.
    expect(val).toBe(2);
    expect(runs).toBe(2);
  });

  test('untracked inside an effect: reads are NOT tracked by that effect', async () => {
    const state = reactive({ a: 1, b: 1 });
    let runs = 0;
    effect(() => { void (state as any).a; untracked(() => { void (state as any).b; }); runs++; });
    await nextTick();
    expect(runs).toBe(1);
    (state as any).b = 2; // b untracked içinde okundu → effect'e bağlanmamalı
    await nextTick();
    expect(runs).toBe(1);
    (state as any).a = 2; // a normal okundu → yeniden koşar
    await nextTick();
    expect(runs).toBe(2);
  });

  test('untracked returns the callback value and nested effects still track', async () => {
    const state = reactive({ a: 1, b: 1 });
    let outer = 0; let inner = 0; let got = 0;
    effect(() => {
      outer++;
      got = untracked(() => {
        effect(() => { void (state as any).b; inner++; }); // iç effect kendi çerçevesiyle izler
        return (state as any).a;
      });
    });
    await nextTick();
    expect(got).toBe(1); expect(outer).toBe(1); expect(inner).toBe(1);
    (state as any).a = 5; // dış effect'e bağlanmadı
    await nextTick();
    expect(outer).toBe(1);
    (state as any).b = 2; // iç effect izliyor
    await nextTick();
    expect(inner).toBe(2);
  });

  test('reading inside untracked does not create new dependency', async () => {
    const state = reactive({ a: 1, b: 1 });
    let runs = 0; let total = 0;
    effect(() => { total = (state as any).a; runs++; });
    await nextTick();
    untracked(() => { (state as any).b; });
    (state as any).b = 2; // should not trigger effect because b not tracked
    await nextTick();
    expect(runs).toBe(1);
  });
});
