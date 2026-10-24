/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, motifComponent, motifOptions } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
const item = (text: string) => motifComponent('span', (span: ComponentBase) => span.setText(text));

async function mount(c: ComponentBase) {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(c);
    await tick();
    return { host, root };
}

describe('children of an Options component', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('without view() they go into the root element, as in a class without view()', async () => {
        const Box = () => motifOptions({ el: 'div' });
        class ClassBox extends Component { static elementTag = 'div'; }

        const options = await mount(motifComponent(Box, { childs: [item('a'), item('b')] }));
        const klass = await mount(motifComponent(ClassBox, { childs: [item('a'), item('b')] }));

        expect(options.host.innerHTML).toBe('<div><span>a</span><span>b</span></div>');
        expect(options.host.innerHTML).toBe(klass.host.innerHTML);
    });

    test('with view() the view places them, each child once', async () => {
        const Box = () => motifOptions({ el: 'div', view() { return this.childs; } });
        const Empty = () => motifOptions({ el: 'div', view() { return item('own'); } });

        const placed = await mount(motifComponent(Box, { childs: [item('a'), item('b')] }));
        const own = await mount(motifComponent(Empty, { childs: [item('a')] }));

        expect(placed.host.innerHTML).toBe('<div><span>a</span><span>b</span></div>');
        expect(own.host.innerHTML).toBe('<div><span>own</span></div>');
    });

    test('a child added later and an option setup hook keep working', async () => {
        const Box = () => motifOptions({ el: 'div', onConfigured() { this.class.add('box'); } });
        const box = motifComponent(Box, { childs: [item('a')] }) as ComponentBase;
        const { host } = await mount(box);
        box.controls.add(item('b'));
        await tick();

        expect(host.innerHTML).toBe('<div class="box"><span>a</span><span>b</span></div>');
        expect(box.controls.length).toBe(2);
    });

    test('disposing the component disposes the children it placed', async () => {
        const Box = () => motifOptions({ el: 'div' });
        const a = item('a');
        const box = motifComponent(Box, { childs: [a] }) as ComponentBase;
        await mount(box);
        await box.dispose();

        expect(a.isDisposed).toBe(true);
    });
});
