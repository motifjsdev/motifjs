/**
 * Navigation Options Tests
 * 
 * navigate() metodunun gelişmiş özelliklerini test eder:
 * - replace mode (replaceState vs pushState)
 * - state passing
 * - force navigation
 * - scroll behavior
 */

import { Application, Component } from '@motifx/core';
import { RouteItem } from '@motifx/core';

const createMockControl = () => () => {
    const div = new Component('div');
    return div;
};

describe('Navigation Options', () => {
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

    describe('Replace mode', () => {
        it('should use replaceState when replace option is true', async () => {
            const replaceStateSpy = jest.spyOn(window.history, 'replaceState');

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() },
                { path: '/about', control: createMockControl() }
            ];

            app.useRouter({ routes, mode: 'history' });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home', { replace: true });

            expect(replaceStateSpy).toHaveBeenCalled();

            replaceStateSpy.mockRestore();
        });

        it('should use pushState by default', async () => {
            const pushStateSpy = jest.spyOn(window.history, 'pushState');

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() },
                { path: '/about', control: createMockControl() }
            ];

            app.useRouter({ routes, mode: 'history' });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home');

            expect(pushStateSpy).toHaveBeenCalled();

            pushStateSpy.mockRestore();
        });
    });

    describe('State passing', () => {
        it('should pass state to history API', async () => {
            const pushStateSpy = jest.spyOn(window.history, 'pushState');

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes, mode: 'history' });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            const customState = { from: 'test', userId: 123 };
            await app.router.navigate('/home', { state: customState });

            expect(pushStateSpy).toHaveBeenCalledWith(
                expect.objectContaining(customState),
                expect.any(String),
                expect.any(String)
            );
            expect(window.history.state).toEqual(expect.objectContaining(customState));
            expect(app.router.state).toEqual(customState);

            pushStateSpy.mockRestore();
        });
    });

    describe('Force navigation', () => {
        it('should navigate to same route when force is true', async () => {
            let navigationCount = 0;

            app.onRouterChanged((e) => {
                if (!e?.initial) navigationCount++;
            });

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home');
            expect(navigationCount).toBe(1);

            await app.router.navigate('/home'); // Should skip
            expect(navigationCount).toBe(1);

            await app.router.navigate('/home', { force: true }); // Should navigate
            expect(navigationCount).toBe(2);
        });

        it('should skip navigation to same route by default', async () => {
            let navigations: string[] = [];

            app.onRouterChanged((e) => {
                if (!e?.initial) navigations.push(e!.uri);
            });

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home');
            await app.router.navigate('/home');
            await app.router.navigate('/home');

            expect(navigations).toEqual(['/home']); // Only once
        });
    });

    describe('Scroll behavior', () => {
        it('should scroll to top when scroll option is "top"', async () => {
            const scrollToSpy = jest.spyOn(window, 'scrollTo');

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home', { scroll: 'top' });

            expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });

            scrollToSpy.mockRestore();
        });

        it('should scroll smoothly when scroll option is "smooth"', async () => {
            const scrollToSpy = jest.spyOn(window, 'scrollTo');

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home', { scroll: 'smooth' });

            expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

            scrollToSpy.mockRestore();
        });

        it('should scroll to custom position', async () => {
            const scrollToSpy = jest.spyOn(window, 'scrollTo');

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home', {
                scroll: { top: 100, left: 50, behavior: 'smooth' }
            });

            expect(scrollToSpy).toHaveBeenCalledWith({
                top: 100,
                left: 50,
                behavior: 'smooth'
            });

            scrollToSpy.mockRestore();
        });
    });

    describe('Combined options', () => {
        it('should handle multiple options together', async () => {
            const replaceStateSpy = jest.spyOn(window.history, 'replaceState');
            const scrollToSpy = jest.spyOn(window, 'scrollTo');

            const routes: RouteItem[] = [
                { path: '/home', control: createMockControl() }
            ];

            app.useRouter({ routes, mode: 'history' });

            const mockHost = document.createElement('div');
            app.run(mockHost);

            await app.router.navigate('/home', {
                replace: true,
                state: { source: 'test' },
                scroll: 'top',
                force: true
            });

            expect(replaceStateSpy).toHaveBeenCalled();
            expect(scrollToSpy).toHaveBeenCalled();

            replaceStateSpy.mockRestore();
            scrollToSpy.mockRestore();
        });
    });
});
