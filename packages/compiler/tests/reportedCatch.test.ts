import Compiler from '../src/compiler';

const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};

const importLine = (out: string): string => /import \{[^}]*\} from "@motifx\/core";/.exec(out)?.[0] ?? '';

const CLASS = `import { Component } from '@motifx/core';`;

describe('yakalanan hata raporlanır (_mr), geri dönüş değeri değişmez', () => {
    test('üye çağrısı çocuk: catch raporlar, yuva boş kalır', () => {
        const out = compile(`${CLASS} class A extends Component { view(){ return <div>{this.part()}</div>; } }`);
        expect(out).toMatch(/catch \(__e\) \{\s*_mr\(__e\);\s*return undefined;/);
        expect(importLine(out)).toContain('motifReport as _mr');
    });

    test('?? çocuk: catch raporlar, sağ taraf kalır', () => {
        const out = compile(`function A(props){ return <div>{props.user.name ?? 'Anon'}</div>; }`);
        expect(out).toMatch(/catch \(__e\) \{\s*_mr\(__e\);\s*__l = undefined;/);
        expect(out).toMatch(/__l \?\? 'Anon'/);
        expect(importLine(out)).toContain('motifReport as _mr');
    });

    test('|| çocuk: aynı catch', () => {
        const out = compile(`function A(props){ return <span>{props.text || 'x'}</span>; }`);
        expect(out).toMatch(/catch \(__e\) \{\s*_mr\(__e\);\s*__l = undefined;/);
        expect(out).toMatch(/__l \|\| 'x'/);
    });

    test('&& koşulu: catch raporlar, dal gizli kalır (null)', () => {
        const out = compile(`function A(props){ return <div>{props.ok() && <i/>}</div>; }`);
        expect(out).toMatch(/catch \(__e\) \{\s*_mr\(__e\);\s*return null;/);
        expect(out).toContain('sender.bindings.when');
        expect(importLine(out)).toContain('motifReport as _mr');
    });

    test('parça kökünde ?? ve &&', () => {
        const out = compile(`function A(p){ return <>{p.a ?? 'x'}{p.ok() && <i/>}</>; }`);
        expect(out).toMatch(/catch \(__e\) \{\s*_mr\(__e\);\s*__l = undefined;/);
        expect(out).toMatch(/catch \(__e\) \{\s*_mr\(__e\);\s*return null;/);
    });

    test('ternary dalındaki ?? ve &&', () => {
        const out = compile(`function A(p){ return <span>{p.a ? (p.b ?? 'z') : (p.ok() && <i/>)}</span>; }`);
        expect(out).toMatch(/catch \(__e\) \{\s*_mr\(__e\);\s*__l = undefined;/);
        expect(out).toMatch(/catch \(__e\) \{\s*_mr\(__e\);\s*return null;/);
    });

    test('bu biçimler yoksa import eklenmez', () => {
        const out = compile(`function A(p){ return <div class={() => p.cls}>{p.a}{() => p.b}</div>; }`);
        expect(out).not.toContain('_mr(');
        expect(importLine(out)).not.toContain('motifReport');
    });
});
