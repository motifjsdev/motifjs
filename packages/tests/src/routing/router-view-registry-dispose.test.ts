/**
 * @jest-environment jsdom
 */
import { Application, Component, ComponentBase, motifComponent, RouteItem, RouterView } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

const sidebar = () => motifComponent('aside', (aside: ComponentBase) => aside.controls.add(motifComponent(RouterView, { name: 'sidebar' })));

class Shell extends Component {
    constructor() {
        super('div');
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

class MailLayout extends Component {
    constructor() {
        super('div');
        (this.element as HTMLElement).id = 'mail';
        this.controls.add(new RouterView({ name: 'default' }), sidebar());
    }
}

class SettingsLayout extends Component {
    constructor() {
        super('div');
        (this.element as HTMLElement).id = 'settings';
        this.controls.add(new RouterView({ name: 'default' }), sidebar());
    }
}

class AccountSection extends Component {
    constructor() {
        super('section');
        (this.element as HTMLElement).id = 'account';
        this.controls.add(new RouterView({ name: 'default' }));
    }
}

class InboxPage extends Component {
    constructor() {
        super('section');
        (this.element as HTMLElement).id = 'inbox';
    }
}

class FiltersPanel extends Component {
    constructor() {
        super('nav');
        (this.element as HTMLElement).id = 'filters';
    }
}

const routes: RouteItem[] = [
    { path: '/mail', control: MailLayout, childs: [{ path: '/inbox', control: InboxPage }] },
    {
        path: '/settings', control: SettingsLayout, childs: [
            {
                path: '/account', control: AccountSection, childs: [
                    { path: '/filters', control: FiltersPanel, extend: { targetOutlet: 'sidebar' } },
                ]
            },
        ]
    },
];

describe('named RouterView of a disposed layout', () => {
    let app: Application;
    let host: HTMLElement;

    const start = async (url: string) => {
        window.history.replaceState({}, '', url);
        app = Application.CreateBuilder().build();
        app.useRouter({ routes });
        app.run(host, new Shell());
        await tick();
    };

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        host.remove();
    });

    test('a route that targets the outlet by name is placed in the layout on screen after leaving another layout with that outlet', async () => {
        await start('/mail/inbox');
        expect(host.querySelector('#mail #inbox')).not.toBeNull();

        await app.router.navigate('/settings/account/filters');
        await tick();

        expect(host.querySelector('#mail')).toBeNull();
        expect(host.querySelector('#settings #account')).not.toBeNull();
        expect(host.querySelector('#settings aside #filters')).not.toBeNull();
    });

    test('a new app on the same page places the route in its own outlet after app.dispose()', async () => {
        await start('/mail/inbox');
        expect(host.querySelector('#mail #inbox')).not.toBeNull();
        await app.dispose();

        await start('/settings/account/filters');

        expect(host.querySelector('#settings aside #filters')).not.toBeNull();
    });
});
