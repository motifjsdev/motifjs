import { Component, reactive } from '@motifx/core';

const tick = () => new Promise((r) => setTimeout(r, 0));

class Panel extends Component<HTMLDivElement> {
    myoptions: any = { locked: false };
    log: boolean[] = [];
    filters = {
        _strict: false,
        owner: this as Panel,
        get strict() { return this._strict; },
        set strict(value: boolean) { this._strict = value; this.owner.log.push(value); },
    };
    constructor() { super('div'); }
}

function mount(c: Component<any>) {
    const host = new Component(document.createElement('div'));
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    host.controls.add(c);
    return host;
}

describe('a dotted binding name is a path on the component', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('writes a nested field and follows plain data through reState', async () => {
        const plain = { archived: true };
        const p = new Panel();
        p.bindings.add('myoptions.locked', () => plain.archived);
        const host = mount(p);
        await tick();
        expect(p.myoptions.locked).toBe(true);
        plain.archived = false;
        host.reState();
        await tick();
        expect(p.myoptions.locked).toBe(false);
    });

    test('follows reactive data by itself', async () => {
        const state = reactive({ archived: false });
        const p = new Panel();
        p.bindings.add('myoptions.locked', () => state.archived);
        mount(p);
        await tick();
        state.archived = true;
        await tick();
        expect(p.myoptions.locked).toBe(true);
    });

    test('calls a setter on the nested object', async () => {
        const plain = { strict: true };
        const p = new Panel();
        p.bindings.add('filters.strict', () => plain.strict);
        const host = mount(p);
        await tick();
        plain.strict = false;
        host.reState();
        await tick();
        expect(p.log).toEqual([true, false]);
    });

    test('goes to the component, not to the element or a special name', async () => {
        const p = new Panel();
        (p as any).text = { value: '' };
        p.bindings.add('text.value', () => 'kept');
        p.bindings.add('element.title', () => 'tip');
        mount(p);
        await tick();
        expect((p as any).text.value).toBe('kept');
        expect(p.element.textContent).toBe('');
        expect(p.element.title).toBe('tip');
    });

    test('writes nothing when a step is missing or is not an object', async () => {
        const p = new Panel();
        p.bindings.add('missing.locked', () => true);
        p.bindings.add('style.color', () => 'red');
        mount(p);
        await tick();
        expect((p as any).missing).toBeUndefined();
        expect((p.style as any).color).toBeUndefined();
    });

    test('does not reach the prototype', async () => {
        const p = new Panel();
        p.bindings.add('myoptions.__proto__.polluted', () => true);
        p.bindings.add('myoptions.constructor.prototype.polluted', () => true);
        mount(p);
        await tick();
        expect(({} as any).polluted).toBeUndefined();
        expect((Object.prototype as any).polluted).toBeUndefined();
    });
});
