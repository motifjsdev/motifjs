import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Application } from '@motifx/core';
import type { MotifDevtools, DevtoolsEvent } from '@motifx/core/devtools';

const KEYS: (keyof MotifDevtools)[] = [
    'version', 'coreVersion', 'on', 'isEnabled',
    'getTree', 'getElement', 'pathOfElement', 'inspect', 'getServices', 'getScopes', 'getCounters',
    'getWarnings', 'getErrors', 'getRoutes', 'getRoute', 'getNavigations', 'getStores',
    'getExtensions', 'readExtension', 'readValue', 'readStore', 'readService',
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
        expect(hook.version).toBe(2);
        const seen: DevtoolsEvent['type'][] = [];
        const off = hook.on(ev => { seen.push(ev.type); });
        off();
        expect(seen).toEqual([]);
        app.dispose();
    });

    test('coreVersion is the version of the core package', () => {
        const app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        const pkg = JSON.parse(readFileSync(join(__dirname, '../../../motifjs/package.json'), 'utf8'));
        expect((globalThis as any).__MOTIF_DEVTOOLS__.coreVersion).toBe(pkg.version);
        app.dispose();
    });
});
