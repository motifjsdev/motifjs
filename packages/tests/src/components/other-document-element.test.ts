/**
 * @jest-environment jsdom
 */
import { Component, motifComponent } from '@motifx/core';

function otherDocument(): Document {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    return frame.contentDocument!;
}

describe('başka belgenin elemanı', () => {
    let other: Document;

    beforeEach(() => { other = otherDocument(); });
    afterEach(() => { document.body.innerHTML = ''; });

    test('başka belgenin elemanı sayfanın Element ve Node sınıflarından değildir', () => {
        const el = other.createElement('div');
        expect(el instanceof Element).toBe(false);
        expect(el instanceof Node).toBe(false);
        expect(el.nodeType).toBe(1);
    });

    test('new Component(eleman) başka belgenin elemanını sarar, fragment kurmaz', () => {
        const el = other.createElement('div');
        const c = new Component(el);
        expect(c.element).toBe(el);
    });

    test('class başka belgenin elemanında ekler, sorar ve kaldırır', () => {
        const el = other.createElement('div');
        const c = new Component(el);
        c.class.add('selected');
        expect(el.classList.contains('selected')).toBe(true);
        expect(c.class.has('selected')).toBe(true);
        c.class.remove('selected');
        expect(el.classList.contains('selected')).toBe(false);
        expect(c.class.has('selected')).toBe(false);
    });

    test('attr başka belgenin elemanında ekler, okur, sorar ve kaldırır', () => {
        const el = other.createElement('input');
        const c = new Component(el);
        c.attr.add({ placeholder: 'Notlarda ara' });
        expect(el.getAttribute('placeholder')).toBe('Notlarda ara');
        expect(c.attr.has('placeholder')).toBe(true);
        expect(c.attr.get('placeholder')).toBe('Notlarda ara');
        c.attr.remove('placeholder');
        expect(el.hasAttribute('placeholder')).toBe(false);
        expect(c.attr.has('placeholder')).toBe(false);
    });

    test('options nesnesinin el alanı başka belgenin elemanı olabilir', () => {
        const el = other.createElement('p');
        const c: any = motifComponent({ el } as any, {});
        expect(c.element).toBe(el);
    });

    test('başka belgenin gövdesini saran bileşene eklenen çocuk o belgede yerleşir', () => {
        const host = new Component(other.body);
        const child = new Component('span');
        host.controls.add(child);
        host.build();
        expect(other.body.contains(child.element as Node)).toBe(true);
        expect((child.element as Node).ownerDocument).toBe(other);
    });

    test('sayfada kurulup başka belgeye taşınan bileşende class ve attr çalışmaya devam eder', () => {
        const c = new Component('div');
        c.build();
        other.body.appendChild(c.element as Node);
        c.class.add('moved');
        c.attr.add({ title: 'taşındı' });
        expect((c.element as Element).classList.contains('moved')).toBe(true);
        expect((c.element as Element).getAttribute('title')).toBe('taşındı');
    });
});

describe('başka belgedeki elemanın yöntem öznitelikleri ve odak durumu', () => {
    let other: Document;
    const tick = () => new Promise(r => setTimeout(r, 0));

    beforeEach(() => { other = otherDocument(); });
    afterEach(() => { document.body.innerHTML = ''; });

    function stubMethods(target: any, names: string[]) {
        const calls: string[] = [];
        const saved = names.map(n => [n, Object.getOwnPropertyDescriptor(target, n)] as const);
        for (const name of names) {
            Object.defineProperty(target, name, { configurable: true, writable: true, value: () => { calls.push(name); } });
        }
        const restore = () => {
            for (const [n, d] of saved) { if (d) Object.defineProperty(target, n, d); else delete target[n]; }
        };
        return { calls, restore };
    }

    test('odak durumu elemanın kendi belgesinden okunur', () => {
        const el = other.createElement('input');
        other.body.appendChild(el);
        const c = new Component(el);
        el.focus();
        expect(other.activeElement).toBe(el);
        expect(document.activeElement).not.toBe(el);
        expect(c.attr.getMethodState('focus')).toBe(true);
        expect(c.attr.hasMethodState('focus')).toBe(true);
        el.blur();
        expect(c.attr.getMethodState('focus')).toBe(false);
    });

    test('gölge kökteki elemanın odak durumu gölge kökten okunur', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const el = document.createElement('input');
        shadow.appendChild(el);
        const c = new Component(el);
        el.focus();
        expect(document.activeElement).toBe(host);
        expect(c.attr.getMethodState('focus')).toBe(true);
    });

    test('requestFullscreen = false tam ekrandan elemanın belgesi üzerinden çıkar', async () => {
        const page = stubMethods(document, ['exitFullscreen']);
        const theirs = stubMethods(other, ['exitFullscreen']);
        try {
            const root = new Component(other.body);
            root.build();
            const c = new Component('div');
            Object.defineProperty(c.element, 'requestFullscreen', { configurable: true, value: () => { } });
            root.controls.add(c);
            expect((c.element as Node).ownerDocument).toBe(other);
            Object.defineProperty(other, 'fullscreenElement', { configurable: true, get: () => c.element });
            c.attr.add({ requestFullscreen: false });
            await tick();
            expect(theirs.calls).toEqual(['exitFullscreen']);
            expect(page.calls).toEqual([]);
        } finally {
            page.restore();
            theirs.restore();
            delete (other as any).fullscreenElement;
        }
    });

    test('exitPointerLock özniteliği elemanın belgesinin yöntemini çağırır', async () => {
        const page = stubMethods(document, ['exitPointerLock']);
        const theirs = stubMethods(other, ['exitPointerLock']);
        try {
            const root = new Component(other.body);
            root.build();
            const c = new Component('div');
            root.controls.add(c);
            c.attr.add({ exitPointerLock: true });
            await tick();
            expect(theirs.calls).toEqual(['exitPointerLock']);
            expect(page.calls).toEqual([]);
        } finally {
            page.restore();
            theirs.restore();
        }
    });
});
