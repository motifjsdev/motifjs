/**
 * @jest-environment jsdom
 */
import { Application, Component, ComponentBase, RouteItem } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

const countEnters = (c: ComponentBase) => {
    const t = c.motif.options.transition;
    const original = t.enterTransition;
    const counter = { value: 0 };
    t.enterTransition = (resolve: () => void) => { counter.value++; return original(resolve); };
    return counter;
};

describe('a single enter per insertion', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => cleanupTestContainer(container));

    test('a child added to a built parent enters once', async () => {
        const root = new Component('div');
        container.appendChild(root.element as Node);
        root.build();
        const child = new Component('div', { transition: 'fade' } as any);
        const enters = countEnters(child);
        root.controls.add(child);
        await Promise.resolve();
        await wait(0);

        expect(enters.value).toBe(1);
    });

    test('a child added to a built parent keeps its appear classes', async () => {
        const root = new Component('div');
        container.appendChild(root.element as Node);
        root.build();
        const child = new Component('div', {
            transition: { name: 'fx', appearFromClass: 'ap-from', appearActiveClass: 'ap-active', appearToClass: 'ap-to' }
        } as any);
        root.controls.add(child);
        await Promise.resolve();
        await Promise.resolve();

        const el = child.element as HTMLElement;
        expect(el.classList.contains('ap-active')).toBe(true);
        expect(el.classList.contains('fx-enter-active')).toBe(false);
    });

    test('a routed page enters once per navigation', async () => {
        const pages: { name: string; enters: { value: number } }[] = [];
        class Page extends Component {
            constructor(name: string) {
                super('section');
                this.motif.options.transition.classes = { name: 'pg', duration: 20 };
                pages.push({ name, enters: countEnters(this) });
            }
        }
        window.history.replaceState(null, '', '/');
        const app = Application.CreateBuilder().build();
        app.useRouter({
            routes: [
                { path: '/', control: () => new Page('root') },
                { path: '/a', control: () => new Page('a') },
            ] as RouteItem[],
            mode: 'history',
        });
        app.run(container);
        await wait(100);
        await app.navigate('/a');
        await wait(100);

        try {
            expect(pages.map(p => `${p.name}:${p.enters.value}`)).toEqual(['root:1', 'a:1']);
        } finally {
            app.dispose();
        }
    });
});
