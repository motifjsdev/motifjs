import Compiler from '../src/compiler';
import { explain as explainSource } from '../src/index';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!.replace(/\s+/g, ' ');
};

const explain = (code: string) => explainSource(code, 'F.tsx').find(e => e.source.startsWith('x-model='))!;

describe('x-model lowers to a getter and a setter', () => {
    test('arrow getter over a member expression gets a setter', () => {
        const out = compile(`function A(s){ return <input x-model={() => s.form.name} />; }`);
        expect(out).toMatch(/sender\.bindings\.model\(\(\) => s\.form\.name, _value => \{ const _owner = s\.form;/);
        expect(out).toContain('_owner.name = _value;');
    });

    test('bare member expression gets a setter', () => {
        const out = compile(`function A(s){ return <input x-model={s.q} />; }`);
        expect(out).toMatch(/_value => \{ const _owner = s;/);
        expect(out).toContain('_owner.q = _value;');
    });

    test('the owner is read again on every write', () => {
        const out = compile(`function A(s, i){ return <input x-model={() => s.rows[i].name} />; }`);
        expect(out).toContain('const _owner = s.rows[i];');
        expect(out).toContain('_owner.name = _value;');
    });

    test('computed members keep their key expression', () => {
        const out = compile(`function A(s, key){ return <input x-model={() => s.values[key]} />; }`);
        expect(out).toContain('const _owner = s.values;');
        expect(out).toContain('_owner[key] = _value;');
    });

    test('optional chains guard the owner instead of assigning through the chain', () => {
        const out = compile(`function A(s){ return <input x-model={() => s.form?.a?.b} />; }`);
        expect(out).toContain('const _owner = s.form?.a;');
        expect(out).toContain('_owner === null || _owner === undefined');
        expect(out).toContain('_owner.b = _value;');
    });

    test('a member holding a getter is not overwritten', () => {
        const out = compile(`function A(s){ return <input x-model={() => s.q} />; }`);
        expect(out).toContain('typeof _owner.q === "function"');
    });

    test('a block body with a single return gets a setter', () => {
        const out = compile(`function A(s){ return <input x-model={() => { return s.q; }} />; }`);
        expect(out).toContain('_owner.q = _value;');
    });

    test('type wrappers around the member are ignored', () => {
        const out = compile(`function A(s: any){ return <input x-model={() => (s.q as string)!} />; }`);
        expect(out).toContain('_owner.q = _value;');
    });

    test('non-assignable expressions stay one-way', () => {
        for (const value of [`() => s.q + '!'`, `() => fn(s.q)`, `q`, `function () { return s.q; }`, `() => { const x = s.q; return x; }`]) {
            const out = compile(`function A(s, q, fn){ return <input x-model={${value}} />; }`);
            expect(out).toContain('sender.bindings.model(');
            expect(out).not.toContain('_value');
        }
    });

    test('two setters in one scope get distinct names', () => {
        const out = compile(`function A(s){ return <div><input x-model={() => s.a} /><input x-model={() => s.b} /></div>; }`);
        expect(out).toContain('_owner.a = _value;');
        expect(out).toContain('_owner2.b = _value2;');
    });

    test('explain reports two-way only when a setter is generated', () => {
        expect(explain(`function A(s){ return <input x-model={() => s.q} />; }`).deps).toContain('two-way');
        expect(explain(`function A(s){ return <input x-model={() => s.q + '!'} />; }`).deps).toContain('one-way');
    });
});
