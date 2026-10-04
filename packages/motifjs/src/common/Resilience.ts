import { MotifError, formatMotifMessage, motifError } from "./diagnostics";

type AsyncOrSync<T> = Promise<T> | T;

export interface ResilienceContext {
    [key: string]: any;
}

type Context = ResilienceContext;

export type ResilienceAction<T> = (ctx?: ResilienceContext) => AsyncOrSync<T>;

type Action<T> = ResilienceAction<T>;

type ShouldHandlePredicate = (err: any) => boolean;

export interface ResiliencePolicy {
    execute<T>(action: ResilienceAction<T>, ctx?: ResilienceContext): Promise<T>;
}

function isTimeoutError(err: any) {
    return err && err.name === 'TimeoutError';
}

class TimeoutError extends MotifError {
    constructor() {
        super('MJX605', formatMotifMessage('MJX605'));
        this.name = 'TimeoutError';
    }
}

function delay(ms: number) {
    return new Promise<void>(res => setTimeout(res, ms));
}

function addJitter(base: number, jitterFactor = 0.1) {
    const jitter = (Math.random() * 2 - 1) * jitterFactor * base;
    return Math.max(0, Math.floor(base + jitter));
}


abstract class Policy implements ResiliencePolicy {
    abstract execute<T>(action: Action<T>, ctx?: Context): Promise<T>;
}


export interface RetryOptions {
    retries?: number;
    backoff?: 'fixed' | 'exponential' | 'none';
    delay?: number;
    jitter?: number;
    shouldHandle?: ShouldHandlePredicate;
    onRetry?: (attempt: number, err: any, delayMs: number, ctx?: Context) => void | Promise<void>;
}

class RetryPolicy extends Policy {
    private retries: number;
    private backoff: 'fixed' | 'exponential' | 'none';
    private delayMs: number;
    private jitter: number;
    private shouldHandle: ShouldHandlePredicate;
    private onRetry?: (attempt: number, err: any, delayMs: number, ctx?: Context) => void | Promise<void>;

    constructor(options: RetryOptions = {}) {
        super();
        this.retries = options.retries ?? 3;
        this.backoff = options.backoff ?? 'exponential';
        this.delayMs = options.delay ?? 100;
        this.jitter = Math.min(Math.max(options.jitter ?? 0.1, 0), 1);
        this.shouldHandle = options.shouldHandle ?? ((err) => !!err && !isTimeoutError(err));
        this.onRetry = options.onRetry;
    }

    private calcDelay(attempt: number) {
        if (this.backoff === 'none') return 0;
        if (this.backoff === 'fixed') return addJitter(this.delayMs, this.jitter);
        const base = this.delayMs * Math.pow(2, attempt - 1);
        return addJitter(base, this.jitter);
    }

    async execute<T>(action: Action<T>, ctx?: Context): Promise<T> {
        let lastErr: any;

        for (let attempt = 1; attempt <= this.retries + 1; attempt++) {
            try {
                return await Promise.resolve(action(ctx));
            } catch (err) {
                lastErr = err;
                if (!this.shouldHandle(err) || attempt > this.retries) break;
                const wait = this.calcDelay(attempt);
                if (this.onRetry) await this.onRetry(attempt, err, wait, ctx);
                if (wait > 0) await delay(wait);
            }
        }

        throw lastErr;
    }
}


export interface TimeoutOptions {
    timeoutMs: number;
}

class TimeoutPolicy extends Policy {
    private timeoutMs: number;

    constructor(opts: TimeoutOptions) {
        super();
        this.timeoutMs = opts.timeoutMs;
    }

    async execute<T>(action: Action<T>, ctx?: Context): Promise<T> {
        let timer: any;
        const p = Promise.resolve(action(ctx));
        const t = new Promise<never>((_, rej) => {
            timer = setTimeout(() => rej(new TimeoutError()), this.timeoutMs);
        });

        try {
            return await Promise.race([p, t]);
        } finally {
            clearTimeout(timer);
        }
    }
}


export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
    failureThreshold?: number;
    successThreshold?: number;
    durationOfBreakMs?: number;
    shouldHandle?: ShouldHandlePredicate;
    onStateChange?: (oldState: CircuitState, newState: CircuitState) => void | Promise<void>;
}

class CircuitBreakerPolicy extends Policy {
    private failureThreshold: number;
    private successThreshold: number;
    private durationOfBreakMs: number;
    private shouldHandle: ShouldHandlePredicate;
    private onStateChange?: (oldState: CircuitState, newState: CircuitState) => void | Promise<void>;

    private state: CircuitState = 'CLOSED';
    private failureCount = 0;
    private successCount = 0;
    private nextAttemptTime = 0; 

    constructor(opts: CircuitBreakerOptions = {}) {
        super();
        this.failureThreshold = opts.failureThreshold ?? 5;
        this.successThreshold = opts.successThreshold ?? 2;
        this.durationOfBreakMs = opts.durationOfBreakMs ?? 60000; 
        this.shouldHandle = opts.shouldHandle ?? ((err) => !!err && !isTimeoutError(err));
        this.onStateChange = opts.onStateChange;
    }

    private async changeState(newState: CircuitState) {
        const old = this.state;
        this.state = newState;
        this.failureCount = 0;
        this.successCount = 0;
        if (newState === 'OPEN') this.nextAttemptTime = Date.now() + this.durationOfBreakMs;
        if (this.onStateChange) await this.onStateChange(old, newState);
    }

    async execute<T>(action: Action<T>, ctx?: Context): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() >= this.nextAttemptTime) {
                await this.changeState('HALF_OPEN');
            } else {
                throw motifError('MJX602');
            }
        }

        try {
            const result = await Promise.resolve(action(ctx));
            if (this.state === 'HALF_OPEN') {
                this.successCount++;
                if (this.successCount >= this.successThreshold) await this.changeState('CLOSED');
            } else if (this.state === 'CLOSED') {
                this.failureCount = 0;
            }
            return result;
        } catch (err) {
            if (this.shouldHandle(err)) {
                this.failureCount++;
                if (this.state === 'HALF_OPEN' || (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold)) {
                    await this.changeState('OPEN');
                }
            }
            throw err;
        }
    }

    getState() {
        return this.state;
    }
}


export interface BulkheadOptions {
    maxConcurrent?: number;
    maxQueue?: number;
}

class BulkheadPolicy extends Policy {
    private maxConcurrent: number;
    private maxQueue: number;
    private active = 0;
    private queue: Array<() => void> = [];

    constructor(opts: BulkheadOptions = {}) {
        super();
        this.maxConcurrent = opts.maxConcurrent ?? 10;
        this.maxQueue = opts.maxQueue ?? 50;
    }

    private dequeue() {
        if (this.queue.length === 0) return;
        if (this.active >= this.maxConcurrent) return;
        const resolver = this.queue.shift()!;
        resolver();
    }

    async execute<T>(action: Action<T>, ctx?: Context): Promise<T> {
        if (this.active >= this.maxConcurrent) {
            if (this.queue.length >= this.maxQueue) {
                throw motifError('MJX603');
            }
            await new Promise<void>((res) => {
                this.queue.push(res);
            });
        }

        this.active++;
        try {
            const result = await Promise.resolve(action(ctx));
            return result;
        } finally {
            this.active--;
            this.dequeue();
        }
    }
}


export interface RateLimiterOptions {
    tokensPerInterval?: number;
    intervalMs?: number;
    capacity?: number;
}

class RateLimiterPolicy extends Policy {
    private tokensPerInterval: number;
    private intervalMs: number;
    private capacity: number;
    private tokens: number;
    private lastRefill: number;

    constructor(opts: RateLimiterOptions = {}) {
        super();
        this.tokensPerInterval = opts.tokensPerInterval ?? 1;
        this.intervalMs = opts.intervalMs ?? 1000;
        this.capacity = opts.capacity ?? this.tokensPerInterval;
        this.tokens = this.capacity;
        this.lastRefill = Date.now();
    }

    private refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        if (elapsed <= 0) return;
        const tokensToAdd = Math.floor(elapsed / this.intervalMs) * this.tokensPerInterval;
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    async execute<T>(action: Action<T>, ctx?: Context): Promise<T> {
        this.refill();
        if (this.tokens <= 0) {
            throw motifError('MJX604');
        }
        this.tokens -= 1;
        return Promise.resolve(action(ctx));
    }
}


export interface FallbackOptions<T> {
    fallback: (err: any, ctx?: Context) => AsyncOrSync<T>;
    shouldHandle?: ShouldHandlePredicate;
}

class FallbackPolicy<T> extends Policy {
    private fallback: (err: any, ctx?: Context) => AsyncOrSync<T>;
    private shouldHandle: ShouldHandlePredicate;

    constructor(opts: FallbackOptions<T>) {
        super();
        this.fallback = opts.fallback;
        this.shouldHandle = opts.shouldHandle ?? (() => true);
    }

    async execute<T>(action: Action<T>, ctx?: Context): Promise<T> {

        try {
            return await Promise.resolve(action(ctx)) as T;
        } catch (err) {
            if (!this.shouldHandle(err)) throw err;
            return await Promise.resolve(this.fallback(err, ctx)) as unknown as T;
        }

    }
}

class PolicyWrap extends Policy {
    private policies: Policy[];

    constructor(...policies: Policy[]) {
        super();
        this.policies = policies;
    }

    async execute<T>(action: Action<T>, ctx?: Context): Promise<T> {
        const wrapped = this.policies.reduceRight((next: Action<T>, p: Policy) => {
            return (c?: Context) => p.execute(() => next(c), c);
        }, action);

        return wrapped(ctx);
    }
}


const resilience = {
    retry: (opts?: RetryOptions) => new RetryPolicy(opts),
    timeout: (opts: TimeoutOptions) => new TimeoutPolicy(opts),
    circuitBreaker: (opts?: CircuitBreakerOptions) => new CircuitBreakerPolicy(opts),
    bulkhead: (opts?: BulkheadOptions) => new BulkheadPolicy(opts),
    rateLimiter: (opts?: RateLimiterOptions) => new RateLimiterPolicy(opts),
    fallback: <T>(opts: FallbackOptions<T>) => new FallbackPolicy<T>(opts),
    wrap: (...policies: Policy[]) => new PolicyWrap(...policies),
};


export function decorate<T>(policy: ResiliencePolicy, fn: ResilienceAction<T>) {
    return (ctx?: ResilienceContext) => policy.execute(fn, ctx);
}

export class Resilience implements ResiliencePolicy {
    static get create(): Resilience {
        return new Resilience();
    }
    private resiliences: Policy[] = [];
    retry = (opts?: RetryOptions): Resilience => {
        this.resiliences.push(resilience.retry(opts));
        return this;
    }
    timeout = (opts: TimeoutOptions): Resilience => {
        this.resiliences.push(resilience.timeout(opts));
        return this;
    }

    circuitBreaker = (opts?: CircuitBreakerOptions): Resilience => {
        this.resiliences.push(resilience.circuitBreaker(opts));
        return this;
    }

    bulkhead = (opts?: BulkheadOptions): Resilience => {
        this.resiliences.push(resilience.bulkhead(opts));
        return this;
    }

    rateLimiter = (opts?: RateLimiterOptions): Resilience => {
        this.resiliences.push(resilience.rateLimiter(opts));
        return this;
    }
    fallback = <T>(opts: FallbackOptions<T>): Resilience => {
        this.resiliences.push(resilience.fallback<T>(opts));
        return this;
    }

    async execute<T>(action: Action<T>, ctx?: Context): Promise<T> {
        return resilience.wrap(...this.resiliences).execute(action, ctx);
    }
}