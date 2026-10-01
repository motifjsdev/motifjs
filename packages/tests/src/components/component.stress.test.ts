/**
 * Component Stress Tests
 * Tests component behavior under heavy load and extreme conditions
 */

import { Component, ComponentBase, reactive } from '@motifx/core';
import {
    wait,
    nextTick,
    createTestContainer,
    cleanupTestContainer,
    measurePerformance,
    measureMemory,
    wrapInRoot
} from '../helpers/test-utils';

const SLACK = 2;

describe('Component Stress Tests', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createTestContainer();
    });

    afterEach(() => {
        cleanupTestContainer(container);
    });

    describe('Large Component Trees', () => {
        test('should handle deep component nesting', async () => {
            const depth = 50;
            let current: ComponentBase | null = null;

            const createNestedComponent = (level: number): ComponentBase => {
                const comp = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.setText(`Level ${level}`);
                        if (level < depth) {
                            const child = createNestedComponent(level + 1);
                            sender.controls.add(child);
                        }
                    }
                });
                return comp;
            };

            const root = createNestedComponent(0);
            
            const { duration } = await measurePerformance('Deep nesting build', async () => {
                root.build();
                container.appendChild(root.element as Node);
                await nextTick();
            });

            expect(root.isBuilt).toBe(true);
            expect(duration).toBeLessThan(5000 * SLACK); // Should complete in 5 seconds

            // Clean up
            await root.dispose();
        }, 20000);

        test('should handle wide component trees', async () => {
            const childCount = 1000;

            const root = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    for (let i = 0; i < childCount; i++) {
                        const child = new Component('span', {
                            initializeComponent: (s: ComponentBase) => s.setText(`Child ${i}`)
                        });
                        sender.controls.add(child);
                    }
                }
            });

            const { duration } = await measurePerformance('Wide tree build', async () => {
                root.build();
                container.appendChild(root.element as Node);
                await nextTick();
            });

            expect(root.controls.items.length).toBe(childCount);
            expect(duration).toBeLessThan(3000 * SLACK);

            await root.dispose();
        }, 10000);

        test('should handle mixed deep and wide trees', async () => {
            const breadth = 10;
            const depth = 5;

            const createMixedTree = (level: number): ComponentBase => {
                const comp = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.class.add(`level-${level}`);
                        if (level < depth) {
                            for (let i = 0; i < breadth; i++) {
                                sender.controls.add(createMixedTree(level + 1));
                            }
                        }
                    }
                });
                return comp;
            };

            const root = createMixedTree(0);

            const { duration } = await measurePerformance('Mixed tree build', async () => {
                root.build();
                container.appendChild(root.element as Node);
                await nextTick();
            });

            expect(root.isBuilt).toBe(true);
            expect(duration).toBeLessThan(5000 * SLACK);

            await root.dispose();
        }, 20000);
    });

    describe('Rapid Component Creation and Disposal', () => {
        test('should handle rapid component creation', async () => {
            const count = 500;
            const components: ComponentBase[] = [];

            const { duration } = await measurePerformance('Rapid creation', async () => {
                for (let i = 0; i < count; i++) {
                    const comp = new Component('div', {
                        initializeComponent: (sender: ComponentBase) => sender.setText(`Component ${i}`)
                    });
                    comp.build();
                    components.push(comp);
                }
                await nextTick();
            });

            expect(components.length).toBe(count);
            expect(duration).toBeLessThan(2000 * SLACK);

            // Clean up
            for (const comp of components) {
                await comp.dispose();
            }
        }, 10000);

        test('should handle rapid disposal', async () => {
            const count = 500;
            const components: ComponentBase[] = [];

            for (let i = 0; i < count; i++) {
                const comp = new Component('div');
                comp.build();
                container.appendChild(comp.element as Node);
                components.push(comp);
            }

            await nextTick();

            const { duration } = await measurePerformance('Rapid disposal', async () => {
                const promises = components.map(c => c.dispose());
                await Promise.all(promises);
            });

            expect(components.every(c => c.isDisposed)).toBe(true);
            expect(duration).toBeLessThan(3000 * SLACK);
        }, 10000);

        test('should handle creation-disposal cycles', async () => {
            const cycles = 100;
            const componentsPerCycle = 10;

            for (let cycle = 0; cycle < cycles; cycle++) {
                const components: ComponentBase[] = [];

                for (let i = 0; i < componentsPerCycle; i++) {
                    const comp = new Component('div', {
                        initializeComponent: (sender: ComponentBase) => sender.setText(`Cycle ${cycle} - ${i}`)
                    });
                    comp.build();
                    components.push(comp);
                }

                await nextTick();

                for (const comp of components) {
                    await comp.dispose();
                }
            }

            // Test completed without crashing
            expect(true).toBe(true);
        }, 15000);
    });

    describe('Heavy Binding Load', () => {
        test('should handle many reactive bindings', async () => {
            const count = 200;
            const data = reactive({ value: 0 });
            const components: ComponentBase[] = [];

            for (let i = 0; i < count; i++) {
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

            const { duration } = await measurePerformance('Mass binding update', async () => {
                for (let i = 0; i < 10; i++) {
                    data.value = i;
                    await nextTick();
                }
            });

            expect(duration).toBeLessThan(2000 * SLACK);

            for (const comp of components) {
                await comp.dispose();
            }
        }, 15000);

        test('should handle rapid binding updates', async () => {
            const data = reactive({ counter: 0 });
            const updateCount = 1000;

            const comp = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => `Counter: ${data.counter}`);
                }
            });

            comp.build();
            container.appendChild(comp.element as Node);
            await nextTick();

            const { duration } = await measurePerformance('Rapid updates', async () => {
                for (let i = 0; i < updateCount; i++) {
                    data.counter = i;
                    if (i % 10 === 0) await nextTick();
                }
                await nextTick();
            });

            expect(duration).toBeLessThan(3000 * SLACK);
            await comp.dispose();
        }, 10000);
    });

    describe('Visibility Toggle Stress', () => {
        test('should handle rapid show/hide cycles', async () => {
            const cycles = 100;
            
            const { root, child: comp } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => sender.setText('Toggle me')
            }));
            container.appendChild(root.element as Node);
            await nextTick();

            const { duration } = await measurePerformance('Visibility toggle', async () => {
                for (let i = 0; i < cycles; i++) {
                    await comp.motif.hide();
                    await comp.motif.show();
                }
            });

            expect(comp.isVisible).toBe(true);
            expect(comp.isDisposed).toBe(false);
            expect(duration).toBeLessThan(5000 * SLACK);

            await comp.dispose();
        }, 20000);

        test('should handle visibility with many children', async () => {
            const childCount = 100;

            const parent = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    for (let i = 0; i < childCount; i++) {
                        const child = new Component('span', {
                            initializeComponent: (s: ComponentBase) => s.setText(`Child ${i}`)
                        });
                        sender.controls.add(child);
                    }
                }
            });

            const { root } = wrapInRoot(() => parent as any);
            container.appendChild(root.element as Node);
            await nextTick();

            const { duration } = await measurePerformance('Parent visibility toggle', async () => {
                await parent.motif.hide();
                await parent.motif.show();
                await parent.motif.hide();
                await parent.motif.show();
            });

            expect(duration).toBeLessThan(2000 * SLACK);
            await parent.dispose();
        }, 10000);
    });

    describe('Memory Management', () => {
        test('should not leak memory with repeated creation/disposal', async () => {
            const memoryBefore = measureMemory();
            const iterations = 50;

            for (let i = 0; i < iterations; i++) {
                const components: ComponentBase[] = [];
                
                for (let j = 0; j < 20; j++) {
                    const comp = new Component('div', {
                        initializeComponent: (sender: ComponentBase) => {
                            sender.bindings.text(() => `Component ${j}`);
                        }
                    });
                    comp.build();
                    components.push(comp);
                }

                await nextTick();

                for (const comp of components) {
                    await comp.dispose();
                }

                await nextTick();
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                await wait(100);
            }

            const memoryAfter = measureMemory();
            
            if (memoryBefore > 0 && memoryAfter > 0) {
                const memoryIncrease = memoryAfter - memoryBefore;
                const increaseMB = memoryIncrease / 1024 / 1024;
                
                console.log(`Memory increase: ${increaseMB.toFixed(2)}MB`);
                
                // Memory increase should be reasonable
                expect(increaseMB).toBeLessThan(50);
            }
        }, 30000);
    });

    describe('Event Handler Stress', () => {
        test('should handle many event listeners', async () => {
            const count = 200;
            const components: ComponentBase[] = [];
            let clickCount = 0;

            for (let i = 0; i < count; i++) {
                const comp = new Component('button', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.motif.on('click', () => clickCount++);
                    }
                });
                comp.build();
                container.appendChild(comp.element as Node);
                components.push(comp);
            }

            await nextTick();

            // Trigger clicks
            components.forEach(comp => {
                (comp.element as HTMLElement).click();
            });

            expect(clickCount).toBe(count);

            for (const comp of components) {
                await comp.dispose();
            }
        }, 10000);

        test('should handle event listener cleanup on disposal', async () => {
            const count = 100;
            const components: ComponentBase[] = [];

            for (let i = 0; i < count; i++) {
                const comp = new Component('button', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.motif.on('click', () => {});
                        sender.motif.on('mouseenter', () => {});
                        sender.motif.on('mouseleave', () => {});
                    }
                });
                comp.build();
                components.push(comp);
            }

            await nextTick();

            for (const comp of components) {
                await comp.dispose();
            }

            expect(components.every(c => c.isDisposed)).toBe(true);
        }, 10000);
    });

    describe('Concurrent Operations', () => {
        test('should handle concurrent build operations', async () => {
            const count = 100;
            const components: ComponentBase[] = [];

            for (let i = 0; i < count; i++) {
                components.push(new Component('div', {
                    initializeComponent: (sender: ComponentBase) => sender.setText(`Concurrent ${i}`)
                }));
            }

            await Promise.all(components.map(c => {
                c.build();
                return nextTick();
            }));

            expect(components.every(c => c.isBuilt)).toBe(true);

            for (const comp of components) {
                await comp.dispose();
            }
        }, 10000);

        test('should handle concurrent state updates', async () => {
            const data = reactive({ value: 0 });
            const count = 50;
            const components: ComponentBase[] = [];

            for (let i = 0; i < count; i++) {
                const comp = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.bindings.text(() => `Value: ${data.value}`);
                    }
                });
                comp.build();
                components.push(comp);
            }

            await nextTick();

            // Concurrent updates
            await Promise.all(
                Array.from({ length: 10 }, (_, i) => {
                    return new Promise<void>(resolve => {
                        setTimeout(() => {
                            data.value = i;
                            resolve();
                        }, Math.random() * 100);
                    });
                })
            );

            await nextTick();
            await wait(200);

            for (const comp of components) {
                await comp.dispose();
            }
        }, 10000);
    });

    describe('Error Recovery', () => {
        test('should recover from errors in child components', async () => {
            const errorChild = new Component('div', {
                initializeComponent: () => {
                    throw new Error('Child initializeComponent error');
                }
            });

            const parent = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.controls.add(errorChild);
                    sender.controls.add(new Component('span', {
                        initializeComponent: (s: ComponentBase) => s.setText('Valid child')
                    }));
                }
            });

            expect(() => parent.build()).not.toThrow();
            await nextTick();

            expect(parent.isBuilt).toBe(true);
            await parent.dispose();
        });

        test('should handle disposal errors gracefully', async () => {
            const comp = new Component('div', {
                onDisposing: () => {
                    throw new Error('Disposal error');
                }
            });

            comp.build();
            
            // Should not throw
            await expect(comp.dispose()).resolves.not.toThrow();
            expect(comp.isDisposed).toBe(true);
        });
    });
});
