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
