import Compiler from '../src/compiler';
import { explain } from '../src/index';

const view = (jsx: string) =>
    `class A { f(){} g(){} view(){ const fn = () => 1, other = () => 2, make = () => fn, list = [fn, other]; let n = 1; return ${jsx}; } }`;

function compile(code: string): string {
    return new Compiler().start(code, 'H.tsx')!.code!;
}

function errorOf(code: string): Error & { code?: string } {
    try {
        new Compiler().start(code, 'H.tsx');
    } catch (error) {
        return error as Error & { code?: string };
    }
    throw new Error('expected a compile error');
}

const ON_HOOKS = ['onCreating', 'onConfig', 'onConfigured', 'onCreated', 'onBuilding', 'onBuilt', 'onMounted', 'onInitializing', 'onInitialized', 'onActivated', 'onDeactivated', 'onVisibilityChanged', 'onDisposing', 'onDisposed', 'onInitializeComponent', 'initializeComponent'];
const X_HOOKS = ['x-mounted', 'x:mounted', 'x-built', 'x-configured', 'x-initializing', 'x-initialized', 'x-activated', 'x-deactivated', 'x-visibilitychanged', 'x-creating', 'x-initializecomponent'];
const TAGS = ['Box', 'div'];

describe('MJX010: every hook name and spelling rejects a value that can never be called', () => {
    test.each(ON_HOOKS.flatMap(h => TAGS.map(tag => [h, tag])))('%s="x" on <%s>', (hook, tag) => {
        const error = errorOf(view(`<${tag} ${hook}="x" />`));
        expect(error.code).toBe('MJX010');
        expect(error.message).toContain(`Lifecycle hook "${hook}"`);
    });

    test.each(X_HOOKS.flatMap(h => TAGS.map(tag => [h, tag])))('%s="x" on <%s>', (hook, tag) => {
        expect(errorOf(view(`<${tag} ${hook}="x" />`)).code).toBe('MJX010');
    });

    test.each([
        '<Box onBuilt="x" x-built={fn} />',
        '<div onMounted={fn} x-mounted={1} />',
    ])('a merged spelling is checked too: %s', (jsx) => {
        expect(errorOf(view(jsx)).code).toBe('MJX010');
    });

    const NEVER = ['{1}', '{-1}', '{true}', '{null}', '{`t`}', '{/r/}', '{{ a: 1 }}', '{[fn, "x"]}', '{!fn}', '{typeof fn}', '{n + 1}', '{n++}', '{("x" as any)}', '{<Box />}'];
    test.each(NEVER.flatMap(v => [['onBuilt', v], ['onMounted', v]]))('%s=%s', (hook, value) => {
        expect(errorOf(view(`<Box ${hook}=${value} />`)).code).toBe('MJX010');
        expect(errorOf(view(`<div ${hook}=${value} />`)).code).toBe('MJX010');
    });
});

describe('every value that may be a function at runtime compiles, for old and new hook names alike', () => {
    const MAYBE = ['{fn}', '{this.f}', '{() => 1}', '{function () { return 1; }}', '{this.f.bind(this)}', '{make()}', '{fn || this.f}', '{fn ?? other}', '{n ? fn : other}', '{[this.f, this.g]}', '{[...list]}', '{list}', '{new Hook()}', '{(fn as any)}', '{fn!}'];
    test.each(MAYBE.flatMap(v => [['onBuilt', v], ['onMounted', v]]))('%s=%s', (hook, value) => {
        expect(compile(view(`<Box ${hook}=${value} />`))).toContain(`${hook}:`);
        expect(compile(view(`<div ${hook}=${value} />`))).toContain(`${hook}:`);
    });

    test('initializeComponent takes a call or a reference', () => {
        expect(compile(view('<Box initializeComponent={make()} />'))).toMatch(/initializeComponent:\s*make\(\)/);
        expect(compile(view('<div initializeComponent={this.f.bind(this)} />'))).toMatch(/initializeComponent:\s*this\.f\.bind\(this\)/);
    });
});

describe('the generated key and place do not change', () => {
    test('a component tag keeps the hook inside runover under its camel-case key', () => {
        expect(compile(view('<Box onmounted={fn} />'))).toMatch(/runover:\s*\{[^}]*onMounted:\s*fn/);
        expect(compile(view('<Box x-visibilitychanged={fn} />'))).toMatch(/runover:\s*\{[^}]*onVisibilityChanged:\s*fn/);
        expect(compile(view('<Box onBuilt={fn} x-built={other} />'))).toMatch(/onBuilt:\s*\[fn,\s*other\]/);
    });

    test('a plain tag keeps the hook under its camel-case key', () => {
        expect(compile(view('<div onmounted={fn} />'))).toMatch(/onMounted:\s*fn/);
        expect(compile(view('<div x-activated={fn} />'))).toMatch(/onActivated:\s*fn/);
    });

    test('explain records every hook as a component-event', () => {
        const list = explain(view('<div onMounted={fn} onbuilt={other} />'), 'H.tsx');
        const sites = list.filter(e => e.source.startsWith('onMounted=') || e.source.startsWith('onbuilt=')).map(e => e.site);
        expect(sites).toEqual(['component-event', 'component-event']);
    });
});
