import Compiler from '../src/compiler';
import { explain, formatExplanations } from '../src/index';
import type { MotifExplanation } from '../src/explain';

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();

const compile = (body: string): string => {
    const r = new Compiler().start(`function A(p){ return ${body}; }`, 'F.tsx');
    expect(r).not.toBeNull();
    return flat(r!.code!);
};

const wrap = (jsx: string) =>
    `import { Component } from '@motifx/core';
export default class A extends Component<HTMLFormElement> {
    url = '/x';
    save(data: FormData) { return data; }
    view() { return (${jsx}); }
}`;

const row = (jsx: string, source: string): MotifExplanation => {
    const list = explain(wrap(jsx), 'F.tsx');
    const hit = list.find(e => e.site === 'attr' && e.source.includes(source));
    if (!hit) throw new Error(`kayıt yok: ${source}\n` + formatExplanations(list));
    return hit;
};

describe('action and formaction: the written value becomes the value of a getter', () => {
    test('an identifier is wrapped', () => {
        expect(compile('<form action={search} />')).toContain('"action": () => search');
    });

    test('an arrow function is wrapped, so it is not treated as a getter', () => {
        expect(compile('<form action={(fd) => save(fd)} />')).toMatch(/"action": \(\) => \(?fd\)? => save\(fd\)/);
    });

    test('a function expression is wrapped', () => {
        expect(compile('<form action={function (fd) { return save(fd); }} />')).toMatch(/"action": \(\) => function \(fd\)/);
    });

    test('a call is wrapped', () => {
        expect(compile('<form action={makeHandler(p)} />')).toContain('"action": () => makeHandler(p)');
    });

    test('a type assertion does not hide the identifier', () => {
        expect(compile('<form action={search as any} />')).toMatch(/"action": \(\) => search/);
    });

    test('a member expression keeps the guarded getter and is not wrapped twice', () => {
        const out = compile('<form action={p.save} />');
        expect(out).toMatch(/"action": \(\) => /);
        expect(out).not.toContain('() => () =>');
    });

    test('a ternary is wrapped once', () => {
        const out = compile('<form action={p.edit ? update : create} />');
        expect(out).toContain('"action": () => p.edit ? update : create');
        expect(out).not.toContain('() => () =>');
    });

    test('a string literal stays a string', () => {
        expect(compile('<form action="/search" />')).toContain('"action": "/search"');
    });

    test('formAction on a button and formaction on an input are wrapped the same way', () => {
        expect(compile('<button formAction={remove} />')).toContain('"formAction": () => remove');
        expect(compile('<input type="submit" formaction={remove} />')).toContain('"formaction": () => remove');
    });

    test('other attributes are not affected', () => {
        expect(compile('<form title={search} />')).toContain('"title": search');
    });

    test('on a component tag the prop passes as written', () => {
        const out = compile('<Editor action={search} />');
        expect(out).toContain('action: search');
        expect(out).not.toContain('() => search');
    });
});

describe('explain reports the form action', () => {
    test('a function value is a live attr.action row', () => {
        const e = row('<form action={this.save} />', 'action={this.save}');
        expect(e.shape).toBe('attr.action');
        expect(e.reactive).toBe('live');
        expect(e.lowered).toMatch(/^sender\.attr\.add\(\{ "action": \(\) => /);
        expect(e.note).toContain('submit handler');
    });

    test('an identifier is a live attr.action row', () => {
        const e = row('<form action={search} />', 'action={search}');
        expect(e.shape).toBe('attr.action');
        expect(e.lowered).toBe('sender.attr.add({ "action": () => search })');
    });

    test('a string literal is still a literal', () => {
        const e = row('<form action="/search" />', 'action="/search"');
        expect(e.shape).toBe('attr.literal');
        expect(e.reactive).toBe('static');
    });
});
