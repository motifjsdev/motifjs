import { Application, Component, RouterView } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const waitFor = async (cond: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

class SignIn extends Component {
    constructor() {
        super('h1');
        (this.element as HTMLElement).textContent = 'Sign in';
    }
}

class AccountLayout extends Component {
    static made: AccountLayout[] = [];
    constructor() {
        super('section');
        AccountLayout.made.push(this);
        this.controls.add(new RouterView({} as any));
    }
}

test('a layout that arrives under a hidden shell mounts its child route when the shell is shown', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    history.replaceState(null, '', '/account/sign-in');
    let release!: () => void;
    const loaded = new Promise<void>(r => { release = r; });
    const app = Application.CreateBuilder().build();
    app.useRouter({
        mode: 'history',
        routes: [{
            path: '/account',
            control: async () => { await loaded; return new AccountLayout(); },
            childs: [{ path: '/sign-in', control: () => new SignIn() }],
        }],
    } as any);
    app.run(document.getElementById('app')!);
    await tick();
    app.getAppShell().controls.forEach((x: any) => x.motif.hide());
    release();
    await waitFor(() => AccountLayout.made.length === 1);
    await tick(20);
    expect(AccountLayout.made[0].isBuilt).toBe(false);

    app.getAppShell().controls.forEach((x: any) => x.motif.show());
    await waitFor(() => document.querySelector('#app section h1')?.textContent === 'Sign in');
    expect(document.querySelectorAll('#app h1').length).toBe(1);
});
