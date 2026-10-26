/**
 * @jest-environment jsdom
 */
import { Application, Component, MotifError } from '@motifx/core';
import { connectedDocuments, onDocumentConnection } from '@motifx/core/internal';

function otherDocument(): Document {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentDocument!;
}

describe('Application.connectDocument', () => {
    let app: Application;
    let other: Document;

    beforeEach(() => {
        app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        app.run(host, new Component('div'));
        other = otherDocument();
    });

    afterEach(async () => {
        await app.dispose();
        document.body.innerHTML = '';
    });

    test('bağlanan belge listeye girer, kopar fonksiyonu çıkarır', () => {
        const off = app.connectDocument(other);
        expect(connectedDocuments()).toContain(other);
        off();
        expect(connectedDocuments()).not.toContain(other);
    });

    test('aynı belge iki kez bağlanırsa son kopan çıkarır', () => {
        const first = app.connectDocument(other);
        const second = app.connectDocument(other);
        first();
        expect(connectedDocuments()).toContain(other);
        second();
        expect(connectedDocuments()).not.toContain(other);
    });

    test('aynı kopar fonksiyonu ikinci kez çağrılınca sayacı bir daha düşürmez', () => {
        const first = app.connectDocument(other);
        app.connectDocument(other);
        first();
        first();
        expect(connectedDocuments()).toContain(other);
    });

    test('belgenin penceresi pagehide alınca belge kendiliğinden kopar', () => {
        app.connectDocument(other);
        app.connectDocument(other);
        const win = other.defaultView!;
        win.dispatchEvent(new win.Event('pagehide'));
        expect(connectedDocuments()).not.toContain(other);
    });

    test('dinleyici bağlanmayı ve kopmayı birer kez, sırayla duyar', () => {
        const seen: Array<[Document, boolean]> = [];
        const stop = onDocumentConnection((doc, connected) => { seen.push([doc, connected]); });
        try {
            const off = app.connectDocument(other);
            app.connectDocument(other)();
            off();
            expect(seen).toEqual([[other, true], [other, false]]);
        } finally {
            stop();
        }
    });

    test('sayfanın kendi belgesi örtük bağlıdır: listeye girmez, boş kopar fonksiyonu döner', () => {
        const off = app.connectDocument(document);
        expect(typeof off).toBe('function');
        expect(connectedDocuments()).not.toContain(document);
        off();
    });

    test('uygulama serbest bırakılınca bağladığı belgeler kopar', async () => {
        app.connectDocument(other);
        await app.dispose();
        expect(connectedDocuments()).not.toContain(other);
    });

    test.each([
        ['belge olmayan değer', () => ({} as any)],
        ['bir eleman', () => document.body as any],
        ['penceresi olmayan belge', () => new DOMParser().parseFromString('<p></p>', 'text/html')],
        ['erişilemeyen belge', () => ({ nodeType: 9, defaultView: { addEventListener() { throw new DOMException('blocked', 'SecurityError'); } } } as any)],
    ])('%s için MJX417 fırlatır', (_name, make) => {
        let caught: unknown;
        try { app.connectDocument(make()); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(MotifError);
        expect((caught as MotifError).code).toBe('MJX417');
        expect(connectedDocuments()).toEqual([]);
    });
});
