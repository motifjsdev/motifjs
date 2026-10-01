/**
 * Routing Benchmark Tests
 * 
 * Router performansını ölçer: route resolution, matching, path generation.
 */



import { Scanner, RouteCollection, UrlRoutingModule, RouterState, createRouter } from '@motifx/core/internal';
import { RouteItem } from '@motifx/core';
import { Component, Application } from '@motifx/core';
import { RouterOptions } from '@motifx/core';

// Simple performance helper
function measureTime(fn: () => void, iterations: number, warmup: number = 0): number {
    // Warmup
    for (let i = 0; i < warmup; i++) {
        fn();
    }

    // Measure
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    return performance.now() - start;
}

class TestComponent extends Component {
    constructor() {
        super('div');
    }
}

const createMockApp = (): Application => {
    const routerState = new RouterState();
    return {
        _routerState: routerState,
        router: createRouter(routerState, () => undefined),
        triggerEvent: jest.fn()
    } as any;
};

describe('Routing Benchmarks', () => {
    const ITERATIONS = 1000;
    const WARMUP = parseInt(process.env.BENCH_WARMUP || '100', 10);
    // jsdom'da duvar-saat ölçümü paralel test yükü altında dalgalanır; eşikler
    // yalnızca kaba regresyon yakalamak içindir (gerçek ölçüm: packages/tests/bench).
    const SLACK = 2.5;

    describe('Scanner performance', () => {
        it('should parse static route pattern efficiently', () => {
            const time = measureTime(() => {
                const scanner = new Scanner('/users/profile/settings');
                scanner.parse();
            }, ITERATIONS, WARMUP);

            console.log(`Scanner parse (static): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(100 * SLACK); // Should be fast
        });

        it('should parse parametric route pattern efficiently', () => {
            const time = measureTime(() => {
                const scanner = new Scanner('/users/{id}/posts/{postId}');
                scanner.parse();
            }, ITERATIONS, WARMUP);

            console.log(`Scanner parse (parametric): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(150 * SLACK);
        });

        it('should parse complex optional route efficiently', () => {
            const time = measureTime(() => {
                const scanner = new Scanner('/docs/{section?}/{page?}/{anchor?}');
                scanner.parse();
            }, ITERATIONS, WARMUP);

            console.log(`Scanner parse (optional): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(200 * SLACK);
        });

        it('should match static paths efficiently', () => {
            const scanner = new Scanner('/users/profile');
            scanner.parse();

            const time = measureTime(() => {
                scanner.exist('/users/profile');
            }, ITERATIONS, WARMUP);

            console.log(`Scanner match (static): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(50 * SLACK);
        });

        it('should match parametric paths efficiently', () => {
            const scanner = new Scanner('/users/{id}');
            scanner.parse();

            const time = measureTime(() => {
                scanner.exist('/users/12345');
            }, ITERATIONS, WARMUP);

            console.log(`Scanner match (parametric): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(100 * SLACK);
        });

        it('should parse query strings efficiently', () => {
            const scanner = new Scanner('/search');
            scanner.parse();

            const time = measureTime(() => {
                scanner.exist('/search?q=test&page=1&limit=10&sort=date&order=desc');
            }, ITERATIONS, WARMUP);

            console.log(`Scanner query parse: ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(200 * SLACK);
        });
    });

    describe('RouteCollection performance', () => {
        it('should build small route tree efficiently', () => {
            const routes: RouteItem[] = [
                { path: '/home', control: TestComponent },
                { path: '/about', control: TestComponent },
                { path: '/contact', control: TestComponent }
            ];

            const time = measureTime(() => {
                new RouteCollection(routes);
            }, ITERATIONS, WARMUP);

            console.log(`RouteCollection build (3 routes): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(100 * SLACK);
        });

        it('should build medium route tree efficiently', () => {
            const routes: RouteItem[] = Array.from({ length: 20 }, (_, i) => ({
                path: `/page${i}`,
                control: TestComponent,
                childs: [
                    { path: 'detail', control: TestComponent },
                    { path: 'edit', control: TestComponent }
                ]
            }));

            const time = measureTime(() => {
                new RouteCollection(routes);
            }, 100, WARMUP);

            console.log(`RouteCollection build (60 routes): ${time.toFixed(2)}ms for 100 iterations (${(100 / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(500 * SLACK);
        });

        it('should build deeply nested routes efficiently', () => {
            const routes: RouteItem[] = [
                {
                    path: '/level1',
                    control: TestComponent,
                    childs: [
                        {
                            path: 'level2',
                            control: TestComponent,
                            childs: [
                                {
                                    path: 'level3',
                                    control: TestComponent,
                                    childs: [
                                        { path: 'level4', control: TestComponent }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ];

            const time = measureTime(() => {
                new RouteCollection(routes);
            }, ITERATIONS, WARMUP);

            console.log(`RouteCollection build (deep nesting): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(150 * SLACK);
        });
    });

    describe('Route resolution performance', () => {
        it('should resolve static routes efficiently', () => {
            const routes: RouteItem[] = Array.from({ length: 50 }, (_, i) => ({
                path: `/page${i}`,
                control: TestComponent
            }));

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const time = measureTime(() => {
                module.resolve('/page25');
            }, ITERATIONS, WARMUP);

            console.log(`Route resolve (50 static): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(200 * SLACK);
        });

        it('should resolve parametric routes efficiently', () => {
            const routes: RouteItem[] = [
                { path: '/users/{id}', control: TestComponent },
                { path: '/posts/{slug}', control: TestComponent },
                { path: '/products/{category}/{id}', control: TestComponent }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const time = measureTime(() => {
                module.resolve('/products/electronics/12345');
            }, ITERATIONS, WARMUP);

            console.log(`Route resolve (parametric): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(150 * SLACK);
        });

        it('should resolve nested routes efficiently', () => {
            const routes: RouteItem[] = [
                {
                    path: '/app',
                    control: TestComponent,
                    childs: [
                        {
                            path: 'admin',
                            control: TestComponent,
                            childs: [
                                { path: 'users/{id}', control: TestComponent }
                            ]
                        }
                    ]
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const time = measureTime(() => {
                module.resolve('/app/admin/users/42');
            }, ITERATIONS, WARMUP);

            console.log(`Route resolve (nested): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(200 * SLACK);
        });

        it('should handle 404 efficiently', () => {
            const routes: RouteItem[] = Array.from({ length: 50 }, (_, i) => ({
                path: `/page${i}`,
                control: TestComponent
            }));

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const time = measureTime(() => {
                module.resolve('/not-found');
            }, ITERATIONS, WARMUP);

            console.log(`Route resolve (404): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(150 * SLACK);
        });
    });

    describe('Path generation performance', () => {
        it('should generate static paths efficiently', () => {
            const { RoutingEngine } = require('@motifx/core/internal');
            const engine = new RoutingEngine();

            const time = measureTime(() => {
                engine.generatePathString('/users/profile/settings', {});
            }, ITERATIONS, WARMUP);

            console.log(`Path generation (static): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(50 * SLACK);
        });

        it('should generate parametric paths efficiently', () => {
            const { RoutingEngine } = require('@motifx/core/internal');
            const engine = new RoutingEngine();

            const time = measureTime(() => {
                engine.generatePathString('/users/{id}/posts/{postId}', {
                    id: '123',
                    postId: '456'
                });
            }, ITERATIONS, WARMUP);

            console.log(`Path generation (parametric): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(100 * SLACK);
        });

        it('should generate optional paths efficiently', () => {
            const { RoutingEngine } = require('@motifx/core/internal');
            const engine = new RoutingEngine();

            const time = measureTime(() => {
                engine.generatePathString('/docs/{section?}/{page?}', {
                    section: 'api'
                });
            }, ITERATIONS, WARMUP);

            console.log(`Path generation (optional): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(100 * SLACK);
        });
    });

    describe('Validation performance', () => {
        it('should execute validators efficiently', () => {
            const validator = () => true;

            const routes: RouteItem[] = Array.from({ length: 10 }, (_, i) => ({
                path: `/page${i}`,
                control: TestComponent,
                validate: validator
            }));

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const time = measureTime(() => {
                module.resolve('/page5');
            }, ITERATIONS, WARMUP);

            console.log(`Validation (10 routes): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(200 * SLACK);
        });

        it('should execute nested validators efficiently', () => {
            const validator = () => true;

            const routes: RouteItem[] = [
                {
                    path: '/level1',
                    control: TestComponent,
                    validate: validator,
                    childs: [
                        {
                            path: 'level2',
                            control: TestComponent,
                            validate: validator,
                            childs: [
                                {
                                    path: 'level3',
                                    control: TestComponent,
                                    validate: validator
                                }
                            ]
                        }
                    ]
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const time = measureTime(() => {
                module.resolve('/level1/level2/level3');
            }, ITERATIONS, WARMUP);

            console.log(`Validation (nested 3 levels): ${time.toFixed(2)}ms for ${ITERATIONS} iterations (${(ITERATIONS / time * 1000).toFixed(0)} ops/sec)`);
            expect(time).toBeLessThan(250 * SLACK);
        });
    });

    describe('Overall router performance', () => {
        it('should handle realistic routing workload', () => {
            const routes: RouteItem[] = [
                { path: '/', control: TestComponent },
                { path: '/login', control: TestComponent },
                {
                    path: '/app',
                    control: TestComponent,
                    childs: [
                        { path: 'dashboard', control: TestComponent },
                        {
                            path: 'users',
                            control: TestComponent,
                            childs: [
                                { path: 'list', control: TestComponent },
                                { path: '{id}', control: TestComponent },
                                { path: '{id}/edit', control: TestComponent }
                            ]
                        },
                        {
                            path: 'products',
                            control: TestComponent,
                            childs: [
                                { path: '{category}', control: TestComponent },
                                { path: '{category}/{id}', control: TestComponent }
                            ]
                        }
                    ]
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const paths = [
                '/',
                '/login',
                '/app/dashboard',
                '/app/users/list',
                '/app/users/123',
                '/app/users/123/edit',
                '/app/products/electronics',
                '/app/products/electronics/456'
            ];

            const time = measureTime(() => {
                paths.forEach(path => module.resolve(path));
            }, 100, WARMUP);

            const totalResolves = paths.length * 100;
            console.log(`Realistic workload (${paths.length} routes × 100): ${time.toFixed(2)}ms (${(totalResolves / time * 1000).toFixed(0)} resolves/sec)`);
            expect(time).toBeLessThan(500 * SLACK);
        });
    });
});
