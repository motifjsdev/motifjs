/**
 * @jest-environment jsdom
 *
 * S3 — ardışık `x-display` kardeşleri.
 *
 * `x-display` gizli bir kardeşi hiç DOM'a eklemez (isWait yolu) ya da yerine bir
 * `<!--h-->` placeholder bırakır. `internalBuild` referans düğümü seçerken kardeşin
 * `element`ini kullanıyordu; kardeş gizliyse bu düğüm DOM'da olmadığından
 * `insertBefore` NotFoundError fırlatıyor ve gösterilmek istenen kardeş sessizce
 * hiç eklenmiyordu.
 */
import { Component, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));

type Flags = { error: string | null; pending: boolean };

function buildRow() {
    const flags = reactive<Flags>({ error: null, pending: false });
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);

    const mk = (predicate: () => boolean, id: string) => {
        // Not: düz `new Component(tag, props)` çağrısında `id` prop'u elemana
        // uygulanmıyor (JSX yolu farklı), bu yüzden doğrudan atanıyor.
        const c = new Component('span', { 'x-display': predicate });
        (c.element as unknown as HTMLElement).id = id;
        return c;
    };

    const err = mk(() => flags.error !== null, 'err');
    const pending = mk(() => flags.pending, 'pending');
    const hint = mk(() => flags.error === null && !flags.pending, 'hint');

    host.controls.add(err);
    host.controls.add(pending);
    host.controls.add(hint);
    return { flags, host, err, pending, hint };
}

const visibleIds = (host: Component<HTMLDivElement>) =>
    Array.from((host.element as unknown as HTMLElement).children).map(el => el.id);

describe('consecutive x-display siblings (S3)', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('shows an earlier sibling after a later one was shown and hidden again', async () => {
        const { flags, host } = buildRow();
        await tick();
        expect(visibleIds(host)).toEqual(['hint']);

        // Ortadaki kardeş görünür olur
        flags.pending = true;
        await tick();
        expect(visibleIds(host)).toEqual(['pending']);

        // Ortadaki gizlenir, ÖNCEKİ kardeş gösterilir → düzeltmeden önce NotFoundError
        // fırlıyor ve 'err' hiç eklenmiyordu.
        flags.pending = false;
        flags.error = 'zorunlu alan';
        await tick();
        expect(visibleIds(host)).toEqual(['err']);
    });

    it('keeps the declared sibling order when two siblings are visible at once', async () => {
        const { flags, host } = buildRow();
        await tick();

        flags.pending = true;              // 2. kardeş
        await tick();
        flags.error = 'x';                 // 1. kardeş; 'pending' hâlâ görünür
        await tick();

        expect(visibleIds(host)).toEqual(['err', 'pending']);
    });

    it('survives repeated show/hide cycles across all three siblings', async () => {
        const { flags, host } = buildRow();
        await tick();

        for (let i = 0; i < 5; i++) {
            flags.error = 'e' + i; flags.pending = false;
            await tick();
            expect(visibleIds(host)).toEqual(['err']);

            flags.error = null; flags.pending = true;
            await tick();
            expect(visibleIds(host)).toEqual(['pending']);

            flags.pending = false;
            await tick();
            expect(visibleIds(host)).toEqual(['hint']);
        }
    });
});
