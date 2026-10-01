/**
 * Element verilmeden oluşturulan bileşenler fragment gibi davranmalı.
 *
 * Yaygın kullanım: sınıf bileşenleri `super(void 0, props)` (ya da `super(null, props)`)
 * ile kuruluyor. Bu biçimde props İKİNCİ argümandadır; eskiden tamamen düşüyordu ve
 * initializeComponent/childs/ref/lifecycle hiç çalışmıyordu.
 */

import { Component, ComponentBase } from '@motifx/core';
import { wait, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe('Elementsiz bileşen = fragment', () => {
    let container: HTMLElement;

    beforeEach(() => { container = createTestContainer(); });
    afterEach(() => { cleanupTestContainer(container); });

    class VoidPage extends Component {
        constructor(props?: any) {
            super(void 0 as any, props);
        }
    }

    test('super(void 0, props) props\'u korur', () => {
        const props = { title: 'merhaba' };
        const page = new VoidPage(props);
        expect(page.props).toBeDefined();
        expect((page.props as any).title).toBe('merhaba');
    });

    test('super(void 0, props) yer tutucu (yorum düğümü) kullanır', () => {
        const page = new VoidPage({});
        expect((page.element as Node).nodeType).toBe(Node.COMMENT_NODE);
    });

    test('props içindeki initializeComponent çalışır', () => {
        const initializeComponent = jest.fn();
        const page = new VoidPage({ initializeComponent });
        page.build();
        expect(initializeComponent).toHaveBeenCalled();
    });

    test('props içindeki ref doldurulur', () => {
        let captured: any = null;
        const page = new VoidPage({ ref: (c: ComponentBase) => { captured = c; } });
        expect(captured).toBe(page);
    });

    test('JSX çocukları (childs) fragment içeriği olarak render edilir', async () => {
        const a = new Component('span');
        (a.element as HTMLElement).textContent = 'A';
        const b = new Component('span');
        (b.element as HTMLElement).textContent = 'B';

        const root = new Component(container as any, {});
        const page = new VoidPage({ childs: [a, b] });
        root.controls.add(page);
        root.build();
        await wait(0);

        expect(container.textContent).toContain('A');
        expect(container.textContent).toContain('B');
        expect(container.querySelectorAll('span').length).toBe(2);
    });

    test('fragment aralığı dispose edilince tüm içerik DOM\'dan silinir', async () => {
        const a = new Component('span');
        (a.element as HTMLElement).textContent = 'A';

        const root = new Component(container as any, {});
        const page = new VoidPage({ childs: [a] });
        root.controls.add(page);
        root.build();
        await wait(0);
        expect(container.querySelectorAll('span').length).toBe(1);

        await page.dispose();
        await wait(0);
        expect(container.querySelectorAll('span').length).toBe(0);
        expect(container.textContent).not.toContain('A');
    });

    test('super(null, props) de aynı şekilde davranır', () => {
        class NullPage extends Component {
            constructor(props?: any) { super(null as any, props); }
        }
        const initializeComponent = jest.fn();
        const page = new NullPage({ initializeComponent, title: 'x' });
        expect((page.element as Node).nodeType).toBe(Node.COMMENT_NODE);
        expect((page.props as any).title).toBe('x');
        page.build();
        expect(initializeComponent).toHaveBeenCalled();
    });

    test('boş string element adı da fragment gibi ele alınır (createElement patlamaz)', () => {
        const page = new Component('' as any, { title: 'y' } as any);
        expect((page.element as Node).nodeType).toBe(Node.COMMENT_NODE);
        expect((page.props as any).title).toBe('y');
    });

    // --- Bildirilen element türü (static elementTag) ---------------------------
    // Derleyici `class X extends Component<HTMLDivElement>` gördüğünde bu statiği
    // otomatik enjekte eder; elle de yazılabilir.

    test('static elementTag bildirilmişse fragment yerine O TÜRDE element oluşur', () => {
        class Kart extends Component {
            static override elementTag = 'section';
        }
        const kart = new Kart({});
        expect((kart.element as Node).nodeType).toBe(Node.ELEMENT_NODE);
        expect((kart.element as HTMLElement).tagName.toLowerCase()).toBe('section');
    });

    test('elementTag + super(void 0, props) birlikte çalışır ve props korunur', () => {
        class Dugme extends Component {
            static override elementTag = 'button';
            constructor(props?: any) { super(void 0 as any, props); }
        }
        const initializeComponent = jest.fn();
        const d = new Dugme({ initializeComponent, baslik: 'kaydet' });
        expect((d.element as HTMLElement).tagName.toLowerCase()).toBe('button');
        expect((d.props as any).baslik).toBe('kaydet');
        d.build();
        expect(initializeComponent).toHaveBeenCalled();
    });

    test('constructor hiç yoksa da elementTag uygulanır', () => {
        class Girdi extends Component {
            static override elementTag = 'input';
        }
        const g = new Girdi({ initializeComponent: () => { } });
        expect((g.element as HTMLElement).tagName.toLowerCase()).toBe('input');
    });

    test('elementTag miras alınır (ara sınıftan)', () => {
        class Taban extends Component {
            static override elementTag = 'article';
        }
        class Turev extends Taban { }
        const t = new Turev({});
        expect((t.element as HTMLElement).tagName.toLowerCase()).toBe('article');
    });

    test('constructor açıkça tagname verirse elementTag EZİLİR', () => {
        class Kart extends Component {
            static override elementTag = 'section';
            constructor(props?: any) { super('aside', props); }
        }
        const k = new Kart({});
        expect((k.element as HTMLElement).tagName.toLowerCase()).toBe('aside');
    });

    test('elementTag ile childs element içine render edilir', async () => {
        class Liste extends Component {
            static override elementTag = 'ul';
        }
        const li = new Component('li');
        (li.element as HTMLElement).textContent = 'satir';

        const root = new Component(container as any, {});
        const liste = new Liste({ childs: [li] });
        root.controls.add(liste);
        root.build();
        await wait(0);

        const ul = container.querySelector('ul');
        expect(ul).not.toBeNull();
        expect(ul!.querySelectorAll('li').length).toBe(1);
        expect(ul!.textContent).toContain('satir');
    });

    test('SVG: elementNamespace verilirse doğru namespace ile oluşur', () => {
        class Ikon extends Component {
            static override elementTag = 'svg';
            static override elementNamespace = 'http://www.w3.org/2000/svg';
        }
        const i = new Ikon({});
        expect((i.element as Element).namespaceURI).toBe('http://www.w3.org/2000/svg');
        expect((i.element as Element).tagName.toLowerCase()).toBe('svg');
    });

    test('elementTag YOKSA fragment davranışı korunur', () => {
        class Sarmal extends Component { }
        const s = new Sarmal({});
        expect((s.element as Node).nodeType).toBe(Node.COMMENT_NODE);
    });

    test('tek argümanlı props biçimi bozulmadan çalışmaya devam eder', () => {
        const initializeComponent = jest.fn();
        const comp = new Component({ initializeComponent, title: 'z' } as any);
        expect((comp.element as Node).nodeType).toBe(Node.COMMENT_NODE);
        expect((comp.props as any).title).toBe('z');
        comp.build();
        expect(initializeComponent).toHaveBeenCalled();
    });

    test('sınıf içi initializeComponent metodu ve props childs birlikte çalışır', async () => {
        const child = new Component('span');
        (child.element as HTMLElement).textContent = 'ÇOCUK';

        class WithInitializeComponent extends Component {
            constructor(props?: any) { super(void 0 as any, props); }
            public override initializeComponent(sender: ComponentBase): void {
                const extra = new Component('span');
                (extra.element as HTMLElement).textContent = 'EK';
                sender.controls.add(extra);
            }
        }

        const root = new Component(container as any, {});
        const page = new WithInitializeComponent({ childs: [child] });
        root.controls.add(page);
        root.build();
        await wait(0);

        expect(container.textContent).toContain('ÇOCUK');
        expect(container.textContent).toContain('EK');
    });
});
