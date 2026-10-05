/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Application, Component, RouteItem, reactive } from '@motifx/core';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function evalJsx(source: string, exportName: string, extra: Record<string, any> = {}) {
    let code: string = new CompilerCtor().start(source, 'RT.tsx').code;
    code = code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportName};`)(...values);
}

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

const s = reactive({ items: [1, 2, 3, 4, 5] });
const Page = evalJsx(`class Page extends Component { constructor(){ super('section'); } view(){ return <ul>{s.items.map(i => <li key={i}>{i}</li>)}</ul>; } }`, 'Page', { s });
const Layout = evalJsx(`class Layout extends Component { constructor(){ super('main'); } view(){ return <div><RouterView /></div>; } }`, 'Layout', { RouterView: (motif as any).RouterView });

const built = new Set<any>();
const originalBuild = (motif as any).ComponentBase.prototype.build;

beforeAll(() => {
    (motif as any).ComponentBase.prototype.build = function (this: any, ...args: any[]) {
        built.add(this);
        return originalBuild.apply(this, args);
    };
});

afterAll(() => {
    (motif as any).ComponentBase.prototype.build = originalBuild;
});

beforeEach(() => { built.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

const alive = () => [...built].filter(c => !c.isDisposed).length;

function start(host: HTMLElement, routes: RouteItem[], appRoot?: Component) {
    window.history.replaceState({}, '', '/');
    const app = Application.CreateBuilder().build();
    app.useRouter({ routes });
    app.run(host, appRoot);
    return app;
}

function newHost() {
    const host = document.createElement('div');
    host.id = 'app';
    document.body.appendChild(host);
    return host;
}

describe('app.dispose()', () => {
    test.each([
        ['a flat route', [{ path: '/', control: Page }]],
        ['a layout with a child route', [{ path: '/', control: Layout, childs: [{ path: '/', control: Page }] }]],
    ])('awaiting it disposes the whole tree of %s and keeps the host element', async (_, routes) => {
        const host = newHost();
        const app = start(host, routes as RouteItem[]);
        await tick(30);
        expect(alive()).toBeGreaterThan(5);
        await app.dispose();
        expect(alive()).toBe(0);
        expect(document.body.contains(host)).toBe(true);
        expect(host.childNodes.length).toBe(0);
    });

    test('run → dispose on the same host does not leak across cycles', async () => {
        const host = newHost();
        for (let i = 0; i < 5; i++) {
            const app = start(host, [{ path: '/', control: Page }]);
            await tick(30);
            expect(host.querySelectorAll('li').length).toBe(5);
            await app.dispose();
            expect(alive()).toBe(0);
        }
        expect(document.body.contains(host)).toBe(true);
    });

    test('without await the tree is still disposed shortly after', async () => {
        const host = newHost();
        const app = start(host, [{ path: '/', control: Page }]);
        await tick(30);
        void app.dispose();
        await tick(30);
        expect(alive()).toBe(0);
        expect(document.body.contains(host)).toBe(true);
    });

    test('a new run() on the same host right after a dispose that is not awaited is left intact', async () => {
        const host = newHost();
        const first = start(host, [{ path: '/', control: Page }]);
        await tick(30);
        void first.dispose();
        const second = start(host, [{ path: '/', control: Page }]);
        await tick(60);
        expect(host.querySelectorAll('li').length).toBe(5);
        expect(second.getAppShell().isDisposed).toBe(false);
        await second.dispose();
        expect(alive()).toBe(0);
    });

    test('a root passed to run() is disposed with the app', async () => {
        const host = newHost();
        const root = new Component('div');
        const app = start(host, [{ path: '/', control: Page }], root);
        await tick(30);
        await app.dispose();
        expect(root.isDisposed).toBe(true);
        expect(document.body.contains(host)).toBe(true);
    });
});
