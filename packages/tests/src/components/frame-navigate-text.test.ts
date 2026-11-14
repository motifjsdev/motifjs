import { Component, ComponentBase, Frame, reactive } from '@motifx/core';

const settle = async () => {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
    }
};

function mount() {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    const frame = new Frame();
    host.controls.add(frame);
    return { host, frame };
}

const shown = (c: ComponentBase) => (c.element as unknown as HTMLElement).innerHTML.replace(/<!--.*?-->/g, '');
const span = (text: string) => new Component('span', { initializeComponent: (s: ComponentBase) => s.setText(text) } as any);

class Badge extends Component<HTMLElement> {
    constructor() { super('b' as any); }
    override onConfigured() { this.setText('badge'); }
}

describe('Frame.navigate with text releases it like any other page', () => {
    let errors: string[] = [];
    let spy: jest.SpyInstance;
    beforeEach(() => {
        errors = [];
        spy = jest.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ')); });
    });
    afterEach(() => {
        spy.mockRestore();
        document.body.innerHTML = '';
    });

    test.each([
        ['a string', 'Kaydedildi', 'Kaydedildi'],
        ['a number', 42, '42'],
        ['a bigint', BigInt(7), '7'],
        ['a boolean', true, 'true'],
    ])('%s is shown, then removed by the next navigation', async (_label, value, text) => {
        const { host, frame } = mount();
        await frame.navigate(value as any);
        expect(shown(host)).toBe(text);
        await frame.navigate(span('sonra'));
        await settle();
        expect(shown(host)).toBe('<span>sonra</span>');
        expect(frame.current).toBeInstanceOf(ComponentBase);
        expect(errors).toEqual([]);
    });

    test('text replaced by text leaves only the latest one', async () => {
        const { host, frame } = mount();
        await frame.navigate('bir' as any);
        await frame.navigate('iki' as any);
        await frame.navigate('üç' as any);
        await settle();
        expect(shown(host)).toBe('üç');
        expect(errors).toEqual([]);
    });

    test('flush removes text', async () => {
        const { host, frame } = mount();
        await frame.navigate('geçici' as any);
        await frame.flush();
        await settle();
        expect(shown(host)).toBe('');
        expect(errors).toEqual([]);
    });

    test('an array mixing text, a component class and a component is released as a whole', async () => {
        const { host, frame } = mount();
        await frame.navigate(['Toplam: ', Badge, span('3')] as any);
        expect(shown(host)).toBe('Toplam: <b>badge</b><span>3</span>');
        await frame.navigate(span('boş'));
        await settle();
        expect(shown(host)).toBe('<span>boş</span>');
        expect(errors).toEqual([]);
    });

    test('navigating again to the same array of components keeps it', async () => {
        const { host, frame } = mount();
        const page = [span('a'), span('b')];
        await frame.navigate(page);
        await frame.navigate(page);
        await settle();
        expect(shown(host)).toBe('<span>a</span><span>b</span>');
        expect(frame.current).toBe(page);
    });

    test('a when binding whose content is text does not leave it behind', async () => {
        const s = reactive({ on: true });
        const host = new Component<HTMLDivElement>('div', {
            initializeComponent: (c: ComponentBase) => { c.bindings.when(() => s.on, () => 'evet' as any); },
        } as any);
        host.build();
        document.body.appendChild(host.element as unknown as Node);
        expect(shown(host)).toBe('evet');
        s.on = false;
        await settle();
        expect(shown(host)).toBe('');
        s.on = true;
        await settle();
        expect(shown(host)).toBe('evet');
        expect(errors).toEqual([]);
    });
});
