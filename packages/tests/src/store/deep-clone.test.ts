/**
 * @jest-environment jsdom
 */
import { deepClone, reactive } from '@motifx/core';

const isProxy = (o: any) => !!(o && o[Symbol.for('motif.isReactive')]);

describe('deepClone', () => {
    test('primitives, null and undefined come back as they are', () => {
        expect(deepClone(1)).toBe(1);
        expect(deepClone('a')).toBe('a');
        expect(deepClone(null)).toBeNull();
        expect(deepClone(undefined)).toBeUndefined();
        expect(deepClone(false)).toBe(false);
    });

    test('plain objects and arrays are copied deeply and independently', () => {
        const src = { a: 1, list: [{ v: 1 }, { v: 2 }], nested: { deep: { x: 'y' } } };
        const c = deepClone(src);
        expect(c).toEqual(src);
        expect(c).not.toBe(src);
        expect(c.list).not.toBe(src.list);
        expect(c.list[0]).not.toBe(src.list[0]);
        c.list[0].v = 9;
        c.nested.deep.x = 'z';
        expect(src.list[0].v).toBe(1);
        expect(src.nested.deep.x).toBe('y');
    });

    test('Map and Set become new Map and Set with deep-copied entries', () => {
        const inner = { v: 1 };
        const m = new Map<any, any>([['k', inner], [inner, 'byObject']]);
        const s = new Set<any>([inner, 2]);
        const cm = deepClone(m);
        const cs = deepClone(s);
        expect(cm).toBeInstanceOf(Map);
        expect(cm.size).toBe(2);
        expect(cm.get('k')).toEqual({ v: 1 });
        expect(cm.get('k')).not.toBe(inner);
        expect(cs).toBeInstanceOf(Set);
        expect(cs.size).toBe(2);
        expect([...cs][0]).toEqual({ v: 1 });
        expect([...cs][0]).not.toBe(inner);
        expect([...cm.keys()][1]).toBe(cm.get('k'));
    });

    test('RegExp keeps source and flags, Date keeps its time', () => {
        const r = /a+b/gi;
        r.lastIndex = 2;
        const cr = deepClone(r);
        expect(cr).toBeInstanceOf(RegExp);
        expect(cr).not.toBe(r);
        expect(cr.source).toBe('a+b');
        expect(cr.flags).toBe('gi');
        expect(cr.lastIndex).toBe(2);
        const d = new Date(123456);
        const cd = deepClone(d);
        expect(cd).toBeInstanceOf(Date);
        expect(cd).not.toBe(d);
        expect(cd.getTime()).toBe(123456);
    });

    test('a class instance keeps its prototype: getters and methods still work', () => {
        class Person {
            first = 'Ada';
            last = 'Lovelace';
            tags = ['a'];
            get full() { return `${this.first} ${this.last}`; }
            greet() { return `hi ${this.first}`; }
        }
        const p = new Person();
        const c = deepClone(p);
        expect(c).toBeInstanceOf(Person);
        expect(c).not.toBe(p);
        expect(c.full).toBe('Ada Lovelace');
        expect(c.greet()).toBe('hi Ada');
        expect(c.tags).not.toBe(p.tags);
        c.first = 'Grace';
        expect(p.first).toBe('Ada');
    });

    test('cycles are preserved instead of overflowing the stack', () => {
        const a: any = { name: 'a', list: [] as any[] };
        a.self = a;
        a.list.push(a);
        const c = deepClone(a);
        expect(c).not.toBe(a);
        expect(c.self).toBe(c);
        expect(c.list[0]).toBe(c);
        expect(c.name).toBe('a');
    });

    test('the same object reached twice is copied once', () => {
        const shared = { v: 1 };
        const c = deepClone({ x: shared, y: shared });
        expect(c.x).toBe(c.y);
        expect(c.x).not.toBe(shared);
    });

    test('a reactive value is copied from its raw data without a proxy', () => {
        const s = reactive({ m: new Map([['k', { v: 1 }]]), list: [{ v: 1 }], date: new Date(5) });
        const c = deepClone(s);
        expect(isProxy(c)).toBe(false);
        expect(isProxy(c.list)).toBe(false);
        expect(c.m).toBeInstanceOf(Map);
        expect(c.m.get('k')).toEqual({ v: 1 });
        expect(c.date.getTime()).toBe(5);
        c.list[0].v = 2;
        expect(s.list[0].v).toBe(1);
    });

    test('functions, WeakMap and DOM nodes', () => {
        const fn = () => 1;
        const wm = new WeakMap();
        const el = document.createElement('div');
        el.textContent = 'x';
        const c = deepClone({ fn, wm, el });
        expect(c.fn).toBe(fn);
        expect(c.wm).toBe(wm);
        expect(c.el).not.toBe(el);
        expect(c.el.textContent).toBe('x');
    });
});
