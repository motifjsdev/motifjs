import { Application, Component, RouterView } from '@motifx/core';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const waitFor = async (cond: () => boolean, timeout = 2000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

class Filters extends Component {
    constructor() {
        super('aside');
        (this.element as HTMLElement).textContent = 'Filters';
    }
}

class ReportsLayout extends Component {
    static made: ReportsLayout[] = [];
    constructor() {
        super('section');
        ReportsLayout.made.push(this);
        this.controls.add(new RouterView({} as any));
        this.controls.add(new RouterView({ name: 'side' } as any));
    }
}

test('another outlet built first does not stop a hidden layout from mounting into the named one', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    history.replaceState(null, '', '/reports/filters');
    let release!: () => void;
    const loaded = new Promise<void>(r => { release = r; });
    const app = Application.CreateBuilder().build();
    app.useRouter({
        mode: 'history',
        routes: [{
            path: '/reports',
            control: async () => { await loaded; return new ReportsLayout(); },
            childs: [{ path: '/filters', control: () => new Filters(), extend: { targetOutlet: 'side' } }],
        }],
    } as any);
    app.run(document.getElementById('app')!);
    await tick();
    app.getAppShell().controls.forEach((x: any) => x.motif.hide());
    release();
    await waitFor(() => ReportsLayout.made.length === 1);
    await tick(20);
    expect(ReportsLayout.made[0].isBuilt).toBe(false);

    app.getAppShell().controls.forEach((x: any) => x.motif.show());
    await waitFor(() => document.querySelector('#app section aside')?.textContent === 'Filters');
    expect(document.querySelectorAll('#app aside').length).toBe(1);
});
