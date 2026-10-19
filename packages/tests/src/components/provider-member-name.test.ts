/**
 * @jest-environment jsdom
 */
import { Application, Component, ComponentBase, ServiceProvider, motifComponent } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

class SessionService {
    static created = 0;
    id = ++SessionService.created;
}

class AccountBadge extends Component<HTMLElement, { place: string }> {
    static seen: Record<string, SessionService | null> = {};
    constructor(props: { place: string }) {
        super('aside', props);
    }
    onBuilt() {
        AccountBadge.seen[this.props.place] = this.getService(SessionService);
    }
}

class CheckoutPanel extends Component {
    provider = 'stripe';
    constructor() {
        super('section');
    }
    view() {
        return motifComponent(AccountBadge, { place: 'checkout' });
    }
}

const LoginForm = () => ({
    el: 'form',
    provider: { name: 'GitHub', scope: 'read:user' },
    view() {
        return motifComponent(AccountBadge, { place: 'login' });
    },
});

class RegionPanel extends Component {
    provider: ServiceProvider;
    constructor(scope: ServiceProvider) {
        super('section');
        this.provider = scope;
    }
    view() {
        return motifComponent(AccountBadge, { place: 'region' });
    }
}

describe('a component member named provider', () => {
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        SessionService.created = 0;
        AccountBadge.seen = {};
        const builder = Application.CreateBuilder();
        builder.services.addScoped(SessionService, SessionService);
        app = builder.build();
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(async () => {
        await app.dispose();
        host.remove();
    });

    test('a class component with provider = "stripe" and its children resolve the application services', async () => {
        const panel = new CheckoutPanel();
        app.run(host, panel);
        await tick();
        expect(AccountBadge.seen.checkout).toBeInstanceOf(SessionService);
        expect(panel.getService(SessionService)).toBeInstanceOf(SessionService);
        expect(panel.serviceProvider).toBe(app.provider);
        expect(panel.provider).toBe('stripe');
    });

    test('an Options component with a provider key and its children resolve the application services', async () => {
        const form = motifComponent(LoginForm);
        app.run(host, form);
        await tick();
        expect(AccountBadge.seen.login).toBeInstanceOf(SessionService);
        expect(form.getService(SessionService)).toBeInstanceOf(SessionService);
        expect(form.serviceProvider).toBe(app.provider);
        expect(form.provider).toEqual({ name: 'GitHub', scope: 'read:user' });
    });

    test('a ServiceProvider stored in provider still serves the subtree below it', async () => {
        const scope = app.provider.createScope('region');
        const region = new RegionPanel(scope);
        const shell = motifComponent('main', (main: ComponentBase) => main.controls.add(motifComponent(AccountBadge, { place: 'shell' }), region));
        app.run(host, shell);
        await tick();
        expect(region.serviceProvider).toBe(scope);
        expect(AccountBadge.seen.region.id).toBe(scope.get<SessionService>(SessionService).id);
        expect(AccountBadge.seen.shell.id).not.toBe(AccountBadge.seen.region.id);
    });
});
