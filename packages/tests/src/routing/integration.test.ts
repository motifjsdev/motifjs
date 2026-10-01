/**
 * Routing Integration Tests
 * 
 * End-to-end routing senaryoları: navigation flow, middleware chain, guards, lifecycle.
 * Gerçek dünya kullanım örnekleri test edilir.
 */

import { UrlRoutingModule, RouterState, createRouter } from '@motifx/core/internal';
import { RouteItem } from '@motifx/core';
import { Component, Application } from '@motifx/core';
import { RouterOptions } from '@motifx/core';

class PageComponent extends Component {
    pageName: string;

    constructor(name: string) {
        super('div');
        this.pageName = name;
    }
}

const createMockApp = (): Application => {
    const routerState = new RouterState();
    return {
        _routerState: routerState,
        router: createRouter(routerState, () => undefined),
        // In integration tests we don't focus on guard behavior; allow navigation to proceed
        _runBeforeEachGuards: jest.fn(async (_to: any, _from: any) => true),
        triggerEvent: jest.fn()
    } as any;
};

describe('Routing Integration - E2E Scenarios', () => {
    describe('Complete navigation flow', () => {
        it('should navigate through nested routes', async () => {
            const routes: RouteItem[] = [
                {
                    path: '/app',
                    control: () => new PageComponent('AppLayout'),
                    childs: [
                        { path: 'dashboard', control: () => new PageComponent('Dashboard') },
                        {
                            path: 'users',
                            control: () => new PageComponent('UsersLayout'),
                            childs: [
                                { path: 'list', control: () => new PageComponent('UserList') },
                                { path: '{id}', control: () => new PageComponent('UserDetail') }
                            ]
                        }
                    ]
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            // Navigate to dashboard
            await module.navigate('/app/dashboard');
            expect(module.currentUri).toBe('/app/dashboard');
            expect(app.router!.chain.length).toBe(2);

            // Navigate to user list
            await module.navigate('/app/users/list');
            expect(module.currentUri).toBe('/app/users/list');
            expect(app.router!.chain.length).toBe(3);

            // Navigate to specific user
            await module.navigate('/app/users/42');
            expect(module.currentUri).toBe('/app/users/42');
            expect(app.router!.params.id).toBe('42');
        });

        it('should maintain router state across navigations', async () => {
            const routes: RouteItem[] = [
                { path: '/page1', control: () => new PageComponent('Page1') },
                { path: '/page2', control: () => new PageComponent('Page2') },
                { path: '/page3', control: () => new PageComponent('Page3') }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/page1');
            const state1 = { ...app.router };

            await module.navigate('/page2');
            const state2 = { ...app.router };

            await module.navigate('/page3');
            const state3 = { ...app.router };

            expect(state1!.uri).toBe('/page1');
            expect(state2!.uri).toBe('/page2');
            expect(state3!.uri).toBe('/page3');
        });
    });

    describe('Authentication & Guards', () => {
        it('should block access to protected routes', async () => {
            let isAuthenticated = false;

            const routes: RouteItem[] = [
                { path: '/login', control: () => new PageComponent('Login') },
                {
                    path: '/admin',
                    control: () => new PageComponent('Admin'),
                    validate: () => isAuthenticated
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            // Try to access admin without auth
            await module.navigate('/admin');
            const result1 = module.resolve('/admin');
            expect(result1.ok).toBe(false);

            // Login
            isAuthenticated = true;

            // Now can access admin
            await module.navigate('/admin');
            const result2 = module.resolve('/admin');
            expect(result2.ok).toBe(true);
        });

        it('should check permissions on nested routes', async () => {
            const userRole = { current: 'user' };

            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: () => new PageComponent('Admin'),
                    validate: () => userRole.current === 'admin',
                    childs: [
                        {
                            path: 'users',
                            control: () => new PageComponent('ManageUsers'),
                            validate: () => userRole.current === 'admin'
                        }
                    ]
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            // User role cannot access
            const result1 = module.resolve('/admin/users');
            expect(result1.ok).toBe(false);

            // Admin role can access
            userRole.current = 'admin';
            const result2 = module.resolve('/admin/users');
            expect(result2.ok).toBe(true);
        });
    });

    describe('Middleware scenarios', () => {
        it('should implement authentication redirect', async () => {
            let isAuthenticated = false;

            const authMiddleware = async (ctx: any, next: any) => {
                if (ctx.uri.startsWith('/admin') && !isAuthenticated) {
                    ctx.rewritePath('/login');
                }
                await next();
            };

            const routes: RouteItem[] = [
                { path: '/login', control: () => new PageComponent('Login') },
                { path: '/admin', control: () => new PageComponent('Admin') }
            ];

            const app = createMockApp();
            const options: RouterOptions = {
                RouteItems: routes,
                middlewareCollections: () => [authMiddleware]
            };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            // Try admin without auth
            await module.navigate('/admin');
            expect(module.currentUri).toBe('/login'); // Redirected

            // Login
            isAuthenticated = true;
            await module.navigate('/admin');
            expect(module.currentUri).toBe('/admin'); // Allowed
        });

        it('should implement logging middleware', async () => {
            const logs: string[] = [];

            const loggingMiddleware = async (ctx: any, next: any) => {
                logs.push(`Before: ${ctx.uri}`);
                await next();
                logs.push(`After: ${ctx.uri}`);
            };

            const routes: RouteItem[] = [
                { path: '/page1', control: () => new PageComponent('Page1') },
                { path: '/page2', control: () => new PageComponent('Page2') }
            ];

            const app = createMockApp();
            const options: RouterOptions = {
                RouteItems: routes,
                middlewareCollections: () => [loggingMiddleware]
            };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/page1');
            await module.navigate('/page2');

            expect(logs).toContain('Before: /page1');
            expect(logs).toContain('After: /page1');
            expect(logs).toContain('Before: /page2');
            expect(logs).toContain('After: /page2');
        });

        it('should chain multiple middlewares correctly', async () => {
            const order: string[] = [];

            const mw1 = async (ctx: any, next: any) => {
                order.push('mw1-start');
                await next();
                order.push('mw1-end');
            };

            const mw2 = async (ctx: any, next: any) => {
                order.push('mw2-start');
                await next();
                order.push('mw2-end');
            };

            const mw3 = async (ctx: any, next: any) => {
                order.push('mw3-start');
                await next();
                order.push('mw3-end');
            };

            const routes: RouteItem[] = [
                { path: '/test', control: () => new PageComponent('Test') }
            ];

            const app = createMockApp();
            const options: RouterOptions = {
                RouteItems: routes,
                middlewareCollections: () => [mw1, mw2, mw3]
            };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/test');

            expect(order).toEqual([
                'mw1-start',
                'mw2-start',
                'mw3-start',
                'mw3-end',
                'mw2-end',
                'mw1-end'
            ]);
        });
    });

    describe('Query & Parameters', () => {
        it('should handle search with filters', async () => {
            const routes: RouteItem[] = [
                { path: '/search', control: () => new PageComponent('Search') }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/search?q=motifjs&category=framework&sort=stars');

            expect(app.router!.params.q).toBe('motifjs');
            expect(app.router!.params.category).toBe('framework');
            expect(app.router!.params.sort).toBe('stars');
        });

        it('should handle pagination params', async () => {
            const routes: RouteItem[] = [
                { path: '/products', control: () => new PageComponent('Products') }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/products?page=5&limit=20');

            expect(app.router!.params.page).toBe('5');
            expect(app.router!.params.limit).toBe('20');
        });

        it('should combine path and query parameters', async () => {
            const routes: RouteItem[] = [
                { path: '/users/{id}/posts', control: () => new PageComponent('UserPosts') }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/users/42/posts?page=2&filter=published');

            expect(app.router!.params.id).toBe('42');
            expect(app.router!.params.page).toBe('2');
            expect(app.router!.params.filter).toBe('published');
        });
    });

    describe('Metadata & Extend', () => {
        it('should pass page metadata to components', async () => {
            const routes: RouteItem[] = [
                {
                    path: '/about',
                    control: () => new PageComponent('About'),
                    extend: {
                        title: 'About Us',
                        description: 'Learn more about us'
                    }
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/about');

            expect(app.router!.extend.title).toBe('About Us');
            expect(app.router!.extend.description).toBe('Learn more about us');
        });

        it('should merge metadata from parent to child', async () => {
            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: () => new PageComponent('AdminLayout'),
                    extend: { requiresAuth: true, layout: 'admin' },
                    childs: [
                        {
                            path: 'dashboard',
                            control: () => new PageComponent('Dashboard'),
                            extend: { title: 'Dashboard', icon: 'chart' }
                        }
                    ]
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/admin/dashboard');

            expect(app.router!.extend.requiresAuth).toBe(true);
            expect(app.router!.extend.layout).toBe('admin');
            expect(app.router!.extend.title).toBe('Dashboard');
            expect(app.router!.extend.icon).toBe('chart');
        });
    });

    describe('Error handling', () => {
        it('should handle 404 gracefully', async () => {
            const routes: RouteItem[] = [
                { path: '/home', control: () => new PageComponent('Home') }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/not-found');

            expect(app.router!.ok).toBe(false);
        });

        it('should handle validation failure', async () => {
            const routes: RouteItem[] = [
                {
                    path: '/restricted',
                    control: () => new PageComponent('Restricted'),
                    validate: () => false
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/restricted');

            expect(app.router!.ok).toBe(false);
        });
    });

    describe('Complex scenarios', () => {
        it('should handle SPA-like navigation flow', async () => {
            const routes: RouteItem[] = [
                { path: '/', control: () => new PageComponent('Home') },
                { path: '/login', control: () => new PageComponent('Login') },
                {
                    path: '/app',
                    control: () => new PageComponent('AppLayout'),
                    childs: [
                        { path: 'dashboard', control: () => new PageComponent('Dashboard') },
                        { path: 'profile', control: () => new PageComponent('Profile') },
                        { path: 'settings', control: () => new PageComponent('Settings') }
                    ]
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            // Navigation flow
            await module.navigate('/');
            expect(module.currentUri).toBe('/');

            await module.navigate('/login');
            expect(module.currentUri).toBe('/login');

            await module.navigate('/app/dashboard');
            expect(module.currentUri).toBe('/app/dashboard');

            await module.navigate('/app/profile');
            expect(module.currentUri).toBe('/app/profile');

            await module.navigate('/app/settings');
            expect(module.currentUri).toBe('/app/settings');
        });

        it('should handle breadcrumb generation from chain', async () => {
            const routes: RouteItem[] = [
                {
                    path: '/docs',
                    control: () => new PageComponent('DocsLayout'),
                    extend: { label: 'Documentation' },
                    childs: [
                        {
                            path: 'api',
                            control: () => new PageComponent('ApiDocs'),
                            extend: { label: 'API' },
                            childs: [
                                {
                                    path: 'routing',
                                    control: () => new PageComponent('RoutingDocs'),
                                    extend: { label: 'Routing' }
                                }
                            ]
                        }
                    ]
                }
            ];

            const app = createMockApp();
            const options: RouterOptions = { RouteItems: routes };
            const module = new UrlRoutingModule(options, app);

            const mainApp = new Component('div') as any;
            module.start(mainApp);

            await module.navigate('/docs/api/routing');

            const breadcrumbs = app.router!.chain;
            expect(breadcrumbs.length).toBe(3);
            expect(breadcrumbs[0]).toBe('/docs');
            expect(breadcrumbs[1]).toBe('api');
            expect(breadcrumbs[2]).toBe('routing');
        });
    });
});
