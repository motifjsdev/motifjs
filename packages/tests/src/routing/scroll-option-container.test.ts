/**
 * @jest-environment jsdom
 */
import { Application, Component } from '@motifx/core';

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
const routes = () => ['/', '/a', '/b', '/c'].map(path => ({ path, control: () => new Component('div') }));

function setup(scrollMemory: any) {
    const box = document.body.appendChild(document.createElement('div'));
    box.id = 'content';
    const boxCalls: any[] = [];
    (box as any).scrollTo = jest.fn((o: any) => { boxCalls.push(o); box.scrollTop = Number(o?.top ?? 0); });
    const windowCalls: any[] = [];
    (window as any).scrollTo = jest.fn((o: any) => { windowCalls.push(o); });
    const app = Application.CreateBuilder().build();
    app.useRouter({ routes: routes(), mode: 'history', scrollMemory } as any);
    app.run(box);
    return { app, box, boxCalls, windowCalls, mem: () => (app as any).urlRoutingModule._scroll };
}

describe('navigate(…, { scroll }) with a scroll memory container', () => {
    afterEach(() => { document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); });

    test.each([
        ['top', { top: 0, behavior: 'auto' }],
        ['smooth', { top: 0, behavior: 'smooth' }],
        ['instant', { top: 0, behavior: 'instant' }],
        [{ top: 40, left: 10, behavior: 'smooth' }, { top: 40, left: 10, behavior: 'smooth' }],
    ])('scroll: %j scrolls the container, not the window', async (option, want) => {
        const t = setup({ container: '#content' });
        await tick();
        await t.app.navigate('/a');
        t.box.scrollTop = 500;
        t.boxCalls.length = 0; t.windowCalls.length = 0;
        await t.app.navigate('/b', { scroll: option } as any);
        await tick();
        expect(t.boxCalls.at(-1)).toEqual(want);
        expect(t.windowCalls).toEqual([]);
        await t.app.dispose();
    });

    test('the page reached with a scroll option owns the position saved when leaving it', async () => {
        const t = setup({ container: '#content' });
        await tick();
        await t.app.navigate('/a');
        await t.app.navigate('/b', { scroll: 'top' });
        await tick();
        t.box.scrollTop = 300;
        await t.app.navigate('/c');
        await tick();
        expect(t.mem().saved('/b')).toBe(300);
        expect(t.mem().saved('/a')).toBe(0);
        await t.app.dispose();
    });

    test('without a container the memory scrolls the window and still records the page', async () => {
        const t = setup({});
        await tick();
        await t.app.navigate('/a');
        t.windowCalls.length = 0;
        await t.app.navigate('/b', { scroll: 'smooth' });
        await tick();
        expect(t.windowCalls.at(-1)).toEqual({ top: 0, behavior: 'smooth' });
        expect(t.boxCalls).toEqual([]);
        await t.app.dispose();
    });

    test('without any scroll memory the window is scrolled as before', async () => {
        const t = setup(undefined);
        await tick();
        t.windowCalls.length = 0;
        await t.app.navigate('/a', { scroll: 'top' });
        await tick();
        expect(t.windowCalls.at(-1)).toEqual({ top: 0, behavior: 'auto' });
        await t.app.dispose();
    });
});
