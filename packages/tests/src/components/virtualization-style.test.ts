/**
 * @jest-environment jsdom
 */
import { Component, ComponentBase, Virtualization } from '@motifx/core';

interface Row { id: number }

const request = async () => ({ items: [] as Row[], totalCount: 0, hasMore: false });
const row = () => new Component('div');

describe('Virtualization style prop', () => {
    test('mainTemplate yokken kullanıcı stili kök stilinin üstüne yazılır', () => {
        const virt = new Virtualization<Row>({
            itemHeight: 30,
            dataRequest: request,
            itemTemplate: row,
            style: { border: '1px solid red', height: '240px' },
        });
        const style = (virt.element as HTMLElement).style;
        expect(style.border).toBe('1px solid red');
        expect(style.height).toBe('240px');
        expect(style.overflowY).toBe('auto');
        expect(style.position).toBe('relative');
        virt.dispose();
    });

    test('stil verilmezse kök kendi stiliyle kalır', () => {
        const virt = new Virtualization<Row>({ itemHeight: 30, dataRequest: request, itemTemplate: row });
        const style = (virt.element as HTMLElement).style;
        expect(style.overflowY).toBe('auto');
        expect(style.height).toBe('100%');
        expect(style.position).toBe('relative');
        virt.dispose();
    });

    test('mainTemplate varken stil kök elemana uygulanır', () => {
        const virt = new Virtualization<Row>({
            itemHeight: 30,
            dataRequest: request,
            itemTemplate: row,
            style: { border: '1px solid red' },
            mainTemplate: (content) => new Component('div', { initializeComponent: (s: ComponentBase) => { s.controls.add(content); } }),
        });
        const style = (virt.element as HTMLElement).style;
        expect(style.border).toBe('1px solid red');
        expect(style.overflowY).toBe('');
        virt.dispose();
    });
});
