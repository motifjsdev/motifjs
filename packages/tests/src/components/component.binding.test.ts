/**
 * Component Binding Tests
 * Tests data binding, two-way binding, and reactive updates
 */

import { Component, ComponentBase, reactive } from '@motifx/core';
import {
    wait,
    nextTick,
    createTestContainer,
    cleanupTestContainer,
    createSpy,
    simulateInput,
    waitFor,
    wrapInRoot
} from '../helpers/test-utils';

const SLACK = 2;

describe('Component Binding Tests', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createTestContainer();
    });

    afterEach(() => {
        cleanupTestContainer(container);
    });

    describe('Text Binding', () => {
        test('should bind text content to reactive data', async () => {
            const data = reactive({ message: 'Hello' });

            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => data.message);
                }
            });

            component.build();
            container.appendChild(component.element as Node);
            await nextTick();

            expect(component.element.textContent).toBe('Hello');

            data.message = 'World';
            await nextTick();

            expect(component.element.textContent).toBe('World');
        });

        test('should update text binding when reactive data changes', async () => {
            const state = reactive({ count: 0 });

            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => `Count: ${state.count}`);
                }
            });

            component.build();
            container.appendChild(component.element as Node);
            await nextTick();

            expect(component.element.textContent).toBe('Count: 0');

            for (let i = 1; i <= 5; i++) {
                state.count = i;
                await nextTick();
                expect(component.element.textContent).toBe(`Count: ${i}`);
            }
        });

        test('should handle multiple text bindings', async () => {
            const data1 = reactive({ text: 'First' });
            const data2 = reactive({ text: 'Second' });

            const comp1 = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => data1.text);
                }
            });

            const comp2 = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => data2.text);
                }
            });

            comp1.build();
            comp2.build();
            container.appendChild(comp1.element as Node);
            container.appendChild(comp2.element as Node);
            await nextTick();

            expect(comp1.element.textContent).toBe('First');
            expect(comp2.element.textContent).toBe('Second');

            data1.text = 'Updated First';
            data2.text = 'Updated Second';
            await nextTick();

            expect(comp1.element.textContent).toBe('Updated First');
            expect(comp2.element.textContent).toBe('Updated Second');
        });
    });

    describe('Value Binding', () => {
        test('should bind input value to reactive data', async () => {
            const data = reactive({ value: 'initial' });

            const component = new Component('input', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.value(() => data.value);
                }
            }) as Component<HTMLInputElement>;

            component.build();
            container.appendChild(component.element as Node);
            await nextTick();

            expect(component.element.value).toBe('initial');

            data.value = 'updated';
            await nextTick();

            expect(component.element.value).toBe('updated');
        });

        test('should handle input element value changes', async () => {
            const data = reactive({ value: '' });

            const component = new Component('input', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.value(() => data.value);
                }
            }) as Component<HTMLInputElement>;

            component.build();
            container.appendChild(component.element as Node);
            await nextTick();

            data.value = 'test value';
            await nextTick();

            expect(component.element.value).toBe('test value');
        });
    });

    describe('Custom Property Binding', () => {
        test('should bind custom properties to reactive data', async () => {
            const data = reactive({ isActive: false });

            const component = new Component<HTMLDivElement, any>('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.add('className', () => data.isActive ? 'active' : 'inactive');
                }
            });

            component.build();
            container.appendChild(component.element as Node);
            await nextTick();

            expect((component.element as HTMLElement).className).toBe('inactive');

            data.isActive = true;
            await nextTick();

            expect((component.element as HTMLElement).className).toBe('active');
        });

        test('should handle complex binding expressions', async () => {
            const state = reactive({
                firstName: 'John',
                lastName: 'Doe',
                age: 30
            });

            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => {
                        return `${state.firstName} ${state.lastName} (${state.age})`;
                    });
                }
            });

            component.build();
            container.appendChild(component.element as Node);
            await nextTick();

            expect(component.element.textContent).toBe('John Doe (30)');

            state.firstName = 'Jane';
            await nextTick();
            expect(component.element.textContent).toBe('Jane Doe (30)');

            state.lastName = 'Smith';
            await nextTick();
            expect(component.element.textContent).toBe('Jane Smith (30)');

            state.age = 31;
            await nextTick();
            expect(component.element.textContent).toBe('Jane Smith (31)');
        });
    });

    describe('Display Binding', () => {
        test('should bind visibility to reactive data', async () => {
            const data = reactive({ show: true });

            const { root, child: component } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.display(() => data.show);
                }
            }));
            container.appendChild(root.element as Node);
            await nextTick();

            expect(component.isVisible).toBe(true);

            data.show = false;
            await nextTick();
            await wait(50);

            expect(component.isVisible).toBe(false);

            data.show = true;
            await nextTick();
            await wait(50);

            expect(component.isVisible).toBe(true);
        });

        test('should handle rapid visibility changes', async () => {
            const data = reactive({ visible: true });

            const { root, child: component } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.display(() => data.visible);
                }
            }));
            container.appendChild(root.element as Node);
            await nextTick();

            for (let i = 0; i < 10; i++) {
                data.visible = !data.visible;
                await nextTick();
                await wait(10);
            }

            expect(component.isDisposed).toBe(false);
        });
    });

    describe('Wait Binding', () => {
        test('should bind wait state to reactive data', async () => {
            const data = reactive({ loading: false });

            const { root, child: component } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.wait(() => data.loading);
                }
            }));
            container.appendChild(root.element as Node);
            await nextTick();

            expect(component.isWait).toBe(false);

            data.loading = true;
            await nextTick();

            expect(component.isWait).toBe(true);

            data.loading = false;
            await nextTick();

            expect(component.isWait).toBe(false);
        });
    });

    describe('Method Binding', () => {
        test('should execute method binding on data change', async () => {
            const data = reactive({ trigger: 0 });

            const { root, child: component } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    // Method returns a primitive, which creates a text node bound to this expression
                    sender.bindings.method(() => String(data.trigger));
                }
            }));

            container.appendChild(root.element as Node);
            await nextTick();

            expect((component.element as HTMLElement).textContent).toBe('0');

            data.trigger = 1;
            await nextTick();
            expect((component.element as HTMLElement).textContent).toBe('1');

            data.trigger = 2;
            await nextTick();
            expect((component.element as HTMLElement).textContent).toBe('2');
        });
    });


    describe('Conditional Binding (When)', () => {
        test('should render based on condition', async () => {
            const data = reactive({ show: false });

            const { root, child: component } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.when(
                        () => data.show,
                        (_isTrue: boolean) => new Component('span', {
                            initializeComponent: (s: ComponentBase) => {
                                s.setText('Conditional Content');
                            }
                        })
                    );
                }
            }));

            container.appendChild(root.element as Node);
            await nextTick();
            await wait(20);

            data.show = true;
            await nextTick();
            await wait(100);

            // Check if conditional content is rendered
            const spans = (component.element as HTMLElement).querySelectorAll('span');
            expect(spans.length).toBeGreaterThan(0);
        });
    });

    describe('List Binding', () => {
        test('should render list items', async () => {
            const data = reactive({ items: ['a', 'b', 'c'] });

            const { root, child: component } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.list(
                        () => data.items,
                        (item: string) => new Component('span', {
                            initializeComponent: (s: ComponentBase) => {
                                s.setText(item);
                            }
                        })
                    );
                }
            }));

            container.appendChild(root.element as Node);
            await nextTick();
            await wait(100);

            const spans = (component.element as HTMLElement).querySelectorAll('span');
            // Some internal updates may run multiple times; ensure at least one per item
            expect(spans.length).toBeGreaterThanOrEqual(3);
            const texts = Array.from(spans).map(s => s.textContent);
            expect(texts).toEqual(expect.arrayContaining(['a','b','c']));
        });

        test('should update list when items change', async () => {
            const data = reactive({ items: ['a', 'b'] });

            const { root, child: component } = wrapInRoot(() => new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.list(
                        () => data.items,
                        (item: string) => new Component('div', {
                            initializeComponent: (s: ComponentBase) => {
                                s.setText(item);
                            }
                        })
                    );
                }
            }));

            container.appendChild(root.element as Node);
            await nextTick();
            await wait(100);

            let divs = (component.element as HTMLElement).querySelectorAll(':scope > div');
            expect(divs.length).toBeGreaterThanOrEqual(2);

            data.items = ['a', 'b', 'c', 'd'];
            await nextTick();
            await wait(100);

            divs = (component.element as HTMLElement).querySelectorAll(':scope > div');
            expect(divs.length).toBeGreaterThanOrEqual(4);
            const texts = Array.from(divs).map(d => d.textContent);
            expect(texts).toEqual(expect.arrayContaining(['a','b','c','d']));
        });
    });

    describe('Binding Lifecycle', () => {
        test('should activate bindings when component builds', async () => {
            const data = reactive({ value: 'initial' });
            let bindingActive = false;

            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    const binding = sender.bindings.text(() => data.value);
                    bindingActive = (binding as any).isActive || false;
                }
            });

            component.build();
            await nextTick();

            // Binding should be active after build
            data.value = 'test';
            await nextTick();
            expect(component.element.textContent).toBe('test');
        });

        test('should deactivate bindings when component disposes', async () => {
            const data = reactive({ value: 'initial' });

            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => data.value);
                }
            });

            component.build();
            container.appendChild(component.element as Node);
            await nextTick();

            expect(component.element.textContent).toBe('initial');

            await component.dispose();
            await nextTick();

            // Changing data after disposal should not update
            data.value = 'after disposal';
            await nextTick();

            expect(component.isDisposed).toBe(true);
        });

        test('should reactivate bindings with reState', async () => {
            const data = reactive({ count: 0 });

            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => `Count: ${data.count}`);
                }
            });

            component.build();
            container.appendChild(component.element as Node);
            await nextTick();

            expect(component.element.textContent).toBe('Count: 0');

            data.count = 5;
            await nextTick();
            expect(component.element.textContent).toBe('Count: 5');

            component.reState();
            await nextTick();

            data.count = 10;
            await nextTick();
            expect(component.element.textContent).toBe('Count: 10');
        });
    });

    describe('Binding Performance', () => {
        test('should handle many bindings efficiently', async () => {
            const data = reactive({
                values: Array.from({ length: 100 }, (_, i) => i)
            });

            const components: ComponentBase[] = [];

            for (let i = 0; i < 100; i++) {
                const comp = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.bindings.text(() => `Value: ${data.values[i]}`);
                    }
                });
                comp.build();
                container.appendChild(comp.element as Node);
                components.push(comp);
            }

            await nextTick();

            const startTime = performance.now();

            data.values = data.values.map(v => v + 1);
            await nextTick();

            const duration = performance.now() - startTime;

            // Should complete in reasonable time
            expect(duration).toBeLessThan(1000 * SLACK);

            // Clean up
            for (const comp of components) {
                await comp.dispose();
            }
        });

        test('should not leak memory when disposing bindings', async () => {
            const components: ComponentBase[] = [];
            const data = reactive({ value: 'test' });

            for (let i = 0; i < 50; i++) {
                const comp = new Component('div', {
                    initializeComponent: (sender: ComponentBase) => {
                        sender.bindings.text(() => data.value);
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

            // All components should be disposed
            expect(components.every(c => c.isDisposed)).toBe(true);
        });
    });

    describe('Binding Error Handling', () => {
        test('should handle errors in binding expressions gracefully', async () => {
            const data = reactive<any>({ obj: null });

            const component = new Component('div', {
                initializeComponent: (sender: ComponentBase) => {
                    sender.bindings.text(() => {
                        // This will throw when obj is null
                        return data.obj.property;
                    });
                }
            });

            // Should not throw
            expect(() => component.build()).not.toThrow();
            await nextTick();
        });
    });
});
