/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';
import { registerDevtools } from '@motifx/core/devtools';

describe('devtools extensions', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;
    const handles: { dispose(): void }[] = [];

    beforeEach(() => {
        window.history.replaceState({}, '', '/');
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
    });

    afterEach(async () => {
        for (const h of handles.splice(0)) h.dispose();
        app.useDevelopment(false);
        await app.dispose();
        host.remove();
        delete (globalThis as any).__MOTIF_DEV__;
    });

    function run(...children: Component[]) {
        const root = new Component('main');
        root.controls.add(...children);
        app.run(host, root);
        return root;
    }

    const register = (name: string, ext: any) => {
        const h = registerDevtools(name, ext);
        handles.push(h);
        return h;
    };

    test('a registration made while devtools are off is listed once they are on', () => {
        register('sortable', { describe: () => ({ lists: 2 }) });
        app.useDevelopment(true);
        expect(hook().getExtensions()).toContain('sortable');
        expect(hook().readExtension('sortable')).toEqual({ lists: 2 });
    });

    test('inspect carries the data of extensions that know the component', () => {
        const known = new Component('ul');
        const other = new Component('p');
        register('sortable', { inspect: (c: object) => c === known ? { items: 3 } : undefined });
        app.useDevelopment(true);
        run(known, other);
        expect(hook().inspect([0, 0]).extensions).toEqual({ sortable: { items: 3 } });
        expect(hook().inspect([0, 1]).extensions).toEqual({});
    });

    test('an extension that throws gives an error entry and does not disturb the rest', () => {
        register('broken', { describe: () => { throw new Error('nope'); }, inspect: () => { throw new Error('bad'); } });
        register('fine', { inspect: () => 1 });
        app.useDevelopment(true);
        run(new Component('div'));
        expect(hook().readExtension('broken')).toEqual({ error: 'nope' });
        expect(hook().inspect([0, 0]).extensions).toEqual({ broken: { error: 'bad' }, fine: 1 });
    });

    test('emit publishes a namespaced event only while devtools are on', () => {
        const h = register('chart', {});
        h.emit('draw', { n: 1 });
        app.useDevelopment(true);
        const events: any[] = [];
        const off = hook().on((ev: any) => events.push(ev));
        h.emit('draw', { n: 2 });
        off();
        expect(events).toEqual([{ type: 'ext:chart:draw', payload: { n: 2 } }]);
    });

    test('pathOf gives the devtools path of a component', () => {
        const h = register('chart', {});
        const c = new Component('canvas');
        app.useDevelopment(true);
        run(new Component('header'), c);
        expect(h.pathOf(c)).toEqual([0, 1]);
    });

    test('dispose removes the registration but not a newer one under the same name', () => {
        app.useDevelopment(true);
        const first = register('same', { describe: () => 'first' });
        first.dispose();
        expect(hook().getExtensions()).not.toContain('same');
        const again = register('same', { describe: () => 'again' });
        register('same', { describe: () => 'newest' });
        again.dispose();
        expect(hook().readExtension('same')).toBe('newest');
    });
});
