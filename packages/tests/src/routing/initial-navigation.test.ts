/**
 * @jest-environment jsdom
 */

import { Application, ApplicationBuilder, Component } from '@motifx/core';
import { RouteItem } from '@motifx/core';

const createMockControl = id => {
  return () => {
    const div = new Component('div');
    (div.element as HTMLElement).id = id;
    return div;
  };
};

describe('Initial Navigation (First Load)', () => {
  let app: Application;
  let guardCalls: any[] = [];

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

  describe('Guards on initial load', () => {
    it('should run useGuard (beforeEach) on app.run (initial load)', async () => {
      // Arrange
      let guardRan = false;
      let guardContext: any = null;

      const routes: RouteItem[] = [
        {
          path: '/',
          name: 'home',
          control: createMockControl('home'),
        },
      ];

      const guard = jest.fn(({ to, from }, next) => {
        guardRan = true;
        guardContext = { to, from };
        guardCalls.push({ to: to?.path, from: from?.path });
        next();
      });

      app.useGuard(guard);
      app.useRouter({ routes });

      // Act - app.run triggers initial navigation to /
      const mockHost = document.createElement('div');
      app.run(mockHost);
      
      // Wait for async navigation
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(guardRan).toBe(true);
      expect(guardContext).not.toBeNull();
      expect(guardContext.to.path).toBe('/');
      expect(guardContext.from).toBeNull(); // No previous route on initial load
      expect(guardCalls).toHaveLength(1);
      expect(guard).toHaveBeenCalledTimes(1);
    });

    it('should be able to block initial navigation with guard (auth redirect)', async () => {
      // Arrange
      const routes: RouteItem[] = [
        {
          path: '/',
          name: 'home',
          meta: { requiresAuth: true },
          control: createMockControl('home-page'),
        },
        {
          path: '/login',
          name: 'login',
          control: createMockControl('login-page'),
        },
      ];

      const guard = jest.fn(({ to, from }, next) => {
        guardCalls.push({ to: to?.path, from: from?.path });
        if (to?.meta?.requiresAuth) {
          next('/login'); // Redirect to login
        } else {
          next();
        }
      });

      app.useGuard(guard);
      app.useRouter({ routes });

      // Act
      const mockHost = document.createElement('div');
      app.run(mockHost);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(guardCalls.length).toBeGreaterThanOrEqual(1);
      expect(guardCalls[0].to).toBe('/');
      expect(guardCalls[0].from).toBeUndefined(); // No previous route on initial load (can be undefined or null)
      const loginEl = mockHost.querySelector('#login-page');
      const homeEl = mockHost.querySelector('#home-page');
      expect(loginEl).toBeTruthy();
      expect(homeEl).toBeFalsy();
    });

    it('should run multiple guards in order on initial load', async () => {
      // Arrange
      const executionOrder: string[] = [];

      const routes: RouteItem[] = [
        {
          path: '/',
          name: 'home',
          control: createMockControl('home'),
        },
      ];

      app.useGuard(({ to, from }, next) => {
        executionOrder.push('guard-1');
        next();
      });

      app.useGuard(({ to, from }, next) => {
        executionOrder.push('guard-2');
        next();
      });

      app.useGuard(({ to, from }, next) => {
        executionOrder.push('guard-3');
        next();
      });

      app.useRouter({ routes });

      // Act
      const mockHost = document.createElement('div');
      app.run(mockHost);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(executionOrder).toEqual(['guard-1', 'guard-2', 'guard-3']);
    });

    it('should pass route metadata to guards on initial load', async () => {
      // Arrange
      let receivedMeta: any = null;

      const routes: RouteItem[] = [
        {
          path: '/',
          name: 'home',
          meta: { requiresAuth: true, roles: ['admin'] },
          control: createMockControl('home'),
        },
      ];

      app.useGuard(({ to, from }, next) => {
        receivedMeta = to?.meta;
        next();
      });

      app.useRouter({ routes });

      // Act
      const mockHost = document.createElement('div');
      app.run(mockHost);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert
      expect(receivedMeta).toEqual({ requiresAuth: true, roles: ['admin'] });
    });
  });

  describe('Real-world auth scenario', () => {
    it('should redirect to login if user not authenticated on initial load', async () => {
      // Arrange
      let isAuthenticated = false;

      const routes: RouteItem[] = [
        {
          path: '/',
          name: 'home',
          meta: { requiresAuth: true },
          control: createMockControl('home'),
        },
        {
          path: '/login',
          name: 'login',
          control: createMockControl('login'),
        },
      ];

      // Auth guard
      app.useGuard(({ to, from }, next) => {
        if (to?.meta?.requiresAuth && !isAuthenticated) {
          next('/login');
        } else {
          next();
        }
      });

      app.useRouter({ routes });

      // Act
      const mockHost = document.createElement('div');
      app.run(mockHost);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      const loginEl = mockHost.querySelector('#login');
      const homeEl = mockHost.querySelector('#home');
      expect(loginEl).toBeTruthy();
      expect(homeEl).toBeFalsy();
    });

    it('should allow access if user authenticated on initial load', async () => {
      // Arrange
      let isAuthenticated = true;

      const routes: RouteItem[] = [
        {
          path: '/',
          name: 'home',
          meta: { requiresAuth: true },
          control: createMockControl('home'),
        },
        {
          path: '/login',
          name: 'login',
          control: createMockControl('login'),
        },
      ];

      // Auth guard
      app.useGuard(({ to, from }, next) => {
        if (to?.meta?.requiresAuth && !isAuthenticated) {
          next('/login');
        } else {
          next();
        }
      });

      app.useRouter({ routes });

      // Act
      const mockHost = document.createElement('div');
      app.run(mockHost);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      const homeEl = mockHost.querySelector('#home');
      const loginEl = mockHost.querySelector('#login');
      expect(homeEl).toBeTruthy();
      expect(loginEl).toBeFalsy();
    });

    it('should run guards with async operations on initial load', async () => {
      // Arrange
      const asyncCheckUser = async () => {
        return new Promise<boolean>(resolve => {
          setTimeout(() => resolve(false), 10); // Simulate API call
        });
      };

      const routes: RouteItem[] = [
        {
          path: '/',
          name: 'home',
          meta: { requiresAuth: true },
          control: createMockControl('home'),
        },
        {
          path: '/login',
          name: 'login',
          control: createMockControl('login'),
        },
      ];

      // Async auth guard
      app.useGuard(async ({ to, from }, next) => {
        if (to?.meta?.requiresAuth) {
          const isAuth = await asyncCheckUser();
          if (!isAuth) {
            next('/login');
          } else {
            next();
          }
        } else {
          next();
        }
      });

      app.useRouter({ routes });

      // Act
      const mockHost = document.createElement('div');
      app.run(mockHost);
      await new Promise(resolve => setTimeout(resolve, 150));

      // Assert
      const loginEl = mockHost.querySelector('#login');
      const homeEl = mockHost.querySelector('#home');
      expect(loginEl).toBeTruthy();
      expect(homeEl).toBeFalsy();
    });
  });
});
