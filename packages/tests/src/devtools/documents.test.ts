/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

function frame(): HTMLIFrameElement {
    const el = document.createElement('iframe');
    document.body.appendChild(el);
    return el;
}

describe('devtools documents', () => {
    const hook = () => (globalThis as any).__MOTIF_DEVTOOLS__;
    let app: Application;
    let host: HTMLElement;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        app = Application.CreateBuilder().build();
        app.useDevelopment(true);
        app.run(host, new Component('main'));
    });

    afterEach(async () => {
        app.useDevelopment(false);
        await app.dispose();
        document.body.innerHTML = '';
        delete (globalThis as any).__MOTIF_DEV__;
    });

    test('the page document comes first and connected documents follow in connection order', () => {
        expect(hook().getDocuments()).toEqual([document]);
        const first = frame().contentDocument!;
        const second = frame().contentDocument!;
        const releaseFirst = app.connectDocument(first);
        app.connectDocument(second);
        expect(hook().getDocuments()).toEqual([document, first, second]);
        releaseFirst();
        expect(hook().getDocuments()).toEqual([document, second]);
    });

    test('a window opened by the manager is listed while it is open', async () => {
        const win = app.windows.attach(frame().contentWindow!);
        expect(hook().getDocuments()).toContain(win.document);
        await win.close();
        expect(hook().getDocuments()).toEqual([document]);
    });

    test('documents:changed is published when a document connects and when it is released', () => {
        const events: string[] = [];
        const off = hook().on((ev: any) => { if (ev.type === 'documents:changed') events.push(ev.type); });
        try {
            const doc = frame().contentDocument!;
            const release = app.connectDocument(doc);
            expect(events.length).toBe(1);
            app.connectDocument(doc)();
            expect(events.length).toBe(1);
            release();
            expect(events.length).toBe(2);
        } finally {
            off();
        }
    });

    test('nothing is published after useDevelopment(false)', () => {
        const events: string[] = [];
        const off = hook().on((ev: any) => { events.push(ev.type); });
        app.useDevelopment(false);
        const release = app.connectDocument(frame().contentDocument!);
        release();
        off();
        expect(events).toEqual([]);
    });
});
