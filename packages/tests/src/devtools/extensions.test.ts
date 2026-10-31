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
        expect(hook().inspect([0, 0, 0]).extensions).toEqual({ sortable: { items: 3 } });
        expect(hook().inspect([0, 0, 1]).extensions).toEqual({});
    });

    test('an extension that throws gives an error entry and does not disturb the rest', () => {
        register('broken', { describe: () => { throw new Error('nope'); }, inspect: () => { throw new Error('bad'); } });
        register('fine', { inspect: () => 1 });
        app.useDevelopment(true);
        run(new Component('div'));
        expect(hook().readExtension('broken')).toEqual({ error: 'nope' });
        expect(hook().inspect([0, 0, 0]).extensions).toEqual({ broken: { error: 'bad' }, fine: 1 });
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
        expect(h.pathOf(c)).toEqual([0, 0, 1]);
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

    test('readExtensionPanels gives the panels, the source settings without read and the command names', () => {
        register('history', {
            sources: { actions: { read: () => [], key: 'id', events: { 'action:end': 'upsert' }, max: 100 } },
            commands: { clear: () => true },
            panels: [{ id: 'actions', title: 'Actions', capabilities: { read: true } }]
        });
        app.useDevelopment(true);
        expect(hook().readExtensionPanels('history')).toEqual({
            ok: true,
            value: {
                panels: [{ id: 'actions', title: 'Actions', capabilities: { read: true } }],
                sources: { actions: { key: 'id', events: { 'action:end': 'upsert' }, max: 100 } },
                commands: ['clear']
            }
        });
        expect(hook().readExtensionPanels('missing')).toEqual({ ok: false, error: 'no extension' });
    });

    test('panels given as a function are asked again on every read', () => {
        let title = 'First';
        register('history', { panels: () => [{ id: 'main', title }] });
        register('broken', { panels: () => { throw new Error('nope'); } });
        app.useDevelopment(true);
        expect(hook().readExtensionPanels('history').value.panels[0].title).toBe('First');
        title = 'Second';
        expect(hook().readExtensionPanels('history').value.panels[0].title).toBe('Second');
        expect(hook().readExtensionPanels('broken')).toEqual({ ok: false, error: 'nope' });
    });

    test('a source is read only from a panel with read', async () => {
        register('history', {
            sources: { action: { read: (params: any) => Promise.resolve({ id: params.id }) } },
            panels: [{ id: 'list', title: 'List', capabilities: { read: true } }, { id: 'other', title: 'Other' }]
        });
        app.useDevelopment(true);
        expect(await hook().readExtensionSource('history', 'list', 'action', { id: 7 })).toEqual({ ok: true, value: { id: 7 } });
        expect(await hook().readExtensionSource('history', 'other', 'action', { id: 7 })).toEqual({ ok: false, error: 'not allowed' });
        expect(await hook().readExtensionSource('history', 'list', 'constructor', {})).toEqual({ ok: false, error: 'no source' });
    });

    test('a command runs only from a panel with write and its error comes back as a result', async () => {
        const calls: unknown[] = [];
        register('history', {
            commands: { replay: (args: unknown) => { calls.push(args); return 'done'; }, broken: () => { throw new Error('nope'); } },
            panels: [{ id: 'actions', title: 'Actions', capabilities: { write: true } }, { id: 'view', title: 'View', capabilities: { read: true } }]
        });
        app.useDevelopment(true);
        expect(await hook().callExtension('history', 'actions', 'replay', { id: 1 })).toEqual({ ok: true, value: 'done' });
        expect(await hook().callExtension('history', 'view', 'replay', { id: 2 })).toEqual({ ok: false, error: 'not allowed' });
        expect(await hook().callExtension('history', 'actions', 'toString', {})).toEqual({ ok: false, error: 'no command' });
        expect(await hook().callExtension('history', 'actions', 'broken', {})).toEqual({ ok: false, error: 'nope' });
        expect(calls).toEqual([{ id: 1 }]);
    });

    test('emit of an extension with panels is sent only when one of them subscribes', () => {
        const quiet = register('quiet', { panels: [{ id: 'main', title: 'Main', capabilities: { read: true } }] });
        const live = register('live', { panels: [{ id: 'main', title: 'Main', capabilities: { subscribe: true } }] });
        app.useDevelopment(true);
        const events: any[] = [];
        const off = hook().on((ev: any) => events.push(ev));
        quiet.emit('tick', 1);
        live.emit('tick', 2);
        off();
        expect(events).toEqual([{ type: 'ext:live:tick', payload: 2 }]);
    });

    test('registration, changes, reveal and dispose are published while devtools are on', () => {
        register('early', {});
        app.useDevelopment(true);
        const events: any[] = [];
        const off = hook().on((ev: any) => events.push(ev));
        const h = register('history', {});
        h.changed();
        h.changed('actions');
        h.reveal({ panel: 'actions', state: { actionId: 3 } });
        h.dispose();
        h.changed();
        off();
        expect(events).toEqual([
            { type: 'extension:registered', payload: { name: 'history' } },
            { type: 'extension:changed', payload: { name: 'history' } },
            { type: 'extension:changed', payload: { name: 'history', source: 'actions' } },
            { type: 'extension:reveal', payload: { name: 'history', target: { panel: 'actions', state: { actionId: 3 } } } },
            { type: 'extension:disposed', payload: { name: 'history' } }
        ]);
    });
});
