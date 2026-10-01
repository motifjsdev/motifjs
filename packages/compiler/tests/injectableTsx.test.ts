import Compiler from '../src/compiler';

const compile = (code: string, file = 'F.tsx'): string => {
    const r = new Compiler().start(code, file);
    expect(r).not.toBeNull();
    return r!.code!;
};

describe('.tsx içinde @Injectable', () => {
    test('dekoratörle derlenir, runtimeRegister üretilmez', () => {
        const out = compile(`import { Injectable } from '@motifx/core';
@Injectable({ lifetime: 'singleton' })
export class NotesService { list() { return []; } }`);
        expect(out).toMatch(/Injectable\(\{\s*lifetime: 'singleton'\s*\}\)/);
        expect(out).not.toMatch(/runtimeRegister/);
    });

    test('yorumda @Injectable geçen sıradan sınıfa dokunulmaz', () => {
        const out = compile(`// servisler @Injectable ile işaretlenir
export class Plain { x = 1; }`);
        expect(out).not.toMatch(/runtimeRegister/);
    });

    test('servis ve bileşen aynı dosyada: bileşene bir şey eklenmez', () => {
        const out = compile(`import { Component, Injectable } from '@motifx/core';
@Injectable()
export class GreetingService { text() { return 'a'; } }
class GreetingPage extends Component<HTMLDivElement> {
    view() { return <p>x</p>; }
}`);
        expect(out).not.toMatch(/runtimeRegister/);
        expect(out).toMatch(/class GreetingPage extends Component/);
    });

    test('.ts dosyasında da aynı', () => {
        const out = compile(`import { Injectable } from '@motifx/core';
@Injectable()
export class Svc {}
export class Other {}`, 'Svc.ts');
        expect(out).not.toMatch(/runtimeRegister/);
    });
});
