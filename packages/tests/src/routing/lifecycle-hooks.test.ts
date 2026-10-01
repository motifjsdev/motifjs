/**
 * Route Lifecycle Hooks Tests
 * 
 * RouteItem üzerindeki lifecycle hook'larını test eder:
 * - onEnter: Route yüklenirken tetiklenir
 * - onLeave: Route'tan ayrılırken tetiklenir (navigation'ı iptal edebilir)
 * - onUpdate: Aynı route, farklı parametreler
 */

import { Application, Component } from '@motifx/core';
import { RouteItem } from '@motifx/core';

const createMockControl = () => () => {
    const div = new Component('div');
    return div;
};

describe('Route Lifecycle Hooks', () => {
    let app: Application;

    beforeEach(() => {
        const builder = Application.CreateBuilder();
        app = builder.build();
    });

    afterEach(() => {
        try {
            app?.dispose();
        } catch { }
    });

    describe('onEnter hook', () => {
        it('should call onEnter when entering route', async () => {
            const onEnterSpy = jest.fn();

            const routes: RouteItem[] = [
                {
                    path: '/home',
                    control: createMockControl(),
                    onEnter: onEnterSpy
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home');

            expect(onEnterSpy).toHaveBeenCalled();
        });

        it('should receive route context in onEnter', async () => {
            let receivedContext: any = null;

            const routes: RouteItem[] = [
                {
                    path: '/user/{id}',
                    control: createMockControl(),
                    meta: { requiresAuth: true },
                    onEnter: (context) => {
                        receivedContext = context;
                    }
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/user/123');

            expect(receivedContext).toBeTruthy();
            expect(receivedContext.to.path).toBe('/user/123');
            expect(receivedContext.to.params.id).toBe('123');
            expect(receivedContext.to.meta.requiresAuth).toBe(true);
        });

        it('should support async onEnter', async () => {
            const callOrder: string[] = [];

            const routes: RouteItem[] = [
                {
                    path: '/home',
                    control: createMockControl(),
                    onEnter: async () => {
                        callOrder.push('enter-start');
                        await new Promise(resolve => setTimeout(resolve, 10));
                        callOrder.push('enter-end');
                    }
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            callOrder.push('navigate-start');
            await app.router.navigate('/home');
            callOrder.push('navigate-end');

            expect(callOrder).toEqual([
                'navigate-start',
                'enter-start',
                'enter-end',
                'navigate-end'
            ]);
        });
    });

    describe('onLeave hook', () => {
        it('should call onLeave when leaving route', async () => {
            const onLeaveSpy = jest.fn().mockReturnValue(true);

            const routes: RouteItem[] = [
                {
                    path: '/home',
                    control: createMockControl(),
                    onLeave: onLeaveSpy
                },
                { path: '/about', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home');
            expect(onLeaveSpy).not.toHaveBeenCalled();

            await app.router.navigate('/about');
            expect(onLeaveSpy).toHaveBeenCalled();
        });

        it('should cancel navigation if onLeave returns false', async () => {
            let currentPath = '';

            app.onRouterChanged((e) => {
                if (!e?.initial) currentPath = e!.uri;
            });

            const routes: RouteItem[] = [
                {
                    path: '/home',
                    control: createMockControl(),
                    onLeave: () => false // Block navigation
                },
                { path: '/about', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home');
            expect(currentPath).toBe('/home');

            await app.router.navigate('/about'); // Should be blocked
            expect(currentPath).toBe('/home'); // Still on home
        });

        it('should support async onLeave with cancellation', async () => {
            let currentPath = '';

            app.onRouterChanged((e) => {
                if (!e?.initial) currentPath = e!.uri;
            });

            const routes: RouteItem[] = [
                {
                    path: '/form',
                    control: createMockControl(),
                    onLeave: async () => {
                        // Simulate unsaved changes check
                        await new Promise(resolve => setTimeout(resolve, 10));
                        return false; // Block navigation
                    }
                },
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/form');
            expect(currentPath).toBe('/form');

            await app.router.navigate('/home'); // Should be blocked
            expect(currentPath).toBe('/form');
        });

        it('should receive context in onLeave', async () => {
            let leaveContext: any = null;

            const routes: RouteItem[] = [
                {
                    path: '/user/{id}',
                    control: createMockControl(),
                    meta: { type: 'profile' },
                    onLeave: (context) => {
                        leaveContext = context;
                        return true;
                    }
                },
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/user/123');
            await app.router.navigate('/home');

            expect(leaveContext).toBeTruthy();
            expect(leaveContext.from.path).toBe('/user/123');
            expect(leaveContext.from.params.id).toBe('123');
            expect(leaveContext.from.meta.type).toBe('profile');
            expect(leaveContext.to.path).toBe('/home');
        });
    });

    describe('onUpdate hook', () => {
        it('should call onUpdate when params change on same route', async () => {
            const onUpdateSpy = jest.fn();

            const routes: RouteItem[] = [
                {
                    path: '/user/{id}',
                    control: createMockControl(),
                    onUpdate: onUpdateSpy
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/user/123');
            expect(onUpdateSpy).not.toHaveBeenCalled();

            await app.router.navigate('/user/456'); // Same route, different param
            expect(onUpdateSpy).toHaveBeenCalled();
        });

        it('should receive old and new params in onUpdate', async () => {
            let updateContext: any = null;

            const routes: RouteItem[] = [
                {
                    path: '/user/{id}',
                    control: createMockControl(),
                    onUpdate: (context) => {
                        updateContext = context;
                    }
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/user/123');
            await app.router.navigate('/user/456');

            expect(updateContext).toBeTruthy();
            expect(updateContext.from.params.id).toBe('123');
            expect(updateContext.to.params.id).toBe('456');
        });

        it('should not call onUpdate when navigating to different route', async () => {
            const onUpdateSpy = jest.fn();

            const routes: RouteItem[] = [
                {
                    path: '/user/{id}',
                    control: createMockControl(),
                    onUpdate: onUpdateSpy
                },
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/user/123');
            await app.router.navigate('/home'); // Different route

            expect(onUpdateSpy).not.toHaveBeenCalled();
        });
    });

    describe('Hook execution order', () => {
        it('should execute hooks in correct order', async () => {
            const executionOrder: string[] = [];

            const routes: RouteItem[] = [
                {
                    path: '/home',
                    control: createMockControl(),
                    onEnter: () => { executionOrder.push('home-enter'); },
                    onLeave: () => {
                        executionOrder.push('home-leave');
                        return true;
                    }
                },
                {
                    path: '/about',
                    control: createMockControl(),
                    onEnter: () => { executionOrder.push('about-enter'); }
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home');
            await app.router.navigate('/about');

            expect(executionOrder).toEqual([
                'home-enter',
                'home-leave',
                'about-enter'
            ]);
        });

        it('should not call onEnter if onLeave blocks navigation', async () => {
            const executionOrder: string[] = [];

            const routes: RouteItem[] = [
                {
                    path: '/home',
                    control: createMockControl(),
                    onLeave: () => {
                        executionOrder.push('home-leave');
                        return false; // Block
                    }
                },
                {
                    path: '/about',
                    control: createMockControl(),
                    onEnter: () => { executionOrder.push('about-enter'); }
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home');
            await app.router.navigate('/about');

            expect(executionOrder).toEqual(['home-leave']);
            // about-enter should not be called because navigation was blocked
        });

        const paramChangeRoutes = (order: string[]): RouteItem[] => [
            {
                path: '/product/{id}',
                control: createMockControl(),
                onLeave: (ctx: any) => { order.push(`leave:${ctx.from?.params?.id}`); return true; },
                onUpdate: (ctx) => { order.push(`update:${ctx.from.params.id}>${ctx.to.params.id}`); },
                onEntering: (ctx) => { order.push(`entering:${ctx.params?.id}:${ctx.to?.params.id}`); },
                onShow: () => { order.push('show'); },
                onEnter: (ctx) => { order.push(`enter:${ctx.params?.id}`); }
            }
        ];

        it('should call onEntering after onUpdate when params change', async () => {
            const order: string[] = [];
            app.useRouter({ routes: paramChangeRoutes(order) });
            app.run(document.createElement('div'));

            await app.router.navigate('/product/1');
            expect(order).toEqual(['entering:1:1', 'show', 'enter:1']);

            order.length = 0;
            await app.router.navigate('/product/2');
            expect(order).toEqual(['leave:1', 'update:1>2', 'entering:2:2', 'show', 'enter:2']);
        });

        it('should call onEntering after onUpdate when params change in stack mode', async () => {
            const order: string[] = [];
            app.useRouter({ routes: paramChangeRoutes(order), stack: true });
            app.run(document.createElement('div'));

            await app.router.navigate('/product/1');
            order.length = 0;
            await app.router.navigate('/product/2');
            expect(order).toEqual(['leave:1', 'update:1>2', 'entering:2:2', 'show', 'enter:2']);
        });

        it('should not call onEntering or onUpdate when navigating to the same url', async () => {
            const order: string[] = [];
            app.useRouter({ routes: paramChangeRoutes(order) });
            app.run(document.createElement('div'));

            await app.router.navigate('/product/1');
            order.length = 0;
            await app.router.navigate('/product/1');
            expect(order.filter(x => x.startsWith('entering') || x.startsWith('update'))).toEqual([]);
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle form dirty state check', async () => {
            let isDirty = false;
            let navigatedAway = false;

            const routes: RouteItem[] = [
                {
                    path: '/edit',
                    control: createMockControl(),
                    onEnter: () => {
                        isDirty = false; // Reset on entry
                    },
                    onLeave: () => {
                        if (isDirty) {
                            // In real app, show confirmation dialog
                            return false; // Block navigation
                        }
                        return true;
                    }
                },
                {
                    path: '/home',
                    control: createMockControl(),
                    onEnter: () => {
                        navigatedAway = true;
                    }
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/edit');

            // Try to navigate without changes - should succeed
            await app.router.navigate('/home');
            expect(navigatedAway).toBe(true);

            // Reset and make form dirty
            navigatedAway = false;
            await app.router.navigate('/edit');
            isDirty = true; // Simulate user input

            // Try to navigate with unsaved changes - should block
            await app.router.navigate('/home');
            expect(navigatedAway).toBe(false);
        });

        it('should handle data prefetching in onEnter', async () => {
            let loadedData: any = null;

            const routes: RouteItem[] = [
                {
                    path: '/user/{id}',
                    control: createMockControl(),
                    onEnter: async ({ path, params }) => {
                        // Simulate API call
                        await new Promise(resolve => setTimeout(resolve, 10));
                        loadedData = {
                            id: params.id,
                            name: `User ${params.id}`
                        };
                    }
                }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/user/123');

            expect(loadedData).toEqual({
                id: '123',
                name: 'User 123'
            });
        });
    });
});
