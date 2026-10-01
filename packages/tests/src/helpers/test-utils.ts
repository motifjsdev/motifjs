/**
 * Test Utility Functions for motifjs Component Testing
 * Provides helper functions for DOM manipulation, async operations, and component testing
 */

/**
 * Wait for a specified amount of time
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for next microtask (useful for reactive updates)
 */
export function nextTick(): Promise<void> {
    return Promise.resolve();
}

/**
 * Wait for next animation frame
 */
export function nextFrame(): Promise<void> {
    return new Promise(resolve => {
        const raf = (globalThis as any).requestAnimationFrame;
        if (typeof raf === 'function') {
            raf(() => resolve());
        } else {
            // Fallback for jsdom: approximate a frame with setTimeout
            setTimeout(() => resolve(), 16);
        }
    });
}

/**
 * Wait for multiple animation frames
 */
export async function waitFrames(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
        await nextFrame();
    }
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
    condition: () => boolean,
    timeout: number = 5000,
    interval: number = 50
): Promise<void> {
    const startTime = Date.now();
    while (!condition()) {
        if (Date.now() - startTime > timeout) {
            throw new Error(`Timeout waiting for condition after ${timeout}ms`);
        }
        await wait(interval);
    }
}

/**
 * Wait for an element to be in the DOM
 */
export async function waitForElement(
    selector: string,
    parent: Element | Document = document,
    timeout: number = 5000
): Promise<Element> {
    const startTime = Date.now();
    while (true) {
        const element = parent.querySelector(selector);
        if (element) return element;
        
        if (Date.now() - startTime > timeout) {
            throw new Error(`Timeout waiting for element "${selector}" after ${timeout}ms`);
        }
        await wait(50);
    }
}

/**
 * Create a test container and attach it to the document
 */
export function createTestContainer(id: string = 'test-container'): HTMLElement {
    const container = document.createElement('div');
    container.id = id;
    document.body.appendChild(container);
    return container;
}

/**
 * Clean up test container
 */
export function cleanupTestContainer(container: HTMLElement): void {
    if (container && container.parentNode) {
        container.parentNode.removeChild(container);
    }
}

// Safely wrap a component under a root component so that child.parent is set
// Useful to avoid library assumptions that rely on having a parent component (e.g., show/hide placeholder logic)
import type { ComponentBase } from '@motifx/core';
import { Component } from '@motifx/core';

export function wrapInRoot<T extends ComponentBase>(childFactory: () => T): { root: ComponentBase; child: T } {
    let child!: T;
    const root = new Component('div', {
        initializeComponent: (sender: ComponentBase) => {
            child = childFactory();
            sender.controls.add(child);
        }
    });
    root.build();
    return { root, child };
}

/**
 * Measure memory usage (if available)
 */
export function measureMemory(): number {
    if ((performance as any).memory) {
        return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
}

/**
 * Run performance measurement
 */
export async function measurePerformance<T>(
    name: string,
    fn: () => T | Promise<T>
): Promise<{ result: T; duration: number; memory?: number }> {
    const memoryBefore = measureMemory();
    const startTime = performance.now();
    
    const result = await fn();
    
    const duration = performance.now() - startTime;
    const memoryAfter = measureMemory();
    const memory = memoryAfter > 0 ? memoryAfter - memoryBefore : undefined;
    
    console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`, memory ? `Memory: ${(memory / 1024 / 1024).toFixed(2)}MB` : '');
    
    return { result, duration, memory };
}

/**
 * Options for series performance measurement
 */
export interface PerformanceSeriesOptions {
    warmup?: number;          // number of warm-up runs (not measured)
    repeats?: number;         // number of measured runs
    aggregate?: 'median' | 'mean'; // which aggregate to prefer as primary duration
    gc?: boolean;             // attempt a GC between runs if available
}

function computeStats(samples: number[]) {
    const sorted = [...samples].sort((a,b)=>a-b);
    const sum = samples.reduce((a,b)=>a+b,0);
    const mean = sum / samples.length;
    const mid = Math.floor(sorted.length/2);
    const median = sorted.length % 2 === 0 ? (sorted[mid-1] + sorted[mid]) / 2 : sorted[mid];
    const min = sorted[0];
    const max = sorted[sorted.length-1];
    const variance = samples.reduce((a,b)=>a + Math.pow(b-mean,2),0) / samples.length;
    const stdev = Math.sqrt(variance);
    return { mean, median, min, max, stdev };
}

/**
 * Measure a performance test with warm-up and repeated runs.
 * Returns aggregated statistics. The chosen aggregate is exposed as 'duration'.
 */
export async function measurePerformanceSeries<T>(
    name: string,
    fn: () => T | Promise<T>,
    options: PerformanceSeriesOptions = {}
): Promise<{
    result: T;
    duration: number;        // aggregate (median or mean)
    durations: number[];     // raw measured durations
    mean: number;
    median: number;
    min: number;
    max: number;
    stdev: number;
    memory?: number;
}> {
    const warmupEnv = parseInt(process.env.BENCH_WARMUP || '0', 10) || 0;
    const repeatsEnv = parseInt(process.env.BENCH_REPEATS || '1', 10) || 1;
    const warmup = Math.max(0, (options.warmup ?? warmupEnv));
    const repeats = Math.max(1, (options.repeats ?? repeatsEnv));
    const aggregate = options.aggregate ?? 'median';

    // Warm-up runs (not measured)
    for (let i = 0; i < warmup; i++) {
        await fn();
    }

    const durations: number[] = [];
    let lastResult!: T;
    let memoryDelta: number | undefined;

    for (let i = 0; i < repeats; i++) {
        if (options.gc && (globalThis as any).gc) {
            try { (globalThis as any).gc(); } catch {}
        }
        const memoryBefore = measureMemory();
        const start = performance.now();
        lastResult = await fn();
        const singleDuration = performance.now() - start;
        durations.push(singleDuration);
        const memoryAfter = measureMemory();
        const delta = memoryAfter > 0 ? memoryAfter - memoryBefore : undefined;
        if (typeof delta === 'number') {
            memoryDelta = (memoryDelta ?? 0) + delta;
        }
    }

    const stats = computeStats(durations);
    const chosen = aggregate === 'median' ? stats.median : stats.mean;
    const avgMemory = typeof memoryDelta === 'number' ? memoryDelta / repeats : undefined;

    console.log(`[Performance Series] ${name}: repeats=${repeats} warmup=${warmup} ${aggregate}=${chosen.toFixed(2)}ms mean=${stats.mean.toFixed(2)}ms median=${stats.median.toFixed(2)}ms min=${stats.min.toFixed(2)}ms max=${stats.max.toFixed(2)}ms stdev=${stats.stdev.toFixed(2)}ms`);

    return {
        result: lastResult,
        duration: chosen,
        durations,
        mean: stats.mean,
        median: stats.median,
        min: stats.min,
        max: stats.max,
        stdev: stats.stdev,
        memory: avgMemory
    };
}

/**
 * Create a spy function that tracks calls
 */
export function createSpy<T extends (...args: any[]) => any>(): T & {
    calls: { args: any[]; result?: any; error?: any }[];
    callCount: number;
    reset: () => void;
} {
    const calls: { args: any[]; result?: any; error?: any }[] = [];
    
    const spy: any = function(this: any, ...args: any[]) {
        const call: any = { args };
        try {
            const result = undefined;
            call.result = result;
            calls.push(call);
            return result;
        } catch (error) {
            call.error = error;
            calls.push(call);
            throw error;
        }
    };
    
    Object.defineProperty(spy, 'calls', {
        get() { return calls; }
    });
    
    Object.defineProperty(spy, 'callCount', {
        get() { return calls.length; }
    });
    
    spy.reset = () => {
        calls.length = 0;
    };
    
    return spy;
}

/**
 * Run a function and collect all thrown errors
 */
export async function collectErrors(fn: () => void | Promise<void>): Promise<Error[]> {
    const errors: Error[] = [];
    const originalError = console.error;
    
    console.error = (...args: any[]) => {
        if (args[0] instanceof Error) {
            errors.push(args[0]);
        }
    };
    
    try {
        await fn();
    } finally {
        console.error = originalError;
    }
    
    return errors;
}

/**
 * Check if element is visible in DOM
 */
export function isVisible(element: Element): boolean {
    if (!element || !element.parentElement) return false;
    
    const style = window.getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    
    return true;
}

/**
 * Get all text content from element and children
 */
export function getTextContent(element: Element): string {
    return element.textContent?.trim() || '';
}

/**
 * Trigger a custom event on an element
 */
export function triggerEvent(element: Element, eventType: string, options: EventInit = {}): void {
    const event = new Event(eventType, { bubbles: true, cancelable: true, ...options });
    element.dispatchEvent(event);
}

/**
 * Simulate user input
 */
export function simulateInput(element: HTMLInputElement, value: string): void {
    element.value = value;
    triggerEvent(element, 'input');
    triggerEvent(element, 'change');
}
