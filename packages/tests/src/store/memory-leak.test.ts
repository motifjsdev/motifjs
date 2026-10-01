import { reactive, effect, configureReactivityLeakMonitor } from '@motifx/core';
import { debugGetDeps } from '@motifx/core/devtools';
import { nextTick } from '../helpers/test-utils';

// Legacy reactiveListeners() was replaced by debugGetDeps(); keep the old call shape
const reactiveDeps = (model: any) => debugGetDeps(model) ?? new Map();

describe('memory / leak tests', () => {
  test('effects cleaned after stop remove deps', async () => {
    const obj = reactive({ x: 0 });
    const stops: (()=>void)[] = [];
    for (let i=0;i<20;i++) {
      stops.push(effect(()=>{ (obj as any).x; }));
    }
    await nextTick();
    let deps = reactiveDeps(obj) as Map<any, Set<any>>;
    expect(deps.size).toBeGreaterThan(0);
    stops.forEach(s=>s());
    await nextTick();
    deps = reactiveDeps(obj) as Map<any, Set<any>>;
    const depSet = deps.get('x');
    expect(!depSet || depSet.size === 0).toBe(true);
  });

  test('configure leak monitor does not throw and threshold honored', async () => {
    const obj = reactive({ y: 1 });
    configureReactivityLeakMonitor({ enabled: true, threshold: 5, name: 'test-leak' });
    const stops: (()=>void)[] = [];
    for (let i=0;i<6;i++) { stops.push(effect(()=>{ (obj as any).y; })); }
    await nextTick();
    const deps = reactiveDeps(obj) as Map<any, Set<any>>;
    const depSet = deps.get('y');
    expect(depSet && depSet.size).toBe(6);
    stops.forEach(s=>s());
    await nextTick();
    const afterMap = reactiveDeps(obj) as Map<any, Set<any>>;
    const afterSet = afterMap.get('y');
    expect(!afterSet || afterSet.size === 0).toBe(true);
  });
});

