import Compiler from '../src/compiler';

/** Utility to run compiler with a specific dev flag. We simulate build define by setting global. */
function run(code: string, isDev: boolean, filename: string = 'test.ts') {
  (globalThis as any).__MOTIF_DEV__ = isDev;
  const compiler = new Compiler();
  return compiler.start(code, filename);
}

describe('DEV-ONLY strip', () => {
  test('removes @DEV-ONLY statements in prod mode', () => {
    const input = `/* @DEV-ONLY */ const a = 1;\nconst b = 2;\n/* @DEV-ONLY */ function foo(){ return 42 }\n/* @DEV-ONLY */ class X {}\n/* @DEV-ONLY */ var c = 3;`;
    const result = run(input, false);
    expect(result).not.toBeNull();
    const out = result!.code!;
    expect(out).not.toContain('a = 1');
    expect(out).toContain('const b = 2');
    expect(out).not.toContain('function foo');
    expect(out).not.toContain('class X');
    expect(out).not.toContain('var c = 3');
  });

  test('keeps @DEV-ONLY statements when dev flag true', () => {
    const input = `/* @DEV-ONLY */ const a = 1;\nconst b = 2;\n/* @DEV-ONLY */ function foo(){ return 42 }`;
    const result = run(input, true);
    const out = result!.code!;
    expect(out).toContain('a = 1');
    expect(out).toContain('function foo');
    expect(out).toContain('const b = 2');
  });
});