/**
 * UrlRoutingModule Unit Tests
 * 
 * UrlRoutingModule, routing çekirdeğidir: route resolve, navigation, middleware, validation.
 * History/hash mode, link interception, URL updates test edilir.
 */

import { UrlRoutingModule, RouterState, createRouter } from '@motifx/core/internal';
import { RouteItem } from '@motifx/core';
import { Component, Application } from '@motifx/core';
import { RouterOptions } from '@motifx/core';

// Mock Component
class TestComponent extends Component {
    constructor(name: string) {
        super('div');
        (this as any).componentName = name;
    }
}

// Mock Application
const createMockApp = (): Application => {
    const routerState = new RouterState();
    return {
        _routerState: routerState,
        router: createRouter(routerState, () => undefined),
        _runBeforeEachGuards: jest.fn(async (_to: any, _from: any) => true),
        triggerEvent: jest.fn()
    } as any;
};

describe('UrlRoutingModule - Route Resolution & Navigation', () => {
    describe('Route resolution', () => {
        it('should resolve exact static route', () => {
            const routes: RouteItem[] = [
                { path: '/home', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/home');
            
            expect(result.ok).toBe(true);
            expect(result.fullPath).toBe('/home');
            expect(result.route).toBeDefined();
            expect(result.chain.length).toBe(1);
        });

        it('should resolve parametric route', () => {
            const routes: RouteItem[] = [
                { path: '/users/{id}', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/users/123');
            
            expect(result.ok).toBe(true);
            expect(result.params.id).toBe('123');
        });

        it('should resolve nested routes', () => {
            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: TestComponent,
                    childs: [
                        { path: 'users', control: TestComponent }
                    ]
                }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/admin/users');
            
            expect(result.ok).toBe(true);
            expect(result.chain.length).toBe(2);
            expect(result.fullPath).toBe('/admin/users');
        });

        it('should return ok:false for non-matching route', () => {
            const routes: RouteItem[] = [
                { path: '/home', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/not-found');
            
            expect(result.ok).toBe(false);
            expect(result.route).toBeNull();
            expect(result.fullPath).toBeNull();
        });

        it('should resolve optional parameters', () => {
            const routes: RouteItem[] = [
                { path: '/docs/{page?}', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result1 = module.resolve('/docs');
            expect(result1.ok).toBe(true);
            expect(result1.params.page).toBeUndefined();
            
            const result2 = module.resolve('/docs/intro');
            expect(result2.ok).toBe(true);
            expect(result2.params.page).toBe('intro');
        });

        it('should prefer shallow routes over deep ones', () => {
            const routes: RouteItem[] = [
                { path: '/users', control: TestComponent, name: 'users-list' },
                {
                    path: '/users',
                    control: TestComponent,
                    childs: [
                        { path: '{id?}', control: TestComponent, name: 'user-detail' }
                    ]
                }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/users');
            
            // Should match the shallower route
            expect(result.ok).toBe(true);
            expect(result.chain.length).toBe(1);
        });

        it('should choose longer fullPath as tiebreaker', () => {
            const routes: RouteItem[] = [
                { path: '/a', control: TestComponent },
                { path: '/abc', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/abc');
            
            expect(result.ok).toBe(true);
            expect(result.fullPath).toBe('/abc');
        });
    });

    describe('Metadata merging', () => {
        it('should merge extend objects from parent to child', () => {
            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: TestComponent,
                    extend: { requiresAuth: true },
                    childs: [
                        {
                            path: 'users',
                            control: TestComponent,
                            extend: { role: 'admin' }
                        }
                    ]
                }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/admin/users');
            
            expect(result.extend.requiresAuth).toBe(true);
            expect(result.extend.role).toBe('admin');
        });

        it('should allow child extend to override parent', () => {
            const routes: RouteItem[] = [
                {
                    path: '/parent',
                    control: TestComponent,
                    extend: { title: 'Parent', theme: 'light' },
                    childs: [
                        {
                            path: 'child',
                            control: TestComponent,
                            extend: { title: 'Child' }
                        }
                    ]
                }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/parent/child');
            
            expect(result.extend.title).toBe('Child'); // Overridden
            expect(result.extend.theme).toBe('light'); // Inherited
        });
    });

    describe('Validation', () => {
        it('should validate route before resolving', () => {
            const validateFn = jest.fn(() => true);
            const routes: RouteItem[] = [
                { path: '/secure', control: TestComponent, validate: validateFn }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            module.resolve('/secure');
            
            expect(validateFn).toHaveBeenCalled();
            expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
                uri: '/secure'
            }));
        });

        it('should reject route if validation fails', () => {
            const routes: RouteItem[] = [
                { path: '/forbidden', control: TestComponent, validate: () => false }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/forbidden');
            
            expect(result.ok).toBe(false);
        });

        it('should validate entire chain for nested routes', () => {
            const parentValidate = jest.fn(() => true);
            const childValidate = jest.fn(() => true);
            
            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: TestComponent,
                    validate: parentValidate,
                    childs: [
                        {
                            path: 'users',
                            control: TestComponent,
                            validate: childValidate
                        }
                    ]
                }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            module.resolve('/admin/users');
            
            expect(parentValidate).toHaveBeenCalled();
            expect(childValidate).toHaveBeenCalled();
        });

        it('should fail if any validator in chain returns false', () => {
            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: TestComponent,
                    validate: () => true,
                    childs: [
                        {
                            path: 'secret',
                            control: TestComponent,
                            validate: () => false
                        }
                    ]
                }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/admin/secret');
            
            expect(result.ok).toBe(false);
        });
    });

    describe('Query parameters', () => {
        it('should parse query parameters', () => {
            const routes: RouteItem[] = [
                { path: '/search', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/search?q=motifjs&page=2');
            
            expect(result.ok).toBe(true);
            expect(result.params.q).toBe('motifjs');
            expect(result.params.page).toBe('2');
        });

        it('should combine path and query parameters', () => {
            const routes: RouteItem[] = [
                { path: '/users/{id}', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/users/123?tab=posts&sort=date');
            
            expect(result.params.id).toBe('123');
            expect(result.params.tab).toBe('posts');
            expect(result.params.sort).toBe('date');
        });
    });

    describe('Middleware', () => {
        it('should run middleware before navigation', async () => {
            const middleware = jest.fn(async (ctx, next) => await next());
            
            const routes: RouteItem[] = [
                { path: '/home', control: TestComponent }
            ];
            
            const options: RouterOptions = {
                RouteItems: routes,
                middlewareCollections: () => [middleware]
            };
            
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const mainApp = new Component('div') as any;
            module.start(mainApp);
            
            await module.navigate('/home');
            
            expect(middleware).toHaveBeenCalled();
        });

        it('should allow middleware to rewrite path', async () => {
            const middleware = async (ctx: any, next: any) => {
                if (ctx.uri === '/old') {
                    ctx.rewritePath('/new');
                }
                await next();
            };
            
            const routes: RouteItem[] = [
                { path: '/new', control: TestComponent }
            ];
            
            const options: RouterOptions = {
                RouteItems: routes,
                middlewareCollections: () => [middleware]
            };
            
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const mainApp = new Component('div') as any;
            module.start(mainApp);
            
            await module.navigate('/old');
            
            // Should have navigated to /new instead
            expect(module.currentUri).toBe('/new');
        });

        it('should abort navigation if middleware does not call next', async () => {
            const middleware = jest.fn(async (ctx, next) => {
                // Don't call next - block navigation
            });
            
            const routes: RouteItem[] = [
                { path: '/blocked', control: TestComponent }
            ];
            
            const options: RouterOptions = {
                RouteItems: routes,
                middlewareCollections: () => [middleware]
            };
            
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const mainApp = new Component('div') as any;
            module.start(mainApp);
            
            const result = await module.navigate('/blocked') as any;
            
            expect(result).toMatchObject({ ok: false, cancelled: true, reason: 'middleware' });
            expect(result.canceled).toBeUndefined();
        });

        it('should execute multiple middlewares in order', async () => {
            const order: string[] = [];
            
            const mw1 = async (ctx: any, next: any) => {
                order.push('mw1-before');
                await next();
                order.push('mw1-after');
            };
            
            const mw2 = async (ctx: any, next: any) => {
                order.push('mw2-before');
                await next();
                order.push('mw2-after');
            };
            
            const routes: RouteItem[] = [
                { path: '/test', control: TestComponent }
            ];
            
            const options: RouterOptions = {
                RouteItems: routes,
                middlewareCollections: () => [mw1, mw2]
            };
            
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const mainApp = new Component('div') as any;
            module.start(mainApp);
            
            await module.navigate('/test');
            
            expect(order).toEqual(['mw1-before', 'mw2-before', 'mw2-after', 'mw1-after']);
        });
    });

    describe('Duplicate navigation', () => {
        it('should skip navigation if already on same URI', async () => {
            const routes: RouteItem[] = [
                { path: '/home', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const mainApp = new Component('div') as any;
            module.start(mainApp);
            
            await module.navigate('/home');
            const firstUri = module.currentUri;
            
            await module.navigate('/home');
            const secondUri = module.currentUri;
            
            expect(firstUri).toBe(secondUri);
        });
    });

    describe('Fallback routes', () => {
        it('should use notFound fallback for 404', async () => {
            const NotFoundComponent = class extends Component {
                constructor() {
                    super('div');
                    (this as any).is404 = true;
                }
            };
            
            const routes: RouteItem[] = [
                { path: '/home', control: TestComponent }
            ];
            
            const options: RouterOptions = {
                RouteItems: routes,
                fallbacks: {
                    notFound: NotFoundComponent
                }
            };
            
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const result = module.resolve('/not-exists');
            
            expect(result.ok).toBe(false);
        });
    });

    describe('Cleanup', () => {
        it('should remove event listeners on dispose', () => {
            const routes: RouteItem[] = [
                { path: '/home', control: TestComponent }
            ];
            
            const options: RouterOptions = { RouteItems: routes };
            const app = createMockApp();
            const module = new UrlRoutingModule(options, app);
            
            const mainApp = new Component('div') as any;
            module.start(mainApp);
            
            const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
            
            module.dispose();
            
            expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
            
            removeEventListenerSpy.mockRestore();
        });
    });
});
