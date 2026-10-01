/**
 * Component Benchmark Tests
 * Performance benchmarks for component operations
 */

import { Component, ComponentBase, reactive } from '@motifx/core';
import {
    wait,
    nextTick,
    createTestContainer,
    cleanupTestContainer,
    measurePerformance,
    measurePerformanceSeries,
    measureMemory,
    wrapInRoot
} from '../helpers/test-utils';

const SLACK = 2;

interface BenchmarkResult {
    name: string;
    duration: number;
    opsPerSecond?: number;
    memory?: number;
}

describe('Component Benchmark Tests', () => {
    let container: HTMLElement;
    const results: BenchmarkResult[] = [];

    // Read benchmark params from environment (optional)
    const BENCH_WARMUP = parseInt(process.env.BENCH_WARMUP || '0', 10) || 0;
    const BENCH_REPEATS = parseInt(process.env.BENCH_REPEATS || '1', 10) || 1;
    const BENCH_AGGREGATE = (process.env.BENCH_AGGREGATE as 'median' | 'mean') || 'median';

    async function perf(
        name: string,
        fn: () => any | Promise<any>
    ): Promise<{ duration: number; memory?: number }> {
        if (BENCH_WARMUP > 0 || BENCH_REPEATS > 1) {
            const { duration, memory } = await measurePerformanceSeries(name, fn, {
                warmup: BENCH_WARMUP,
                repeats: BENCH_REPEATS,
                aggregate: BENCH_AGGREGATE
            });
            return { duration, memory };
        }
        const { duration, memory } = await measurePerformance(name, fn);
        return { duration, memory };
    }

    beforeEach(() => {
        container = createTestContainer();
    });

    afterEach(() => {
        cleanupTestContainer(container);
    });

    afterAll(() => {
        // Print benchmark results
        console.log('\n=== Component Benchmark Results ===\n');
        results.forEach(result => {
            console.log(`${result.name}:`);
            console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
            if (result.opsPerSecond) {
                console.log(`  Ops/sec: ${result.opsPerSecond.toFixed(0)}`);
            }
            if (result.memory) {
                console.log(`  Memory: ${(result.memory / 1024 / 1024).toFixed(2)}MB`);
            }
            console.log('');
        });
    });

    describe('Component Creation Benchmarks', () => {
        test('benchmark: simple component creation', async () => {
            const iterations = 1000;

            const { duration } = await perf('Simple creation', async () => {
                const components: ComponentBase[] = [];
                for (let i = 0; i < iterations; i++) {
                    components.push(new Component('div'));
                }
                await nextTick();

                for (const comp of components) {
                    await comp.dispose();
                }
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Simple Component Creation',
                duration,
                opsPerSecond
            });

            expect(duration).toBeLessThan(5000 * SLACK);
        }, 15000);

        test('benchmark: component creation with props', async () => {
            const iterations = 1000;

            const { duration } = await perf('Creation with props', async () => {
                const components: ComponentBase[] = [];
                for (let i = 0; i < iterations; i++) {
                    components.push(new Component('div', {
                        initializeComponent: (sender: ComponentBase) => {
                            sender.setText(`Component ${i}`);
                            sender.class.add('test-class');
                        }
                    }));
                }
                await nextTick();

                for (const comp of components) {
                    await comp.dispose();
                }
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Component Creation with Props',
                duration,
                opsPerSecond
            });
        }, 15000);

        test('benchmark: component tree creation', async () => {
            const iterations = 100;
            const childrenPerComponent = 10;

            const { duration, memory } = await perf('Tree creation', async () => {
                const roots: ComponentBase[] = [];
                
                for (let i = 0; i < iterations; i++) {
                    const root = new Component('div', {
                        initializeComponent: (sender: ComponentBase) => {
                            for (let j = 0; j < childrenPerComponent; j++) {
                                sender.controls.add(new Component('span', {
                                    initializeComponent: (s: ComponentBase) => s.setText(`Child ${j}`)
                                }));
                            }
                        }
                    });
                    roots.push(root);
                }
                await nextTick();

                for (const root of roots) {
                    await root.dispose();
                }
            });

            results.push({
                name: 'Component Tree Creation (10 children each)',
                duration,
                opsPerSecond: (iterations / duration) * 1000,
                memory
            });
        }, 20000);
    });

    describe('Build Benchmarks', () => {
        test('benchmark: component build', async () => {
            const iterations = 1000;
            const components: ComponentBase[] = [];

            for (let i = 0; i < iterations; i++) {
                components.push(new Component('div', {
                    initializeComponent: (sender: ComponentBase) => sender.setText(`Build ${i}`)
                }));
            }

            const { duration } = await perf('Build', async () => {
                for (const comp of components) {
                    comp.build();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Component Build',
                duration,
                opsPerSecond
            });

            for (const comp of components) {
                await comp.dispose();
            }
        }, 15000);

        test('benchmark: component build with children', async () => {
            const iterations = 200;
            const components: ComponentBase[] = [];

            for (let i = 0; i < iterations; i++) {
                components.push(new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        for (let j = 0; j < 5; j++) {
                            sender.controls.add(new Component('span', {
                                initializeComponent: (s: ComponentBase) => s.setText(`Child ${j}`)
                            }));
                        }
                    }
                }));
            }

            const { duration } = await perf('Build with children', async () => {
                for (const comp of components) {
                    comp.build();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Component Build (with 5 children)',
                duration,
                opsPerSecond
            });

            for (const comp of components) {
                await comp.dispose();
            }
        }, 20000);

        test('benchmark: DOM attachment', async () => {
            const iterations = 500;
            const components: ComponentBase[] = [];

            for (let i = 0; i < iterations; i++) {
                const comp = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => sender.setText(`Attach ${i}`)
                });
                comp.build();
                components.push(comp);
            }

            const { duration } = await perf('DOM attachment', async () => {
                for (const comp of components) {
                    container.appendChild(comp.element as Node);
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'DOM Attachment',
                duration,
                opsPerSecond
            });

            for (const comp of components) {
                await comp.dispose();
            }
        }, 15000);
    });

    describe('Update Benchmarks', () => {
        test('benchmark: text content updates', async () => {
            const iterations = 1000;
            const comp = new Component('div');
            comp.build();
            container.appendChild(comp.element as Node);

            const { duration } = await perf('Text updates', async () => {
                for (let i = 0; i < iterations; i++) {
                    comp.setText(`Update ${i}`);
                    if (i % 50 === 0) await nextTick();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Text Content Updates',
                duration,
                opsPerSecond
            });

            await comp.dispose();
        }, 15000);

        test('benchmark: style updates', async () => {
            const iterations = 1000;
            const comp = new Component('div');
            comp.build();
            container.appendChild(comp.element as Node);

            const { duration } = await perf('Style updates', async () => {
                for (let i = 0; i < iterations; i++) {
                    comp.style({ color: `rgb(${i % 255}, 0, 0)` });
                    if (i % 50 === 0) await nextTick();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Style Updates',
                duration,
                opsPerSecond
            });

            await comp.dispose();
        }, 15000);

        test('benchmark: class updates', async () => {
            const iterations = 1000;
            const comp = new Component('div');
            comp.build();
            container.appendChild(comp.element as Node);

            const { duration } = await perf('Class updates', async () => {
                for (let i = 0; i < iterations; i++) {
                    comp.class.add(`class-${i % 10}`);
                    comp.class.remove(`class-${(i - 1) % 10}`);
                    if (i % 50 === 0) await nextTick();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Class Updates',
                duration,
                opsPerSecond
            });

            await comp.dispose();
        }, 15000);
    });

    describe('Binding Benchmarks', () => {
        test('benchmark: single binding updates', async () => {
            const iterations = 1000;
            const data = reactive({ value: 0 });

            const comp = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => `Value: ${data.value}`);
                }
            });

            comp.build();
            container.appendChild(comp.element as Node);
            await nextTick();

            const { duration } = await perf('Binding updates', async () => {
                for (let i = 0; i < iterations; i++) {
                    data.value = i;
                    if (i % 50 === 0) await nextTick();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Single Binding Updates',
                duration,
                opsPerSecond
            });

            await comp.dispose();
        }, 15000);

        test('benchmark: multiple bindings updates', async () => {
            const iterations = 500;
            const componentCount = 50;
            const data = reactive({ value: 0 });
            const components: ComponentBase[] = [];

            for (let i = 0; i < componentCount; i++) {
                const comp = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.bindings.text(() => `Value: ${data.value}`);
                    }
                });
                comp.build();
                container.appendChild(comp.element as Node);
                components.push(comp);
            }

            await nextTick();

            const { duration } = await perf('Multi-binding updates', async () => {
                for (let i = 0; i < iterations; i++) {
                    data.value = i;
                    if (i % 25 === 0) await nextTick();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: `Multiple Bindings Updates (${componentCount} components)`,
                duration,
                opsPerSecond
            });

            for (const comp of components) {
                await comp.dispose();
            }
        }, 20000);

        test('benchmark: complex binding expressions', async () => {
            const iterations = 500;
            const state = reactive({
                firstName: 'John',
                lastName: 'Doe',
                age: 30,
                counter: 0
            });

            const comp = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => {
                        return `${state.firstName} ${state.lastName}, Age: ${state.age}, Count: ${state.counter}`;
                    });
                }
            });

            comp.build();
            container.appendChild(comp.element as Node);
            await nextTick();

            const { duration } = await perf('Complex bindings', async () => {
                for (let i = 0; i < iterations; i++) {
                    state.counter = i;
                    if (i % 50 === 0) {
                        state.age++;
                    }
                    if (i % 25 === 0) await nextTick();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Complex Binding Expressions',
                duration,
                opsPerSecond
            });

            await comp.dispose();
        }, 15000);
    });

    describe('Visibility Benchmarks', () => {
        test('benchmark: show/hide operations', async () => {
            const iterations = 200;
            const { root, child: comp } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => sender.setText('Visibility test')
            }));
            container.appendChild(root.element as Node);
            await nextTick();

            const { duration } = await perf('Show/hide', async () => {
                for (let i = 0; i < iterations; i++) {
                    await comp.motif.hide();
                    await comp.motif.show();
                }
            });

            const opsPerSecond = ((iterations * 2) / duration) * 1000;
            results.push({
                name: 'Show/Hide Operations',
                duration,
                opsPerSecond
            });

            await comp.dispose();
        }, 30000);

        test('benchmark: toggle operations', async () => {
            const iterations = 400;
            const { root, child: comp } = wrapInRoot(() => new Component('div'));
            container.appendChild(root.element as Node);

            const { duration } = await perf('Toggle', async () => {
                for (let i = 0; i < iterations; i++) {
                    comp.motif.toggle();
                    if (i % 20 === 0) await nextTick();
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Toggle Operations',
                duration,
                opsPerSecond
            });

            await comp.dispose();
        }, 15000);
    });

    describe('Disposal Benchmarks', () => {
        test('benchmark: simple disposal', async () => {
            const iterations = 1000;
            const components: ComponentBase[] = [];

            for (let i = 0; i < iterations; i++) {
                const comp = new Component('div');
                comp.build();
                components.push(comp);
            }

            await nextTick();

            const { duration } = await perf('Simple disposal', async () => {
                for (const comp of components) {
                    await comp.dispose();
                }
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Simple Component Disposal',
                duration,
                opsPerSecond
            });
        }, 15000);

        test('benchmark: tree disposal', async () => {
            const iterations = 100;
            const roots: ComponentBase[] = [];

            for (let i = 0; i < iterations; i++) {
                const root = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        for (let j = 0; j < 10; j++) {
                            sender.controls.add(new Component('span', {
                                initializeComponent: (s: ComponentBase) => s.setText(`Child ${j}`)
                            }));
                        }
                    }
                });
                root.build();
                roots.push(root);
            }

            await nextTick();

            const { duration } = await perf('Tree disposal', async () => {
                for (const root of roots) {
                    await root.dispose();
                }
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Component Tree Disposal (10 children each)',
                duration,
                opsPerSecond
            });
        }, 20000);
    });

    describe('Event Handling Benchmarks', () => {
        test('benchmark: event listener registration', async () => {
            const iterations = 1000;
            const components: ComponentBase[] = [];

            const { duration } = await perf('Event registration', async () => {
                for (let i = 0; i < iterations; i++) {
                    const comp = new Component('button', {
                        initializeComponent: (sender: ComponentBase) => {
                            sender.motif.on('click', () => {});
                        }
                    });
                    comp.build();
                    components.push(comp);
                }
                await nextTick();
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Event Listener Registration',
                duration,
                opsPerSecond
            });

            for (const comp of components) {
                await comp.dispose();
            }
        }, 15000);

        test('benchmark: event triggering', async () => {
            const iterations = 5000;
            let clickCount = 0;

            const comp = new Component('button', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.motif.on('click', () => clickCount++);
                }
            });

            comp.build();
            container.appendChild(comp.element as Node);
            await nextTick();

            const { duration } = await perf('Event triggering', async () => {
                for (let i = 0; i < iterations; i++) {
                    (comp.element as HTMLElement).click();
                }
            });

            const opsPerSecond = (iterations / duration) * 1000;
            results.push({
                name: 'Event Triggering',
                duration,
                opsPerSecond
            });

            const expectedClicks = (BENCH_WARMUP > 0 || BENCH_REPEATS > 1)
                ? iterations * (BENCH_WARMUP + BENCH_REPEATS)
                : iterations;
            expect(clickCount).toBe(expectedClicks);
            await comp.dispose();
        }, 15000);
    });

    describe('Memory Benchmarks', () => {
        test('benchmark: memory usage per component', async () => {
            const iterations = 100;
            const memoryBefore = measureMemory();

            const components: ComponentBase[] = [];
            for (let i = 0; i < iterations; i++) {
                const comp = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.setText(`Component ${i}`);
                        sender.class.add('test');
                        sender.bindings.text(() => `Text ${i}`);
                    }
                });
                comp.build();
                components.push(comp);
            }

            await nextTick();

            const memoryAfter = measureMemory();
            const memoryUsed = memoryAfter - memoryBefore;

            if (memoryUsed > 0) {
                const memoryPerComponent = memoryUsed / iterations;
                results.push({
                    name: 'Memory per Component',
                    duration: 0,
                    memory: memoryPerComponent
                });

                console.log(`Memory per component: ${(memoryPerComponent / 1024).toFixed(2)}KB`);
            }

            for (const comp of components) {
                await comp.dispose();
            }
        }, 15000);
    });

    describe('Comparative Benchmarks', () => {
        test('benchmark: createElement vs Component', async () => {
            const iterations = 1000;

            // Native createElement
            const { duration: nativeDuration } = await perf('Native createElement', async () => {
                const elements: HTMLElement[] = [];
                for (let i = 0; i < iterations; i++) {
                    const el = document.createElement('div');
                    el.textContent = `Element ${i}`;
                    elements.push(el);
                }
            });

            // Component creation
            const { duration: componentDuration } = await perf('Component creation', async () => {
                const components: ComponentBase[] = [];
                for (let i = 0; i < iterations; i++) {
                    const comp = new Component('div', {
                        initializeComponent: (sender: ComponentBase) => sender.setText(`Component ${i}`)
                    });
                    components.push(comp);
                }

                for (const comp of components) {
                    await comp.dispose();
                }
            });

            results.push({
                name: 'Native createElement',
                duration: nativeDuration,
                opsPerSecond: (iterations / nativeDuration) * 1000
            });

            results.push({
                name: 'Component (vs Native)',
                duration: componentDuration,
                opsPerSecond: (iterations / componentDuration) * 1000
            });

            const overhead = ((componentDuration - nativeDuration) / nativeDuration) * 100;
            console.log(`Component overhead vs native: ${overhead.toFixed(2)}%`);
        }, 20000);
    });
});
