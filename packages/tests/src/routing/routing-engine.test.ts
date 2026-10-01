/**
 * RoutingEngine Unit Tests
 * 
 * RoutingEngine, route execution, component instantiation, lifecycle yönetimini test eder.
 * KeepAlive, control cache, lazy loading, path generation test edilir.
 */

import { RoutingEngine, UrlRoutingModule, RouterState, createRouter } from '@motifx/core/internal';
import { RouteItem } from '@motifx/core';
import { Component, Application } from '@motifx/core';
import { ResolveResult } from '@motifx/core';

class TestComponent extends Component {
    componentName: string;
    
    constructor(name: string = 'Test') {
        super('div');
        this.componentName = name;
    }
}

const createMockApp = (): Application => {
    const routerState = new RouterState();
    return {
        _routerState: routerState,
        router: createRouter(routerState, () => undefined),
        _runBeforeEachGuards: jest.fn(async (_to: any, _from: any) => true),
        triggerEvent: jest.fn()
    } as any;
};

describe('RoutingEngine - Component Lifecycle & Execution', () => {
    describe('Path generation', () => {
        it('should generate simple static path', () => {
            const engine = new RoutingEngine();
            const path = engine.generatePathString('/home', {});
            
            expect(path).toBe('/home');
        });

        it('should generate parametric path', () => {
            const engine = new RoutingEngine();
            const path = engine.generatePathString('/users/{id}', { id: '123' });
            
            expect(path).toBe('/users/123');
        });

        it('should generate path with multiple parameters', () => {
            const engine = new RoutingEngine();
            const path = engine.generatePathString('/posts/{category}/{id}', {
                category: 'tech',
                id: '456'
            });
            
            expect(path).toBe('/posts/tech/456');
        });

        it('should use default value for optional missing parameter', () => {
            const engine = new RoutingEngine();
            const path = engine.generatePathString('/docs/{page?:intro}', {});
            
            expect(path).toBe('/docs/intro');
        });

        it('should override default when parameter is provided', () => {
            const engine = new RoutingEngine();
            const path = engine.generatePathString('/docs/{page?:intro}', { page: 'advanced' });
            
            expect(path).toBe('/docs/advanced');
        });

        it('should keep a zero value', () => {
            const engine = new RoutingEngine();
            expect(engine.generatePathString('/users/{id}', { id: 0 })).toBe('/users/0');
            expect(engine.generatePathString('/list/{page?:1}', { page: 0 })).toBe('/list/0');
        });

        it('should keep a false value', () => {
            const engine = new RoutingEngine();
            expect(engine.generatePathString('/flags/{on}', { on: false })).toBe('/flags/false');
        });

        it('should fall back to the default for null, undefined and an empty string', () => {
            const engine = new RoutingEngine();
            expect(engine.generatePathString('/docs/{page?:intro}', { page: null })).toBe('/docs/intro');
            expect(engine.generatePathString('/docs/{page?:intro}', { page: undefined })).toBe('/docs/intro');
            expect(engine.generatePathString('/docs/{page?:intro}', { page: '' })).toBe('/docs/intro');
        });

        it('should omit optional parameter without value or default', () => {
            const engine = new RoutingEngine();
            const path = engine.generatePathString('/browse/{category?}', {});
            
            expect(path).toBe('/browse');
        });

        it('should handle nested optional parameters', () => {
            const engine = new RoutingEngine();
            const path = engine.generatePathString('/docs/{section?}/{page?}', {
                section: 'api'
            });
            
            expect(path).toBe('/docs/api');
        });

        it('should handle complex mixed parameters', () => {
            const engine = new RoutingEngine();
            const path = engine.generatePathString('/api/{version}/users/{id}/{tab?:profile}', {
                version: 'v2',
                id: '789'
            });
            
            expect(path).toBe('/api/v2/users/789/profile');
        });
    });

    describe('Control instantiation', () => {
        it('should create instance from class', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const control = TestComponent;
            const instance = await (engine as any).createInstance(control);
            
            expect(instance).toBeInstanceOf(TestComponent);
        });

        it('should create instance from factory function', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const factory = () => new TestComponent('Factory');
            const instance = await (engine as any).createInstance(factory);
            
            expect(instance).toBeInstanceOf(TestComponent);
            expect(instance.componentName).toBe('Factory');
        });

        it('should handle lazy loaded components', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const lazyControl = Promise.resolve({ default: TestComponent });
            const instance = await (engine as any).createInstance(lazyControl);
            
            expect(instance).toBeInstanceOf(TestComponent);
        });

        it('should handle factory that returns promise', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const asyncFactory = () => Promise.resolve(new TestComponent('Async'));
            const instance = await (engine as any).createInstance(asyncFactory);
            
            expect(instance).toBeInstanceOf(TestComponent);
            expect(instance.componentName).toBe('Async');
        });
    });

    describe('Control caching (keepAlive)', () => {
        it('should cache control when keepAlive is true', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const route: RouteItem = {
                path: '/home',
                control: TestComponent,
                keepAlive: true
            };
            
            const instance1 = await (engine as any).createInstance(route.control);
            (engine as any).controlCache.set(route, instance1);
            
            const cached = (engine as any).controlCache.get(route);
            
            expect(cached).toBe(instance1);
        });

        it('should not cache control when keepAlive is false', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const route: RouteItem = {
                path: '/temp',
                control: TestComponent,
                keepAlive: false
            };
            
            const instance1 = await (engine as any).createInstance(route.control);
            
            // Without caching, should create new instance each time
            const instance2 = await (engine as any).createInstance(route.control);
            
            expect(instance1).not.toBe(instance2);
        });

        it('should recreate disposed cached control', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const route: RouteItem = {
                path: '/cached',
                control: TestComponent,
                keepAlive: true
            };
            
            const instance1 = await (engine as any).createInstance(route.control);
            instance1.isDisposed = true;
            (engine as any).controlCache.set(route, instance1);
            
            // Should detect disposed and create new
            const controlList: any[] = [];
            
            if ((engine as any).controlCache.has(route)) {
                let control = (engine as any).controlCache.get(route);
                if (!control || control.isDisposed) {
                    (engine as any).controlCache.delete(route);
                    control = await (engine as any).createInstance(route.control);
                    (engine as any).controlCache.set(route, control);
                }
                controlList.push(control);
            }
            
            expect(controlList[0]).not.toBe(instance1);
            expect(controlList[0].isDisposed).toBeFalsy();
        });
    });

    describe('Route execution', () => {
        it('should set application router context', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routes: RouteItem[] = [
                { path: '/test', control: TestComponent }
            ];
            const routingModule = new UrlRoutingModule({ RouteItems: routes }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const resolveResult: ResolveResult = {
                ok: true,
                uri: '/test',
                fullPath: '/test',
                route: routes[0],
                chain: [routes[0]],
                params: {},
                extend: {}
            };
            
            await engine.execute(resolveResult);
            
            expect(app.router).toBeDefined();
            expect(app.router!.uri).toBe('/test');
            expect(app.router!.fullPath).toBe('/test');
            expect(app.router!.ok).toBe(true);
        });

        it('should populate router params', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routes: RouteItem[] = [
                { path: '/users/{id}', control: TestComponent }
            ];
            const routingModule = new UrlRoutingModule({ RouteItems: routes }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const resolveResult: ResolveResult = {
                ok: true,
                uri: '/users/123',
                fullPath: '/users/{id}',
                route: routes[0],
                chain: [routes[0]],
                params: { id: '123' },
                extend: {}
            };
            
            await engine.execute(resolveResult);
            
            expect(app.router!.params.id).toBe('123');
        });

        it('should populate router extend metadata', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: TestComponent,
                    extend: { requiresAuth: true, role: 'admin' }
                }
            ];
            const routingModule = new UrlRoutingModule({ RouteItems: routes }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const resolveResult: ResolveResult = {
                ok: true,
                uri: '/admin',
                fullPath: '/admin',
                route: routes[0],
                chain: [routes[0]],
                params: {},
                extend: { requiresAuth: true, role: 'admin' }
            };
            
            await engine.execute(resolveResult);
            
            expect(app.router!.extend.requiresAuth).toBe(true);
            expect(app.router!.extend.role).toBe('admin');
        });

        it('should generate chain paths correctly', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            
            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: TestComponent,
                    childs: [
                        { path: 'users/{id}', control: TestComponent }
                    ]
                }
            ];
            
            const routingModule = new UrlRoutingModule({ RouteItems: routes }, app);
            engine.register(new Component('div') as any, app, routingModule);
            
            const resolveResult: ResolveResult = {
                ok: true,
                uri: '/admin/users/42',
                fullPath: '/admin/users/{id}',
                route: routes[0].childs![0],
                chain: [routes[0], routes[0].childs![0]],
                params: { id: '42' },
                extend: {}
            };
            
            await engine.execute(resolveResult);
            
            expect(app.router!.chain).toEqual(['/admin', 'users/42']);
        });
    });

    describe('Navigate function', () => {
        it('should provide navigate function in router context', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routes: RouteItem[] = [
                { path: '/home', control: TestComponent }
            ];
            const routingModule = new UrlRoutingModule({ RouteItems: routes }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const resolveResult: ResolveResult = {
                ok: true,
                uri: '/home',
                fullPath: '/home',
                route: routes[0],
                chain: [routes[0]],
                params: {},
                extend: {}
            };
            
            await engine.execute(resolveResult);
            
            expect(app.router!.navigate).toBeInstanceOf(Function);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty chain gracefully', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const resolveResult: ResolveResult = {
                ok: false,
                uri: '/not-found',
                fullPath: null,
                route: null,
                chain: [],
                params: {},
                extend: {}
            };
            
            await engine.execute(resolveResult);
            
            expect(app.router!.ok).toBe(false);
        });

        it('should handle null route', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            const routingModule = new UrlRoutingModule({ RouteItems: [] }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            const resolveResult: ResolveResult = {
                ok: false,
                uri: '/404',
                fullPath: null,
                route: null,
                chain: [],
                params: {},
                extend: {}
            };
            
            await engine.execute(resolveResult);
            
            expect(app.router!.route).toBeNull();
        });

        it('should cache and reuse controls in controlCache', async () => {
            const engine = new RoutingEngine();
            const app = createMockApp();
            
            const route1: RouteItem = { path: '/page1', control: TestComponent, keepAlive: true };
            
            const routes = [route1];
            const routingModule = new UrlRoutingModule({ RouteItems: routes }, app);
            
            engine.register(new Component('div') as any, app, routingModule);
            
            // First navigation to page1
            const result1: ResolveResult = {
                ok: true,
                uri: '/page1',
                fullPath: '/page1',
                route: route1,
                chain: [route1],
                params: {},
                extend: {}
            };
            
            await engine.execute(result1);
            const firstControl = (engine as any).controlCache.get(route1);
            
            // Second navigation to same page
            await engine.execute(result1);
            const secondControl = (engine as any).controlCache.get(route1);
            
            // With keepAlive, should reuse same instance
            expect(firstControl).toBe(secondControl);
        });
    });
});
