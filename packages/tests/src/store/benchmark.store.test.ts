import { createSignal, createComputed, reactive, effect } from '@motifx/core';
import { measurePerformance, measurePerformanceSeries, nextTick } from '../helpers/test-utils';

const SLACK = 2;

const BENCH_WARMUP = parseInt(process.env.BENCH_WARMUP || '0',10)||0;
const BENCH_REPEATS = parseInt(process.env.BENCH_REPEATS || '1',10)||1;
const BENCH_AGGREGATE = (process.env.BENCH_AGGREGATE as 'median'|'mean') || 'median';

function perf(name: string, fn: () => any | Promise<any>) {
  if (BENCH_WARMUP>0 || BENCH_REPEATS>1) return measurePerformanceSeries(name, fn, { warmup: BENCH_WARMUP, repeats: BENCH_REPEATS, aggregate: BENCH_AGGREGATE });
  return measurePerformance(name, fn);
}

describe('Store Benchmark Tests', () => {
  const results: { name: string; duration: number; opsPerSecond?: number }[] = [];

  afterAll(()=>{
    console.log('\n=== Store Benchmark Results ===\n');
    results.forEach(r=>{
      console.log(`${r.name}:\n  Duration: ${r.duration.toFixed(2)}ms${r.opsPerSecond?`\n  Ops/sec: ${r.opsPerSecond.toFixed(0)}`:''}\n`);
    });
  });

  test('benchmark: signal set operations', async () => {
    const iterations = 5000;
    const s = createSignal(0);
    const { duration } = await perf('Signal sets', () => {
      for (let i=0;i<iterations;i++) s.value = i;
    });
    results.push({ name: 'Signal Set Ops', duration, opsPerSecond: (iterations/duration)*1000 });
    expect(duration).toBeLessThan(3000 * SLACK);
  }, 10000);

  test('benchmark: reactive property writes', async () => {
    const iterations = 3000;
    const obj = reactive({ x: 0 });
    const { duration } = await perf('Reactive writes', () => {
      for (let i=0;i<iterations;i++) (obj as any).x = i;
    });
    results.push({ name: 'Reactive Property Writes', duration, opsPerSecond: (iterations/duration)*1000 });
  }, 10000);

  test('benchmark: computed cached vs first access', async () => {
    const s = createSignal(1);
    let runs = 0;
    const c = createComputed(()=>{ runs++; return s.value*2; });
    const first = await perf('Computed first access', ()=>{ return c.value; });
    const second = await perf('Computed cached access', ()=>{ return c.value; });
    results.push({ name: 'Computed First Access', duration: first.duration });
    results.push({ name: 'Computed Cached Access', duration: second.duration });
    expect(runs).toBe(1); // second access should not recompute
  }, 10000);

  test('benchmark: effect flush batching', async () => {
    const iterations = 2000;
    const s = createSignal(0);
    let effectRuns = 0;
    effect(()=>{ s.value; effectRuns++; });
    await nextTick();
    const { duration } = await perf('Effect flush batching', ()=>{
      for (let i=0;i<iterations;i++) s.value = i;
    });
    await nextTick();
    results.push({ name: 'Effect Flush Batching', duration, opsPerSecond: (iterations/duration)*1000 });
    expect(effectRuns).toBeLessThan(iterations); // batched microtask flush
  }, 10000);
});
