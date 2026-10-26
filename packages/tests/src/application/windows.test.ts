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

    test('pip yoksa fallback none ile MJX419, varsayılanda popup açılır', async () => {
        expect(app.windows.supports('pip')).toBe(false);
        expect(await failure(() => app.windows.create({ kind: 'pip', fallback: 'none' }))).toBe('MJX419');
        const open = jest.spyOn(window, 'open').mockImplementation(() => frameWindow());
        try {
            const win = await app.windows.create({ kind: 'pip' });
            expect(win.kind).toBe('popup');
        } finally {
            open.mockRestore();
        }
    });

    test('pip varsa requestWindow ile açılır, reddedilirse popup penceresine düşer ya da MJX419 verir', async () => {
        const requestWindow = jest.fn((_opts: any) => Promise.resolve(frameWindow()));
        (window as any).documentPictureInPicture = { requestWindow };
        const open = jest.spyOn(window, 'open').mockImplementation(() => frameWindow());
        try {
            expect(app.windows.supports('pip')).toBe(true);
            const pip = await app.windows.open(b, { kind: 'pip', width: 500, height: 400 });
            expect(requestWindow).toHaveBeenCalledWith({ width: 500, height: 400 });
            expect(pip.kind).toBe('pip');
            expect(pip.components).toEqual([b]);
            expect(open).not.toHaveBeenCalled();
            requestWindow.mockImplementation(() => Promise.reject(new Error('no gesture')));
            const fallen = await app.windows.create({ kind: 'pip' });
            expect(fallen.kind).toBe('popup');
            expect(open).toHaveBeenCalledTimes(1);
            expect(await failure(() => app.windows.create({ kind: 'pip', fallback: 'none' }))).toBe('MJX419');
        } finally {
            open.mockRestore();
            delete (window as any).documentPictureInPicture;
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
        expect(() => app.windows.attach({} as any)).toThrow(/not a window/);
        const foreign = { get document(): Document { throw new DOMException('Blocked a frame with origin', 'SecurityError'); } };
        expect(await failure(() => app.windows.attach(foreign as any))).toBe('MJX421');
        expect(() => app.windows.attach(foreign as any)).toThrow(/another origin/);
        const win = app.windows.attach(frameWindow());
        const dead = new Component('li');
        await dead.dispose();
        expect(await failure(() => win.add(dead))).toBe('MJX422');
        await win.close();
        expect(await failure(() => win.add(b))).toBe('MJX420');
    });
});

describe('app.windows stilleri', () => {
    let app: Application;
    let root: Component;
    let item: Component;

    const sheets = (win: any) => Array.from(win.document.head.querySelectorAll('style, link')) as Element[];

    beforeEach(() => {
        document.head.innerHTML = '<style id="s1">.a{color:red}</style><link rel="stylesheet" href="/x.css">';
        document.documentElement.setAttribute('lang', 'tr');
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.className = 'root';
        document.body.className = 'page';
        app = Application.CreateBuilder().build();
        root = new Component('div');
        app.run(document.body.appendChild(document.createElement('div')), root);
        item = new Component('p');
        root.controls.add(item);
    });

    afterEach(async () => {
        await app.dispose();
        document.body.innerHTML = '';
        document.head.innerHTML = '';
        document.documentElement.removeAttribute('lang');
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.className = '';
        document.body.className = '';
        delete (document as any).adoptedStyleSheets;
    });

    test('once açılışta stil sayfalarını ve kök özniteliklerini kopyalar, sonrasını izlemez', async () => {
        const win = app.windows.attach(frameWindow(), { styles: 'once' });
        const copied = sheets(win);
        expect(copied.map(e => e.tagName)).toEqual(['STYLE', 'LINK']);
        expect(copied[0].textContent).toBe('.a{color:red}');
        expect(copied[1].getAttribute('href')).toBe('http://localhost/x.css');
        expect(win.document.documentElement.getAttribute('lang')).toBe('tr');
        expect(win.document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(win.document.documentElement.className).toBe('root');
        expect(win.document.body.className).toBe('page');
        document.body.appendChild(document.createElement('style')).textContent = '.late{}';
        document.documentElement.setAttribute('data-theme', 'light');
        await tick();
        expect(sheets(win).length).toBe(2);
        expect(win.document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    test('live varsayılandır: eklenen, değişen ve kaldırılan stil sayfaları ile kök öznitelikleri yansır', async () => {
        const win = app.windows.attach(frameWindow());
        const late = document.body.appendChild(document.createElement('style'));
        late.textContent = '.late{color:blue}';
        await tick();
        expect(sheets(win).map(e => e.textContent)).toContain('.late{color:blue}');
        late.textContent = '.late{color:green}';
        await tick();
        expect(sheets(win).map(e => e.textContent)).toContain('.late{color:green}');
        late.remove();
        await tick();
        expect(sheets(win).length).toBe(2);
        document.documentElement.setAttribute('data-theme', 'light');
        document.body.className = 'page dense';
        await tick();
        expect(win.document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(win.document.body.className).toBe('page dense');
        document.documentElement.removeAttribute('data-theme');
        await tick();
        expect(win.document.documentElement.hasAttribute('data-theme')).toBe(false);
    });

    test('son canlı pencere kapanınca gözlemciler bırakılır', async () => {
        const disconnect = jest.spyOn(MutationObserver.prototype, 'disconnect');
        try {
            const first = app.windows.attach(frameWindow());
            const second = app.windows.attach(frameWindow());
            await first.close();
            expect(disconnect).not.toHaveBeenCalled();
            await second.close();
            expect(disconnect).toHaveBeenCalledTimes(2);
        } finally {
            disconnect.mockRestore();
        }
    });

    test('none hiçbir şey kopyalamaz, fonksiyon pencerenin belgesiyle çağrılır', () => {
        const none = app.windows.attach(frameWindow(), { styles: 'none' });
        expect(sheets(none).length).toBe(0);
        expect(none.document.documentElement.hasAttribute('lang')).toBe(false);
        const seen: Document[] = [];
        const custom = app.windows.attach(frameWindow(), { styles: (doc) => { seen.push(doc); } });
        expect(seen).toEqual([custom.document]);
        expect(sheets(custom).length).toBe(0);
    });

    test('adoptedStyleSheets kurallarından yeniden kurulur ve syncStyles ile yenilenir', () => {
        let rules = [{ cssText: '.x{color:red}' }];
        Object.defineProperty(document, 'adoptedStyleSheets', { configurable: true, get: () => [{ cssRules: rules }] });
        const win = app.windows.attach(frameWindow(), { styles: 'once' });
        expect(sheets(win).map(e => e.textContent)).toContain('.x{color:red}');
        rules = [{ cssText: '.x{color:red}' }, { cssText: '.y{color:blue}' }];
        win.syncStyles();
        expect(sheets(win).map(e => e.textContent)).toContain('.x{color:red}\n.y{color:blue}');
        expect(sheets(win).length).toBe(3);
    });

    test('taşınan bileşenin kendi style etiketi ikinci kez kopyalanmaz', async () => {
        const styled = new Component('section');
        const inner = new Component('style');
        inner.setText('.inner{}');
        styled.controls.add(inner);
        root.controls.add(styled);
        const win = app.windows.attach(frameWindow());
        win.add(styled);
        await tick();
        expect(Array.from(win.document.querySelectorAll('style')).filter(s => s.textContent === '.inner{}').length).toBe(1);
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
