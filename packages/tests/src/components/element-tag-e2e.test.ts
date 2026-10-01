/**
 * UÇTAN UCA: compiler derleyicisinin ürettiği kod gerçekten çalıştırıldığında,
 * generic ile element türü bildiren sınıf bileşeni o türde element oluşturuyor mu?
 *
 * Derleme: packages/compiler/dist  →  Çalıştırma: packages/motifjs/dist (jsdom)
 * Bu test iki paket arasındaki sözleşmeyi (static elementTag) birlikte doğrular.
 */

import { Component, ComponentBase } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

// compiler derlenmiş halinden yüklenir (kaynak TS'i bu paketin transform'undan geçmez)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compiler = require('../../../compiler/dist/index.cjs');
const Compiler = compiler.Compiler;

function compileClass(source: string, className = 'Kart'): any {
    const compiler = new Compiler();
    const result = compiler.start(source, 'e2e.tsx');
    expect(result).not.toBeNull();
    const code = (result.code as string)
        .split('\n')
        .filter(l => !l.trim().startsWith('import '))
        .join('\n');
    // eslint-disable-next-line no-new-func
    const factory = new Function('Component', '_mv', `${code}\nreturn ${className};`);
    return factory(Component, () => { });
}

describe('elementTag — derleyici + çalışma anı uçtan uca', () => {
    let container: HTMLElement;
    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => { cleanupTestContainer(container); });

    test('constructor tagname vermiyorsa generic türden DIV üretilir', () => {
        const Kart = compileClass(`
            class Kart extends Component<HTMLDivElement> {
                constructor(props) { super(void 0, props); }
            }
        `);
        const k = new Kart({ baslik: 'x' });
        expect((k.element as Node).nodeType).toBe(Node.ELEMENT_NODE);
        expect((k.element as HTMLElement).tagName.toLowerCase()).toBe('div');
        expect((k.props as any).baslik).toBe('x');
    });

    test('constructor HİÇ YOKSA da tür uygulanır', () => {
        const Kart = compileClass(`class Kart extends Component<HTMLButtonElement> {}`);
        const k = new Kart({});
        expect((k.element as HTMLElement).tagName.toLowerCase()).toBe('button');
    });

    test('generic yoksa fragment (yorum düğümü) olarak kalır', () => {
        const Kart = compileClass(`class Kart extends Component {}`);
        const k = new Kart({});
        expect((k.element as Node).nodeType).toBe(Node.COMMENT_NODE);
    });

    test('SVG generic doğru namespace ile oluşur', () => {
        const Kart = compileClass(`class Kart extends Component<SVGSVGElement> {}`);
        const k = new Kart({});
        expect((k.element as Element).namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect((k.element as Element).tagName.toLowerCase()).toBe('svg');
    });

    test('elle yazılan static elementTag generic\'i ezer', () => {
        const Kart = compileClass(`
            class Kart extends Component<HTMLDivElement> {
                static elementTag = 'section';
            }
        `);
        const k = new Kart({});
        expect((k.element as HTMLElement).tagName.toLowerCase()).toBe('section');
    });

    test('üretilen element gerçekten DOM\'a bağlanır ve çocuklarını render eder', async () => {
        const Liste = compileClass(`class Kart extends Component<HTMLUListElement> {}`);
        const li = new Component('li');
        (li.element as HTMLElement).textContent = 'satir';

        const root = new Component(container as any, {});
        const liste = new Liste({ childs: [li] }) as ComponentBase;
        root.controls.add(liste);
        root.build();
        await wait(0);

        const ul = container.querySelector('ul');
        expect(ul).not.toBeNull();
        expect(ul!.querySelectorAll('li').length).toBe(1);
        expect(ul!.textContent).toContain('satir');
    });
});
