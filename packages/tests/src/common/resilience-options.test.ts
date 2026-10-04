import { MotifError, Resilience, decorate } from '@motifx/core';
import type { BulkheadOptions, CircuitBreakerOptions, CircuitState, FallbackOptions, RateLimiterOptions, ResiliencePolicy, RetryOptions, TimeoutOptions } from '@motifx/core';

describe('Resilience options', () => {
    test('the option types are exported', async () => {
        const retry: RetryOptions = { retries: 1, backoff: 'none' };
        const timeout: TimeoutOptions = { timeoutMs: 50 };
        const breaker: CircuitBreakerOptions = { failureThreshold: 2, onStateChange: (_from: CircuitState, _to: CircuitState) => { } };
        const bulkhead: BulkheadOptions = { maxConcurrent: 1 };
        const limiter: RateLimiterOptions = { tokensPerInterval: 5 };
        const fallback: FallbackOptions<string> = { fallback: () => 'yedek' };
        const chain: ResiliencePolicy = Resilience.create.retry(retry).timeout(timeout).circuitBreaker(breaker).bulkhead(bulkhead).rateLimiter(limiter).fallback(fallback);
        await expect(chain.execute(async () => 'ok')).resolves.toBe('ok');
    });

    test('decorate accepts a Resilience chain', async () => {
        const chain = Resilience.create.retry({ retries: 2, backoff: 'none' });
        let calls = 0;
        const guarded = decorate(chain, async () => {
            calls++;
            if (calls < 3) throw new Error('x');
            return calls;
        });
        await expect(guarded()).resolves.toBe(3);
    });

    test('rateLimiter allows tokensPerInterval calls per interval out of the box', async () => {
        const chain = Resilience.create.rateLimiter({ tokensPerInterval: 2, intervalMs: 60_000 });
        await expect(chain.execute(async () => 1)).resolves.toBe(1);
        await expect(chain.execute(async () => 2)).resolves.toBe(2);
        let caught: unknown;
        try { await chain.execute(async () => 3); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(MotifError);
        expect((caught as MotifError).code).toBe('MJX604');
    });

    test('rateLimiter default is one call per second', async () => {
        const chain = Resilience.create.rateLimiter();
        await expect(chain.execute(async () => 'ilk')).resolves.toBe('ilk');
        await expect(chain.execute(async () => 'ikinci')).rejects.toMatchObject({ code: 'MJX604' });
    });

    test('an explicit capacity allows a burst', async () => {
        const chain = Resilience.create.rateLimiter({ tokensPerInterval: 1, intervalMs: 60_000, capacity: 3 });
        await expect(chain.execute(async () => 1)).resolves.toBe(1);
        await expect(chain.execute(async () => 2)).resolves.toBe(2);
        await expect(chain.execute(async () => 3)).resolves.toBe(3);
        await expect(chain.execute(async () => 4)).rejects.toMatchObject({ code: 'MJX604' });
    });
});
