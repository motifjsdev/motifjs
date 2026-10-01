import { Application, Component, ComponentBase } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

describe('keepAlive activation reaches the whole subtree', () => {
    test('page and nested child each get one deactivated and one activated', async () => {
        const log: string[] = [];
        const track = (c: ComponentBase, tag: string) => {
            c.motif.on('x:activated' as any, () => log.push(`${tag}:activated`));
            c.motif.on('x:deactivated' as any, () => log.push(`${tag}:deactivated`));
        };
        class Page extends Component {
            constructor() {
                super('section');
                const child = new Component('div');
                const inner = new Component('span');
                child.controls.add(inner);
                this.controls.add(child);
                track(this, 'page');
                track(child, 'child');
                track(inner, 'inner');
            }
        }
        window.history.replaceState({}, '', '/k');
        const app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({
            routes: [
                { path: '/k', control: () => new Page(), keepAlive: true },
                { path: '/o', control: () => new Component('div') },
            ]
        });
        app.run(host);
        await tick();
        await app.router.navigate('/o');
        await tick();
        expect(log).toEqual(['page:deactivated', 'child:deactivated', 'inner:deactivated']);
        await app.router.navigate('/k');
        await tick();
        expect(log).toEqual([
            'page:deactivated', 'child:deactivated', 'inner:deactivated',
            'page:activated', 'child:activated', 'inner:activated',
        ]);
        try { app.dispose(); } catch { }
        host.remove();
    });
});
