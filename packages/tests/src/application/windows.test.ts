/**
 * @jest-environment jsdom
 */
import { Application, Component, ComponentBase, MotifError, RouteItem, effect } from '@motifx/core';

const tick = () => new Promise(r => setTimeout(r, 0));

function frameWindow(): Window {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentWindow!;
}

async function failure(run: () => any): Promise<string> {
    try { await run(); } catch (error) { return error instanceof MotifError ? error.code : String(error); }
    return '';
}

describe('app.windows', () => {
    let app: Application;
    let root: Component;
    let strip: Component;
    let a: Component;
    let b: Component;
    let c: Component;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        root = new Component('div');
        app.run(document.body.appendChild(document.createElement('div')), root);
        strip = new Component('ul');
        root.controls.add(strip);
        a = new Component('li');
        b = new Component('li');
        c = new Component('li');
        (a.element as Element).id = 'a';
        (b.element as Element).id = 'b';
        (c.element as Element).id = 'c';
        strip.controls.add(a, b, c);
    });

    const order = () => strip.controls.items.map(x => (x.element as Element).id);

    afterEach(async () => {
        await app.dispose();
        document.body.innerHTML = '';
    });

    test('attach hazır pencereye bileşeni taşır; liste, of ve olay güncellenir', () => {
        const opened: any[] = [];
        app.on('window-opened', (e: any) => opened.push(e.window));
        const win = app.windows.attach(frameWindow());
        win.add(b);
        expect(win.kind).toBe('attached');
        expect(win.isOpen).toBe(true);
        expect(win.components).toEqual([b]);
        expect((b.element as Node).ownerDocument).toBe(win.document);
        expect(win.document.body.contains(b.element as Node)).toBe(true);
        expect(b.parent).toBe(win.host);
        expect(order()).toEqual(['a', 'c']);
        expect(app.windows.list).toEqual([win]);
        expect(app.windows.of(b)).toBe(win);
        expect(opened).toEqual([win]);
    });

    test('open popup açar, özellik dizesini ve başlığı verir, bileşeni taşır', async () => {
        const target = frameWindow();
        const open = jest.spyOn(window, 'open').mockImplementation(() => target);
        try {
            const win = await app.windows.open(b, { title: 'Düzenleyici', width: 500, height: 400, left: 10 });
            expect(open).toHaveBeenCalledWith('', expect.stringMatching(/^motif-window-\d+$/), 'popup,width=500,height=400,left=10');
            expect(win.kind).toBe('popup');
            expect(win.window).toBe(target);
            expect(win.document.title).toBe('Düzenleyici');
            expect(win.components).toEqual([b]);
        } finally {
            open.mockRestore();
        }
    });

    test('ad verilmezse her pencere kendi adını alır, verilirse o kullanılır', async () => {
        const names: string[] = [];
        const open = jest.spyOn(window, 'open').mockImplementation((_u, name) => { names.push(String(name)); return frameWindow(); });
        try {
            await app.windows.create();
            await app.windows.create();
            await app.windows.create({ name: 'editor' });
            expect(names[0]).not.toBe(names[1]);
            expect(names[2]).toBe('editor');
        } finally {
            open.mockRestore();
        }
    });

    test('kapanınca içerik kökene eski sırasına döner ve sonuç bunu söyler', async () => {
        const closed: any[] = [];
        app.on('window-closed', (e: any) => closed.push(e.window));
        const win = app.windows.attach(frameWindow());
        win.add(b);
        const result = await win.close();
        expect(win.isOpen).toBe(false);
        expect(order()).toEqual(['a', 'b', 'c']);
        expect(root.element.contains(b.element as Node)).toBe(true);
        expect(result).toEqual({ returned: [b], disposed: [], kept: [] });
        expect(app.windows.list).toEqual([]);
        expect(app.windows.of(b)).toBeNull();
        expect(closed).toEqual([win]);
        await expect(win.closed).resolves.toBe(result);
    });

    test('sonraki kardeş gittiyse içerik sona döner', async () => {
        const win = app.windows.attach(frameWindow());
        win.add(b);
        strip.controls.remove(c);
        await win.close();
        expect(order()).toEqual(['a', 'b']);
    });

    test('release bileşeni eski yerine koyar, pencere açık kalır', () => {
        const win = app.windows.attach(frameWindow());
        win.add(a, b);
        expect(order()).toEqual(['c']);
        win.release(a);
        expect(order()).toEqual(['a', 'c']);
        expect(win.components).toEqual([b]);
        expect(app.windows.of(a)).toBeNull();
        expect(win.isOpen).toBe(true);
    });

    test('pencereler arası taşıma kökeni korur, boşalan pencere kapanır', async () => {
        const first = app.windows.attach(frameWindow());
        const second = app.windows.attach(frameWindow());
        first.add(b);
        second.add(b);
        expect(first.components).toEqual([]);
        expect(first.isOpen).toBe(false);
        expect(second.components).toEqual([b]);
        expect(app.windows.of(b)).toBe(second);
        await second.close();
        expect(order()).toEqual(['a', 'b', 'c']);
    });

    test('taşınan bileşen onDeactivated ve onActivated alır', async () => {
        const seen: string[] = [];
        class Row extends Component<HTMLLIElement> {
            constructor() { super('li'); }
            onDeactivated() { seen.push('out'); }
            onActivated() { seen.push('in'); }
        }
        const row = new Row();
        strip.controls.add(row);
        const win = app.windows.attach(frameWindow());
        win.add(row);
        expect(seen).toEqual(['out', 'in']);
        await win.close();
        expect(seen).toEqual(['out', 'in', 'out', 'in']);
    });

    test('kökeni kalmayan içerik varsayılan olarak serbest bırakılır', async () => {
        const win = app.windows.attach(frameWindow());
        win.add(b);
        await strip.dispose();
        expect(b.isDisposed).toBe(false);
        const result = await win.close();
        expect(result).toEqual({ returned: [], disposed: [b], kept: [] });
        expect(b.isDisposed).toBe(true);
    });

    test('orphans keep ile kökeni kalmayan içerik kopuk ve sağ kalır', async () => {
        const win = app.windows.attach(frameWindow(), { orphans: 'keep' });
        win.add(b);
        await strip.dispose();
        const result = await win.close();
        expect(result).toEqual({ returned: [], disposed: [], kept: [b] });
        expect(b.isDisposed).toBe(false);
        expect(b.parent).toBeNull();
        await b.dispose();
    });

    test('son bileşen serbest bırakılınca pencere kapanır, closeWhenEmpty false ile açık kalır', async () => {
        const win = app.windows.attach(frameWindow());
        win.add(b);
        await b.dispose();
        expect(win.components).toEqual([]);
        expect(win.isOpen).toBe(false);
        const kept = app.windows.attach(frameWindow(), { closeWhenEmpty: false });
        kept.add(c);
        await c.dispose();
        expect(kept.components).toEqual([]);
        expect(kept.isOpen).toBe(true);
    });

    test('sahip serbest bırakılınca pencere kapanır ve içerik döner', async () => {
        const owner = new Component('div');
        root.controls.add(owner);
        const win = app.windows.attach(frameWindow(), { owner });
        win.add(b);
        await owner.dispose();
        expect(win.isOpen).toBe(false);
        expect(order()).toEqual(['a', 'b', 'c']);
    });

    test('pencerenin pagehide olayı kapanış sayılır', () => {
        const win = app.windows.attach(frameWindow());
        win.add(b);
        win.window.dispatchEvent(new (win.window as any).Event('pagehide'));
        expect(win.isOpen).toBe(false);
        expect(order()).toEqual(['a', 'b', 'c']);
    });

    test('sayfanın pagehide olayı bütün pencereleri kapatır', () => {
        const win = app.windows.attach(frameWindow());
        win.add(b);
        window.dispatchEvent(new Event('pagehide'));
        expect(win.isOpen).toBe(false);
        expect(app.windows.list).toEqual([]);
    });

    test('app.dispose pencereleri kapatır ve içeriği serbest bırakır', async () => {
        const win = app.windows.attach(frameWindow());
        win.add(b);
        await app.dispose();
        expect(win.isOpen).toBe(false);
        expect(b.isDisposed).toBe(true);
    });

    test('closeAll açık pencerelerin hepsini kapatır', async () => {
        const first = app.windows.attach(frameWindow());
        const second = app.windows.attach(frameWindow());
        first.add(a);
        second.add(b);
        await app.windows.closeAll();
        expect(app.windows.list).toEqual([]);
        expect(order()).toEqual(['a', 'b', 'c']);
    });

    test('liste reaktiftir', async () => {
        let count = -1;
        const stop = effect(() => { count = app.windows.list.length; });
        try {
            expect(count).toBe(0);
            const win = app.windows.attach(frameWindow());
            await tick();
            expect(count).toBe(1);
            await win.close();
            await tick();
            expect(count).toBe(0);
        } finally {
            stop();
        }
    });

    test('pip istenip fallback none ise MJX419, varsayılanda popup açılır', async () => {
        expect(await failure(() => app.windows.create({ kind: 'pip', fallback: 'none' }))).toBe('MJX419');
        const open = jest.spyOn(window, 'open').mockImplementation(() => frameWindow());
        try {
            const win = await app.windows.create({ kind: 'pip' });
            expect(win.kind).toBe('popup');
        } finally {
            open.mockRestore();
        }
    });

    test('hatalar kendi kodlarıyla gelir', async () => {
        const open = jest.spyOn(window, 'open').mockImplementation(() => null);
        try {
            expect(await failure(() => app.windows.create())).toBe('MJX418');
        } finally {
            open.mockRestore();
        }
        expect(await failure(() => app.windows.attach({} as any))).toBe('MJX421');
        const win = app.windows.attach(frameWindow());
        const dead = new Component('li');
        await dead.dispose();
        expect(await failure(() => win.add(dead))).toBe('MJX422');
        await win.close();
        expect(await failure(() => win.add(b))).toBe('MJX420');
    });
});

describe('app.windows ve router', () => {
    let app: Application;
    let root: Component;

    const routes: RouteItem[] = [
        { path: '/a', control: () => new Component('div') },
        { path: '/b', control: () => new Component('div') },
    ];

    beforeEach(async () => {
        window.location.hash = '#/a';
        app = Application.CreateBuilder().build();
        app.useRouter({ routes, mode: 'hash' });
        root = new Component('div');
        app.run(document.body.appendChild(document.createElement('div')), root);
        await tick();
    });

    afterEach(async () => {
        await app.dispose();
        document.body.innerHTML = '';
        window.location.hash = '';
    });

    test('closeOnNavigate rota değişince pencereyi kapatır', async () => {
        const item = new Component('p');
        root.controls.add(item);
        const win = app.windows.attach(frameWindow(), { closeOnNavigate: true });
        win.add(item);
        await app.navigate('/b');
        await tick();
        expect(win.isOpen).toBe(false);
        expect(root.controls.items).toContain(item);
    });

    test('closeOnNavigate verilmezse rota değişince pencere açık kalır', async () => {
        const win = app.windows.attach(frameWindow());
        win.add(new Component('p'));
        await app.navigate('/b');
        await tick();
        expect(win.isOpen).toBe(true);
    });
});
