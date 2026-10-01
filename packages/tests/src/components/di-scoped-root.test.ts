import { ServiceCollection } from '@motifx/core';

class Counter {
    static n = 0;
    id = ++Counter.n;
}

describe('scoped lifetime on the root provider', () => {
    test('root provider caches a scoped service like a root scope', () => {
        const services = new ServiceCollection();
        services.addScoped(Counter, Counter);
        const root = services.buildServiceProvider();

        const first = root.get<Counter>(Counter);
        expect(root.get<Counter>(Counter)).toBe(first);

        const child = root.createScope('child');
        const inChild = child.get<Counter>(Counter);
        expect(inChild).not.toBe(first);
        expect(child.get<Counter>(Counter)).toBe(inChild);
    });

    test('disposing the root provider clears its scoped cache', async () => {
        const services = new ServiceCollection();
        services.addScoped(Counter, Counter);
        const root = services.buildServiceProvider();
        const firstId = root.get<Counter>(Counter).id;
        await root.dispose();
        expect(root.get<Counter>(Counter).id).not.toBe(firstId);
    });

    test('the root provider returns one handle per scoped token and a created scope returns the instance', () => {
        const services = new ServiceCollection();
        services.addScoped(Counter, Counter);
        const root = services.buildServiceProvider();
        const handle = root.get<Counter>(Counter);
        expect(root.get<Counter>(Counter)).toBe(handle);
        expect(handle).toBeInstanceOf(Counter);

        const child = root.createScope('child');
        const instance = child.get<Counter>(Counter);
        expect(Object.getPrototypeOf(instance)).toBe(Counter.prototype);
        expect(instance.id).not.toBe(handle.id);
    });

    test('getAsync follows the same root scope cache', async () => {
        const services = new ServiceCollection();
        services.addScoped(Counter, { useFactory: async () => new Counter() });
        const root = services.buildServiceProvider();
        const a = await root.getAsync<Counter>(Counter);
        const b = await root.getAsync<Counter>(Counter);
        expect(a).toBe(b);
    });
});
