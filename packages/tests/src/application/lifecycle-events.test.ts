import { Application } from '@motifx/core';

const setVisibility = (value: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
};

const setOnline = (value: boolean) => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
};

describe('Application lifecycle events', () => {
    let app: Application;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
    });

    afterEach(() => {
        try { app?.dispose(); } catch { }
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    });

    it('reports hidden and visible', () => {
        const seen: any[] = [];
        app.onLifecycle(e => { seen.push(e); });

        setVisibility('hidden');
        expect(app.isVisible).toBe(false);
        setVisibility('visible');
        expect(app.isVisible).toBe(true);

        expect(seen.map(e => e.state)).toEqual(['hidden', 'visible']);
        expect(seen[0].visible).toBe(false);
        expect(seen[1].visible).toBe(true);
    });

    it('reports offline and online', () => {
        const seen: string[] = [];
        app.onLifecycle(e => { seen.push(`${e!.state}:${e!.online}`); });

        setOnline(false);
        expect(app.isOnline).toBe(false);
        setOnline(true);

        expect(seen).toEqual(['offline:false', 'online:true']);
    });

    it('reports freeze, resume and bfcache restore', () => {
        const seen: string[] = [];
        app.onLifecycle(e => { seen.push(e!.state); });

        document.dispatchEvent(new Event('freeze'));
        document.dispatchEvent(new Event('resume'));
        const restored: any = new Event('pageshow');
        restored.persisted = true;
        window.dispatchEvent(restored);
        const fresh: any = new Event('pageshow');
        fresh.persisted = false;
        window.dispatchEvent(fresh);

        expect(seen).toEqual(['frozen', 'resumed', 'restored']);
    });

    it('unsubscribe stops delivery', () => {
        const seen: string[] = [];
        const off = app.onLifecycle(e => { seen.push(e!.state); });
        setVisibility('hidden');
        off();
        setVisibility('visible');

        expect(seen).toEqual(['hidden']);
    });

    it('dispose removes the browser listeners', () => {
        const add = jest.spyOn(document, 'addEventListener');
        const remove = jest.spyOn(document, 'removeEventListener');
        app.onLifecycle(() => { });
        app.onLifecycle(() => { });
        const added = add.mock.calls.filter(c => ['visibilitychange', 'freeze', 'resume'].includes(String(c[0]))).length;
        app.dispose();
        const removed = remove.mock.calls.filter(c => ['visibilitychange', 'freeze', 'resume'].includes(String(c[0]))).length;
        add.mockRestore();
        remove.mockRestore();

        expect(added).toBe(3);
        expect(removed).toBe(3);
    });

    it('installs nothing when unused', () => {
        app.dispose();
        const addWin = jest.spyOn(window, 'addEventListener');
        const addDoc = jest.spyOn(document, 'addEventListener');
        app = Application.CreateBuilder().build();
        app.useRouter({ routes: [] });
        app.run(document.createElement('div'));
        const count =
            addWin.mock.calls.filter(c => ['online', 'offline', 'pageshow'].includes(String(c[0]))).length +
            addDoc.mock.calls.filter(c => ['visibilitychange', 'freeze', 'resume'].includes(String(c[0]))).length;
        addWin.mockRestore();
        addDoc.mockRestore();

        expect(count).toBe(0);
    });
});
