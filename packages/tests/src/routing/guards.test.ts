/**
 * Navigation Guards Tests
 * 
 * Global guards (useGuard) ve route lifecycle hooks testleri
 */

import { Application, ApplicationBuilder, Component } from '@motifx/core';
import { RouteItem } from '@motifx/core';

// Mock component factory
const createMockControl = _name => {
    return () => {
        const div = new Component('div');

        return div;
    };
};

describe('Navigation Guards', () => {
    let app: Application;
    let guardCalls: string[];

    beforeEach(() => {
        guardCalls = [];
        const builder = Application.CreateBuilder();
        app = builder.build();
    });

    afterEach(() => {
        try {
            app?.dispose();
        } catch { }
    });

    describe('Global beforeEach guards', () => {
        it('should run guard before navigation', async () => {
            const guard = jest.fn(({ to, from }, next) => {
                guardCalls.push(`guard: ${to.path}`);
                next();
            });

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl }
            ];

            app.useGuard(guard);
            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.navigate('/home');

            expect(guard).toHaveBeenCalled();
            expect(guardCalls).toContain('guard: /home');
        });

        it('should block navigation if guard does not call next', async () => {
            const blockGuard = ({ to, from }, next) => {
                // Don't call next() - block navigation
                guardCalls.push('blocked');
            };

            const routes: RouteItem[] = [
                { path: '/blocked', control: createMockControl }
            ];

            app.useGuard(blockGuard);
            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            const result = await app.navigate('/blocked') as any;

            expect(result.cancelled).toBe(true);
            expect(guardCalls).toContain('blocked');
        });

        it('should redirect to different path', async () => {
            const redirectGuard = ({ to, from }, next) => {
                if (to.path === '/private') {
                    guardCalls.push('redirect to /login');
                    next('/login');
                } else {
                    next();
                }
            };

            const routes: RouteItem[] = [
                { path: '/private', control: createMockControl },
                { path: '/login', control: createMockControl }
            ];

            app.useGuard(redirectGuard);
            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.navigate('/private');

            expect(app.router.uri).toBe('/login');
            expect(guardCalls).toContain('redirect to /login');
        });

        it('should run multiple guards in order', async () => {
            const guard1 = ({ to, from }, next) => {
                guardCalls.push('guard1');
                next();
            };

            const guard2 = ({ to, from }, next) => {
                guardCalls.push('guard2');
                next();
            };

            const routes: RouteItem[] = [
                { path: '/test', control: createMockControl }
            ];

            app.useGuard(guard1);
            app.useGuard(guard2);
            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.navigate('/test');

            // Initial load + explicit navigation => each guard runs twice in registration order
            expect(guardCalls).toEqual(['guard1', 'guard2', 'guard1', 'guard2']);
        });

        it('should stop at first guard that blocks', async () => {
            const guard1 = ({ to, from }, next) => {
                guardCalls.push('guard1');
                next();
            };

            const blockGuard = ({ to, from }, next) => {
                guardCalls.push('block');
                // Don't call next()
            };

            const guard3 = ({ to, from }, next) => {
                guardCalls.push('guard3');
                next();
            };

            const routes: RouteItem[] = [
                { path: '/test', control: createMockControl }
            ];

            app.useGuard(guard1);
            app.useGuard(blockGuard);
            app.useGuard(guard3);
            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.navigate('/test');
            // Initial load + explicit navigation => first two guards run twice; third never runs
            expect(guardCalls).toEqual(['guard1', 'block', 'guard1', 'block']);
            expect(guardCalls).not.toContain('guard3');
        });

        it('should pass route metadata to guards', async () => {
            let capturedMeta: any;

            const guard = ({ to, from }, next) => {
                capturedMeta = to.meta;
                next();
            };

            const routes: RouteItem[] = [
                {
                    path: '/admin',
                    control: createMockControl,
                    meta: { requiresAuth: true, role: 'admin' }
                }
            ];

            app.useGuard(guard);
            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.navigate('/admin');

            expect(capturedMeta.requiresAuth).toBe(true);
            expect(capturedMeta.role).toBe('admin');
        });

        it('should handle async guards', async () => {
            const asyncGuard = async ({ to, from }, next) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                guardCalls.push('async-guard');
                next();
            };

            const routes: RouteItem[] = [
                { path: '/test', control: createMockControl }
            ];

            app.useGuard(asyncGuard);
            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.navigate('/test');

            expect(guardCalls).toContain('async-guard');
        });
    });

    describe('Real-world guard scenarios', () => {
        it('should implement auth guard pattern', async () => {
            let isAuthenticated = false;

            const authGuard = ({ to, from }, next) => {
                if (to.meta.requiresAuth && !isAuthenticated) {
                    next('/login');
                } else {
                    next();
                }
            };

            const routes: RouteItem[] = [
                { path: '/login', control: createMockControl },
                {
                    path: '/dashboard',
                    control: createMockControl,
                    meta: { requiresAuth: true }
                }
            ];

            app.useGuard(authGuard);
            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            // Try to access protected route while not authenticated
            await app.navigate('/dashboard');
            expect(app.router.uri).toBe('/login');

            // Login and try again
            isAuthenticated = true;
            await app.navigate('/dashboard');
            expect(app.router.uri).toBe('/dashboard');
        });

        it('should implement analytics tracking', async () => {
            const pageViews: string[] = [];

            app.onRouterChanged((e) => {
                if (!e?.initial) pageViews.push(e!.uri);
            });

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl },
                { path: '/about', control: createMockControl },
                { path: '/contact', control: createMockControl }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.navigate('/home');
            await app.navigate('/about');
            await app.navigate('/contact');

            expect(pageViews).toEqual(['/home', '/about', '/contact']);
        });
    });
});
