import { Application, Component, RouteItem } from '@motifx/core';

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const settle = () => tick(260);

const waitFor = async (cond: () => boolean, timeout = 3000) => {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > timeout) throw new Error('waitFor timeout');
        await new Promise(r => setTimeout(r, 5));
    }
};

function otherDocument(): Document {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentDocument!;
}

describe('bağlı belgedeki router bağlantıları', () => {
    let app: Application;
    let host: HTMLElement;
    let other: Document;

    const routes: RouteItem[] = [
        { path: '/a', control: () => new Component('div') },
        { path: '/b', control: () => new Component('div') },
    ];

    beforeEach(async () => {
        window.history.replaceState({}, '', '/a');
        app = Application.CreateBuilder().build();
        host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes, mode: 'history' });
        app.run(host);
        other = otherDocument();
        await tick();
    });

    afterEach(async () => {
        try { await app?.dispose(); } catch { }
        document.body.innerHTML = '';
        window.history.replaceState({}, '', '/');
    });

    async function clickIn(doc: Document, href = '/b'): Promise<boolean> {
        const a = doc.createElement('a');
        a.setAttribute('rel', 'router');
        a.setAttribute('href', href);
        const label = doc.createElement('span');
        label.textContent = 'Siparişler';
        a.appendChild(label);
        doc.body.appendChild(a);
        const ev = new (doc.defaultView as any).MouseEvent('click', { bubbles: true, cancelable: true });
        label.dispatchEvent(ev);
        await tick();
        a.remove();
        return ev.defaultPrevented;
    }

    test('bağlı belgedeki rel="router" bağlantısı sayfanın router\'ını gezdirir', async () => {
        app.connectDocument(other);
        expect(await clickIn(other)).toBe(true);
        expect(app.router.uri).toBe('/b');
        expect(window.location.pathname).toBe('/b');
    });

    test('bağlanmamış belgedeki bağlantı tarayıcıya kalır', async () => {
        expect(await clickIn(other)).toBe(false);
        expect(app.router.uri).toBe('/a');
    });

    test('belge koparılınca bağlantı artık yakalanmaz', async () => {
        const off = app.connectDocument(other);
        off();
        expect(await clickIn(other)).toBe(false);
        expect(app.router.uri).toBe('/a');
    });

    test('router yeniden başlatılınca bağlı belge yakalanmaya devam eder', async () => {
        app.connectDocument(other);
        await app.restartRouter();
        await tick();
        expect(await clickIn(other)).toBe(true);
        expect(app.router.uri).toBe('/b');
    });

    test('sayfadaki bağlantı eskisi gibi yakalanır, svg bağlantısı yakalanmaz', async () => {
        expect(await clickIn(document)).toBe(true);
        expect(app.router.uri).toBe('/b');
        const svgLink = document.createElementNS('http://www.w3.org/2000/svg', 'a');
        svgLink.setAttribute('rel', 'router');
        svgLink.setAttribute('href', '/a');
        document.body.appendChild(svgLink);
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        svgLink.dispatchEvent(ev);
        await tick();
        expect(ev.defaultPrevented).toBe(false);
        expect(app.router.uri).toBe('/b');
    });

    test('uygulama serbest bırakılınca bağlı belgedeki tıklama dinleyicisi kalkar', async () => {
        app.connectDocument(other);
        const removed = jest.spyOn(other, 'removeEventListener');
        await app.dispose();
        expect(removed.mock.calls.some(args => args[0] === 'click')).toBe(true);
    });
});

describe('bağlı belgede başlayan geri kaydırma', () => {
    class Page extends Component {
        constructor(name: string) {
            super('section');
            (this.element as HTMLElement).id = `page-${name}`;
        }
    }
    const routes = (): RouteItem[] => [
        { path: '/a', control: () => new Page('a') },
        { path: '/b', control: () => new Page('b') },
    ];

    let app: Application;
    let host: HTMLElement;
    let other: Document;
    let popCount = 0;
    const onPop = () => { popCount++; };

    const touch = (doc: Document, type: string, x: number) => {
        const ev: any = new (doc.defaultView as any).Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: 100 }] });
        doc.dispatchEvent(ev);
    };

    beforeEach(async () => {
        popCount = 0;
        sessionStorage.clear();
        window.history.replaceState(null, '', '/');
        window.addEventListener('popstate', onPop);
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useRouter({ routes: routes(), mode: 'history', stack: { retain: true, swipeBack: true } });
        app.run(host);
        await settle();
        await app.navigate('/a');
        await settle();
        await app.navigate('/b');
        await settle();
        other = otherDocument();
    });

    afterEach(async () => {
        window.removeEventListener('popstate', onPop);
        try { await app?.dispose(); } catch { }
        document.body.innerHTML = '';
        window.history.replaceState(null, '', '/');
    });

    test('bağlı belgedeki kenar kaydırması bir önceki sayfaya döner', async () => {
        app.connectDocument(other);
        const before = popCount;
        touch(other, 'touchstart', 5);
        touch(other, 'touchmove', 15);
        touch(other, 'touchmove', 700);
        touch(other, 'touchend', 700);
        await waitFor(() => popCount > before);
        await settle();
        expect(app.router.uri).toBe('/a');
    });

    test('bağlanmamış belgedeki dokunuş kaydırma başlatmaz', async () => {
        const before = popCount;
        touch(other, 'touchstart', 5);
        touch(other, 'touchmove', 15);
        touch(other, 'touchmove', 700);
        touch(other, 'touchend', 700);
        await tick(200);
        expect(popCount).toBe(before);
        expect(app.router.uri).toBe('/b');
    });
});
