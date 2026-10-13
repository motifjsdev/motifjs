import { Application } from '@motifx/core';
import type { MotifDevtools, DevtoolsEvent } from '@motifx/core/devtools';

const KEYS: (keyof MotifDevtools)[] = [
    'version', 'on', 'isEnabled',
    'getTree', 'getElement', 'pathOfElement', 'inspect', 'getServices', 'getCounters',
    'getWarnings', 'getErrors', 'getRoutes', 'getRoute', 'getNavigations', 'getStores',
    'getExtensions', 'readExtension',
    'setClass', 'setAttribute', 'setVisible', 'writeModel', 'setProp', 'navigate', 'setStoreValue',
];

describe('devtools contract type', () => {
    afterEach(() => {
        const app = Application.CreateBuilder().build();
        app.useDevelopment(false);
        app.dispose();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    test('the object on __MOTIF_DEVTOOLS__ has exactly the members of MotifDevtools', () => {
        const app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        const hook = (globalThis as any).__MOTIF_DEVTOOLS__ as MotifDevtools;
        expect(Object.keys(hook).sort()).toEqual([...KEYS].sort());
        expect(hook.version).toBe(1);
        const seen: DevtoolsEvent['type'][] = [];
        const off = hook.on(ev => { seen.push(ev.type); });
        off();
        expect(seen).toEqual([]);
        app.dispose();
    });
});
