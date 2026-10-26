import { motifError } from "../common/diagnostics";

type DocumentEntry = { count: number; off: () => void };
type DocumentListener = (doc: Document, connected: boolean) => void;

const entries = new Map<Document, DocumentEntry>();
const listeners = new Set<DocumentListener>();

export function isPageDocument(doc: Document): boolean {
    return typeof document !== 'undefined' && doc === document;
}

export function connectDocument(doc: Document): () => void {
    if (!doc || (doc as any).nodeType !== 9) throw motifError('MJX417', 'the value given is not a Document');
    if (isPageDocument(doc)) return () => { };
    const win = doc.defaultView;
    if (!win) throw motifError('MJX417', 'the document has no window; it is closed or was never shown');
    let entry = entries.get(doc);
    if (!entry) {
        const onHide = () => release(doc, true);
        try {
            win.addEventListener('pagehide', onHide);
        } catch {
            throw motifError('MJX417', 'the document belongs to another origin and cannot be used');
        }
        entry = { count: 0, off: () => { try { win.removeEventListener('pagehide', onHide); } catch { } } };
        entries.set(doc, entry);
        notify(doc, true);
    }
    entry.count++;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        release(doc, false);
    };
}

export function connectedDocuments(): Document[] {
    return [...entries.keys()];
}

export function onDocumentConnection(listener: DocumentListener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function release(doc: Document, all: boolean): void {
    const entry = entries.get(doc);
    if (!entry) return;
    entry.count = all ? 0 : entry.count - 1;
    if (entry.count > 0) return;
    entries.delete(doc);
    entry.off();
    notify(doc, false);
}

function notify(doc: Document, connected: boolean): void {
    for (const listener of [...listeners]) {
        try {
            listener(doc, connected);
        } catch (error) {
            queueMicrotask(() => { throw error; });
        }
    }
}
