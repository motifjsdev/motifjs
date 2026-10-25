import Compiler from '../src/compiler';

function compile(code: string): string {
    const out = new Compiler().start(code, 'Value.tsx');
    expect(out).not.toBeNull();
    return out!.code!;
}

const view = (jsx: string) => `function A(){ return ${jsx}; }`;

describe('a JSX element written as an attribute value without braces', () => {
    test('on a component tag it compiles as the braced form', () => {
        expect(compile(view('<Card header=<b>Notes</b> />'))).toBe(compile(view('<Card header={<b>Notes</b>} />')));
    });

    test('on a plain tag it compiles as the braced form', () => {
        expect(compile(view('<div title=<b>x</b> />'))).toBe(compile(view('<div title={<b>x</b>} />')));
    });

    test('a fragment value compiles as the braced form', () => {
        expect(compile(view('<Card header=<><i>a</i><i>b</i></> />'))).toBe(compile(view('<Card header={<><i>a</i><i>b</i></>} />')));
    });

    test('a lifecycle hook given an element is reported like the braced form', () => {
        expect(() => compile(view('<div onBuilt=<b /> />'))).toThrow(/MJX010/);
    });
});
