import { Application, Component } from '@motifx/core';

describe('Application.dispose resets the address', () => {
    const routes = [
        { path: '/', control: () => new Component('div') },
        { path: '/a', control: () => new Component('div') },
    ];

    test.each(['history', 'hash'] as const)('%s mode: back to / without a fragment or a new history entry', async (mode) => {
        const app = Application.CreateBuilder().build();
        app.useRouter({ routes, mode });
        app.run(document.createElement('div'));
        await app.navigate('/a');
        const entries = window.history.length;

        app.dispose();

        expect(window.location.href).toBe('http://localhost/');
        expect(window.history.length).toBe(entries);
    });
});
