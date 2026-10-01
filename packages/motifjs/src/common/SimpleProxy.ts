export function createSimpleProxy(params: any, callback: any) {
    const computedCache = new Map();

    return new Proxy(params as any, {
        get: (target, property, receiver) => {
            if (typeof property === 'string' && property.startsWith('$')) {
                const computedKey = property.substring(1);
                return computedCache.get(computedKey);
            }

            return Reflect.get(target, property, receiver);
        },
        set: (target, property, value, receiver) => {
            computedCache.clear();

            const oldValue = target[property];
            const result = Reflect.set(target, property, value, receiver);

            if (oldValue !== value) {
                callback(property as string, value, oldValue);
            }

            return result;
        }
    });
}