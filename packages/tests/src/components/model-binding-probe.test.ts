/**
 * Probe (temporary, Qedi.ai investigation 2026-08-15)
 *
 * Does `bindings.model(source, field)` write typed input back into the model?
 *
 * The question is not academic: a sign-in form built on it sent empty credentials, the server
 * could not find a user, and the failure surfaced as 401 with the account's failed-attempt
 * counter still at zero - the password was never even tried.
 */

import { Component, ComponentBase, reactive } from '@motifx/core';
import { nextTick, createTestContainer, cleanupTestContainer } from '../helpers/test-utils';

describe('bindings.model on a text input', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = createTestContainer();
    });

    afterEach(() => {
        cleanupTestContainer(container);
    });

    test('typing into the input writes the value into the model', async () => {
        const model = reactive({ email: '' });

        const field = new Component('input', {
            initializeComponent: (sender: ComponentBase) => {
                sender.bindings.model(model, 'email');
            }
        });

        field.build();
        container.appendChild(field.element as Node);
        await nextTick();

        const input = field.element as HTMLInputElement;

        input.value = 'someone@example.com';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await nextTick();

        // eslint-disable-next-line no-console
        console.log('MODEL PROBE (input -> model)', { model: model.email, dom: input.value });

        expect(model.email).toBe('someone@example.com');
    });

    test('setting the model writes the value into the input', async () => {
        const model = reactive({ email: '' });

        const field = new Component('input', {
            initializeComponent: (sender: ComponentBase) => {
                sender.bindings.model(model, 'email');
            }
        });

        field.build();
        container.appendChild(field.element as Node);
        await nextTick();

        model.email = 'from-model@example.com';
        await nextTick();

        const input = field.element as HTMLInputElement;

        // eslint-disable-next-line no-console
        console.log('MODEL PROBE (model -> input)', { model: model.email, dom: input.value });

        expect(input.value).toBe('from-model@example.com');
    });
});
