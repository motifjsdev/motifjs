/**
 * @jest-environment jsdom
 */
import { Component, reactive } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 0));

function make(): Component<HTMLDivElement> {
    const c = new Component<HTMLDivElement>('div');
    c.build();
    return c;
}

const classes = (c: Component) => (c.element as HTMLElement).className;

describe('class.add dÃ¼z metin', () => {
    test.each([
        ['a', 'a'],
        ['a b', 'a b'],
        ['a\tb', 'a b'],
        ['  a  ', 'a'],
        ['a  b   c', 'a b c'],
        ['\n a \n b \n', 'a b'],
        ['', ''],
        ['   ', ''],
        ['a a', 'a'],
    ])('%j â†’ %j', (input, expected) => {
        const c = make();
        c.class.add(input);
        expect(classes(c)).toBe(expected);
        c.dispose();
    });

    test('sayÄ± ve boolean metne Ã§evrilir, null ve undefined bir ÅŸey eklemez', () => {
        const c = make();
        c.class.add(5 as any, true as any, null as any, undefined as any);
        expect(classes(c)).toBe('5 true');
        c.dispose();
    });

    test('aynÄ± sÄ±nÄ±fÄ± tekrar eklemek tek kopya bÄ±rakÄ±r, tek remove ile kalkar', () => {
        const c = make();
        c.class.add('a');
        c.class.add('a');
        c.class.add('a b');
        expect(classes(c)).toBe('a b');
        c.class.remove('a');
        expect(classes(c)).toBe('b');
        c.dispose();
    });

    test('elemanÄ±n kendi sÄ±nÄ±flarÄ± korunur', () => {
        const c = make();
        (c.element as HTMLElement).classList.add('own');
        c.class.add('a');
        c.class.remove('a');
        expect(classes(c)).toBe('own');
        c.dispose();
    });
});

describe('statik ve reaktif kaynak aynÄ± sÄ±nÄ±fÄ± paylaÅŸÄ±r', () => {
    test('Ã¶nce reaktif, sonra statik: reaktif bÄ±rakÄ±nca sÄ±nÄ±f kalÄ±r, statik kaldÄ±rÄ±nca gider', async () => {
        const s = reactive({ on: true });
        const c = make();
        c.class.add(() => (s.on ? 'a' : ''));
        expect(classes(c)).toBe('a');
        c.class.add('a');
        expect(classes(c)).toBe('a');
        s.on = false;
        await settle();
        expect(classes(c)).toBe('a');
        c.class.remove('a');
        expect(classes(c)).toBe('');
        c.dispose();
    });

    test('Ã¶nce statik, sonra reaktif: statik kaldÄ±rÄ±nca reaktif tutar, reaktif bÄ±rakÄ±nca gider', async () => {
        const s = reactive({ on: true });
        const c = make();
        c.class.add('a');
        c.class.add(() => (s.on ? 'a' : ''));
        expect(classes(c)).toBe('a');
        c.class.remove('a');
        expect(classes(c)).toBe('a');
        s.on = false;
        await settle();
        expect(classes(c)).toBe('');
        s.on = true;
        await settle();
        expect(classes(c)).toBe('a');
        c.dispose();
    });

    test('reaktif kaynak statik sÄ±nÄ±fa dokunmaz', async () => {
        const s = reactive({ name: 'x' });
        const c = make();
        c.class.add('base');
        c.class.add(() => s.name);
        expect(classes(c)).toBe('base x');
        s.name = 'y';
        await settle();
        expect(classes(c)).toBe('base y');
        s.name = 'base';
        await settle();
        expect(classes(c)).toBe('base');
        s.name = 'z';
        await settle();
        expect(classes(c)).toBe('base z');
        c.dispose();
    });

    test('remove("**") statik ve reaktif bÃ¼tÃ¼n sÄ±nÄ±flarÄ± temizler', async () => {
        const s = reactive({ on: true });
        const c = make();
        c.class.add('a b');
        c.class.add(() => (s.on ? 'c' : ''));
        expect(classes(c)).toBe('a b c');
        c.class.remove('**');
        expect(classes(c)).toBe('');
        c.class.add('d');
        expect(classes(c)).toBe('d');
        c.dispose();
    });

    test('effect iÃ§inden Ã§aÄŸrÄ±lan class.add yeni baÄŸÄ±mlÄ±lÄ±k oluÅŸturmaz', async () => {
        const s = reactive({ n: 0 });
        const c = make();
        let runs = 0;
        c.class.add(() => { runs++; c.class.add('inner'); return s.n > 0 ? 'pos' : ''; });
        expect(runs).toBe(1);
        c.class.add('other');
        await settle();
        expect(runs).toBe(1);
        s.n = 1;
        await settle();
        expect(runs).toBe(2);
        expect(classes(c)).toBe('inner other pos');
        c.dispose();
    });
});

describe('elemanÄ± olmayan kÃ¶k', () => {
    test('JSX prop yolundaki nesne biÃ§imi reaktif kalÄ±r', async () => {
        const s = reactive({ on: true });
        const c = new Component<HTMLDivElement>('div', { class: ['base', { a: () => s.on }] } as any);
        c.build();
        expect(classes(c)).toBe('a base');
        s.on = false;
        await settle();
        expect(classes(c)).toBe('base');
        c.dispose();
    });

    test('fragment kÃ¶kÃ¼nde class.add hata vermez', () => {
        const c = new Component();
        expect(() => c.class.add('a b')).not.toThrow();
        c.dispose();
    });
});
