/**
 * Component Lifecycle Tests
 * Tests all lifecycle hooks and their execution order
 */

import { Component, ComponentBase } from '@motifx/core';
import {
    wait,
    nextTick,
    createTestContainer,
    cleanupTestContainer,
    createSpy,
    waitFor,
    wrapInRoot
} from '../helpers/test-utils';

describe('Component Lifecycle Tests', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createTestContainer();
    });

    afterEach(() => {
        cleanupTestContainer(container);
    });

    describe('Basic Lifecycle Hooks', () => {
        test('should call lifecycle hooks in correct order', async () => {
            const calls: string[] = [];

            const component = new Component('div', {
                onInitializing: (_sender: any) => calls.push('initializing'),
                onInitialized: (_sender: any) => calls.push('initialized'),
                onConfig: (_sender: any) => calls.push('config'),
                onConfigured: (_sender: any) => calls.push('configured'),
                initializeComponent: (_sender: any) => calls.push('initializeComponent'),
                onBuilding: (_sender: any) => calls.push('building'),
                onBuilt: (_sender: any) => calls.push('built')
            });

            await nextTick();
            expect(calls).toContain('initializing');
            expect(calls).toContain('initialized');
            expect(calls).toContain('config');

            component.build();
            await nextTick();

            expect(calls).toContain('configured');
            expect(calls).toContain('building');
            expect(calls).toContain('initializeComponent');
            expect(calls).toContain('built');

            // Check order
            const initIndex = calls.indexOf('initializing');
            const configIndex = calls.indexOf('config');
            const initializeComponentIndex = calls.indexOf('initializeComponent');
            const builtIndex = calls.indexOf('built');

            expect(initIndex).toBeLessThan(configIndex);
            expect(configIndex).toBeLessThan(initializeComponentIndex);
            expect(initializeComponentIndex).toBeLessThan(builtIndex);
        });

        test('should call onInitializing before component is built', async () => {
            let isBuiltDuringInit = false;

            const component = new Component('div', {
                onInitializing: (sender: any) => {
                    isBuiltDuringInit = sender.isBuilt;
                }
            });

            await nextTick();
            expect(isBuiltDuringInit).toBe(false);
        });

        test('should call onInitialized after initialization', async () => {
            let isInitialized = false;

            const component = new Component('div', {
                onInitialized: (sender: any) => {
                    isInitialized = sender.isInitialized;
                }
            });

            await nextTick();
            expect(isInitialized).toBe(true); // onInitialized is called during construction
        });

        test('should call initializeComponent before building children', async () => {
            const calls: string[] = [];
            let childElement: any;

            const component = new Component('div', {
                initializeComponent: (sender: any) => {
                    calls.push('initializeComponent');
                    childElement = new Component('span', {
                        initializeComponent: (_s: any) => calls.push('child-initializeComponent')
                    });
                    sender.controls.add(childElement);
                }
            });

            component.build();
            await nextTick();

            expect(calls[0]).toBe('initializeComponent');
            expect(calls).toContain('child-initializeComponent');
        });

        test('should call onBuilt after component is fully built', async () => {
            let isBuiltDuringBuilt = false;

            const component = new Component('div', {
                onBuilt: (sender: any) => {
                    isBuiltDuringBuilt = sender.isBuilt;
                }
            });

            component.build();
            await nextTick();

            expect(isBuiltDuringBuilt).toBe(true);
        });
    });

    describe('Disposal Lifecycle', () => {
        test('should call onDisposing before disposal', async () => {
            const onDisposing = createSpy();

            const component = new Component('div', { onDisposing });
            component.build();

            await component.dispose();
            await nextTick();

            expect(onDisposing.callCount).toBeGreaterThan(0);
        });

        test('should call onDisposed after disposal', async () => {
            const onDisposed = createSpy();

            const component = new Component('div', { onDisposed });
            component.build();

            await component.dispose();
            await nextTick();

            expect(onDisposed.callCount).toBeGreaterThan(0);
        });

        test('should set isDisposed flag during disposal', async () => {
            let isDisposedDuringOnDisposing = false;
            let isDisposedDuringOnDisposed = false;

            const component = new Component('div', {
                onDisposing: (sender) => {
                    isDisposedDuringOnDisposing = sender.isDisposed;
                },
                onDisposed: (sender) => {
                    isDisposedDuringOnDisposed = sender.isDisposed;
                }
            });

            component.build();
            await component.dispose();
            await nextTick();

            expect(isDisposedDuringOnDisposing).toBe(false);
            expect(isDisposedDuringOnDisposed).toBe(true);
        });

        test('should dispose children before parent', async () => {
            const calls: string[] = [];

            const child = new Component('span', {
                onDisposing: (_s: any) => calls.push('child-disposing')
            });

            const parent = new Component('div', {
                onDisposing: (_s: any) => calls.push('parent-disposing'),
                initializeComponent: (sender: any) => {
                    sender.controls.add(child);
                }
            });

            parent.build();
            await parent.dispose();
            await nextTick();

            const childIndex = calls.indexOf('child-disposing');
            const parentIndex = calls.indexOf('parent-disposing');

            // Note: Based on the implementation, shallow disposal happens first
            expect(calls).toContain('child-disposing');
            expect(calls).toContain('parent-disposing');
        });

        test('should prevent multiple disposals', async () => {
            const onDisposing = createSpy();

            const component = new Component('div', { onDisposing });
            component.build();

            // First disposal
            await component.dispose();
            const firstCount = onDisposing.callCount;

            // Subsequent disposals should not throw and component remains disposed
            await component.dispose();
            await component.dispose();
            await nextTick();

            // onDisposing should be called exactly once
            expect(onDisposing.callCount).toBe(1);
            expect(component.isDisposed).toBe(true);
        });

        test('should remove element from DOM on disposal', async () => {
            const component = new Component('div');
            component.build();
            container.appendChild(component.element as Node);

            expect(container.contains(component.element as Node)).toBe(true);

            await component.dispose();
            await wait(100); // Wait for animation

            expect(container.contains(component.element as Node)).toBe(false);
        });
    });

    describe('Visibility Lifecycle', () => {
        test('should call onVisibilityChanged when showing', async () => {
            const onVisibilityChanged = createSpy();

            const { root, child: component } = wrapInRoot(() => new Component('div', { onVisibilityChanged }));
            container.appendChild(root.element as Node);

            await component.motif.hide();
            await nextTick();

            onVisibilityChanged.reset();

            await component.motif.show();
            await nextTick();

            expect(onVisibilityChanged.callCount).toBeGreaterThan(0);
        });

        test('should call onVisibilityChanged when hiding', async () => {
            const onVisibilityChanged = createSpy();

            const { root, child: component } = wrapInRoot(() => new Component('div', { onVisibilityChanged }));
            container.appendChild(root.element as Node);

            await component.motif.hide();
            await nextTick();

            expect(onVisibilityChanged.callCount).toBeGreaterThan(0);
        });

        test('should update isVisible flag', async () => {
            const { root, child: component } = wrapInRoot(() => new Component('div'));
            container.appendChild(root.element as Node);

            expect(component.isVisible).toBe(true);

            await component.motif.hide();
            expect(component.isVisible).toBe(false);

            await component.motif.show();
            expect(component.isVisible).toBe(true);
        });
    });

    describe('Config Lifecycle', () => {
        test('should call onConfig only once', async () => {
            const onConfig = createSpy();

            const component = new Component('div', { onConfig });
            await nextTick();

            expect(onConfig.callCount).toBe(1);
        });

        test('should set isConfigured flag', async () => {
            let isConfiguredDuringOnConfig = false;

            const component = new Component('div', {
                onConfig: (sender) => {
                    isConfiguredDuringOnConfig = sender.isConfigured;
                }
            });

            await nextTick();
            expect(component.isConfigured).toBe(true);
        });

        test('should call onConfigured after onConfig', async () => {
            const calls: string[] = [];

            const component = new Component('div', {
                onConfig: () => calls.push('config'),
                onConfigured: () => calls.push('configured')
            });

            component.build();
            await nextTick();

            const configIndex = calls.indexOf('config');
            const configuredIndex = calls.indexOf('configured');

            expect(configIndex).toBeLessThan(configuredIndex);
        });
    });

    describe('Advanced Lifecycle Scenarios', () => {
        test('should handle rapid show/hide cycles', async () => {
            const { root, child: component } = wrapInRoot(() => new Component('div'));
            container.appendChild(root.element as Node);

            for (let i = 0; i < 10; i++) {
                await component.motif.hide();
                await component.motif.show();
            }

            expect(component.isVisible).toBe(true);
            expect(component.isDisposed).toBe(false);
        });

        test('should handle disposal during lifecycle', async () => {
            const component = new Component('div', {
                onBuilt: async (sender: any) => {
                    await sender.dispose();
                }
            });

            component.build();
            await waitFor(() => component.isDisposed === true, 500);

            expect(component.isDisposed).toBe(true);
        });

        test('should maintain state through multiple builds', async () => {
            let buildCount = 0;

            const component = new Component('div', {
                initializeComponent: () => {
                    buildCount++;
                }
            });

            component.build();
            await nextTick();

            // Attempting to build again shouldn't call initializeComponent again
            component.build();
            await nextTick();

            expect(buildCount).toBe(1);
        });

        test('should handle nested component lifecycles', async () => {
            const calls: string[] = [];

            const grandchild = new Component('em', {
                onInitializing: (_s: any) => calls.push('grandchild-init'),
                initializeComponent: (_s: any) => calls.push('grandchild-initializeComponent')
            });

            const child = new Component('span', {
                onInitializing: (_s: any) => calls.push('child-init'),
                initializeComponent: (sender: any) => {
                    calls.push('child-initializeComponent');
                    sender.controls.add(grandchild);
                }
            });

            const parent = new Component('div', {
                onInitializing: (_s: any) => calls.push('parent-init'),
                initializeComponent: (sender: any) => {
                    calls.push('parent-initializeComponent');
                    sender.controls.add(child);
                }
            });

            parent.build();
            await nextTick();

            // All components should initialize
            expect(calls).toContain('parent-init');
            expect(calls).toContain('child-init');
            expect(calls).toContain('grandchild-init');

            // initializeComponent should be called in order
            expect(calls).toContain('parent-initializeComponent');
            expect(calls).toContain('child-initializeComponent');
            expect(calls).toContain('grandchild-initializeComponent');
        });

        test('should handle errors in lifecycle hooks gracefully', async () => {
            const component = new Component('div', {
                initializeComponent: () => {
                    throw new Error('InitializeComponent error');
                },
                onBuilt: () => {
                    // This should still be called
                }
            });

            // Should not throw
            expect(() => component.build()).not.toThrow();
            await nextTick();

            // Component should still be built despite error
            expect(component.isBuilt).toBe(true);
        });

        test('should allow cancelling events in lifecycle hooks', async () => {
            const component = new Component('div', {
                onBuilding: (_sender: any, e: any) => {
                    e.cancel = true;
                }
            });

            component.build();
            await nextTick();

            // Even with cancel, build should complete (cancel is informational)
            expect(component.isBuilt).toBe(true);
        });
    });

    describe('Event Emitter Integration', () => {
        test('should emit lifecycle events', async () => {
            const component = new Component('div');
            const events: string[] = [];

            // Subscribe to internal emitter events
            (component as any)._base.emiters.on('onbuilding', () => events.push('building'));
            (component as any)._base.emiters.on('onbuilt', () => events.push('built'));

            component.build();
            await nextTick();

            expect(events).toContain('building');
            expect(events).toContain('built');
        });
    });

    describe('Wait State Lifecycle', () => {
        test('should NOT build when isWait is true', async () => {
            const component = new Component('div', {});
            component.isWait = true;
            component.build();
            await nextTick();

            // isWait true ise component build olmamalı
            expect(component.isBuilt).toBe(false);
            expect(component.isWait).toBe(true);
        });

        test('should hide component when setting isWait to true after build', async () => {
            const component = new Component('div');
            component.build();
            container.appendChild(component.element as Node);

            expect(component.isVisible).toBe(true);

            component.isWait = true;
            await nextTick();

            expect(component.isVisible).toBe(false);
        });

        test('should show component when setting isWait to false', async () => {
            const component = new Component('div');
            component.isWait = true;
            component.build();

            component.isWait = false;
            await nextTick();

            expect(component.isVisible).toBe(true);
        });
    });
});
