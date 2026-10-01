import Compiler from '../src/compiler';

/**
 * `<Virtualization dataRequest={async …}>` içindeki await'ler izleme bağlamını taşıyacak
 * biçimde sarılır (bkz. src/asyncTracking.ts). Dar kapsam: yalnızca Virtualization'ın
 * dataRequest'i; iç içe fonksiyonlar ve başka öznitelikler/etiketler dokunulmaz.
 */
const compile = (code: string): string => {
    const r = new Compiler().start(code, 'F.tsx');
    expect(r).not.toBeNull();
    return r!.code!;
};
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('dataRequest await sarma', () => {
    test('her await suspend/resume ile sarılır, gövde capture/finally end ile çevrilir, import eklenir', () => {
        const out = compile(`function A(s){ return <Virtualization itemHeight={40} dataRequest={async ({ page }) => {
            const t = await token();
            const r = await fetch('/api?q=' + s.q + '&p=' + page);
            return r.json();
        }} itemTemplate={(x) => <div/>} />; }`);
        expect(out).toMatch(/asyncTracking as __motifAsyncTracking/);
        expect(count(out, '__motifAsyncTracking.capture()')).toBe(1);
        expect(count(out, '__motifAsyncTracking.suspend(')).toBe(2);
        expect(count(out, '__motifAsyncTracking.resume(')).toBe(2);
        expect(out).toMatch(/finally\s*\{\s*__motifAsyncTracking\.end\(_mt\)/);
        expect(out).toMatch(/resume\(_mt, await __motifAsyncTracking\.suspend\(_mt, token\(\)\)\)/);
    });

    test('ifade gövdeli async ok fonksiyonu bloğa çevrilip return edilir', () => {
        const out = compile(`function A(){ return <Virtualization itemHeight={40} dataRequest={async (r) => (await api(r)).data} itemTemplate={(x) => <div/>} />; }`);
        expect(out).toMatch(/try\s*\{\s*return __motifAsyncTracking\.resume\(_mt, await __motifAsyncTracking\.suspend\(_mt, api\(r\)\)\)\.data;/);
    });

    test('async function ifadesi de sarılır', () => {
        const out = compile(`function A(){ return <Virtualization itemHeight={40} dataRequest={async function (r) { return await api(r); }} itemTemplate={(x) => <div/>} />; }`);
        expect(count(out, '__motifAsyncTracking.suspend(')).toBe(1);
    });

    test('iç içe fonksiyonun await\'i sarılmaz (kendi bağlamı)', () => {
        const out = compile(`function A(){ return <Virtualization itemHeight={40} dataRequest={async (r) => {
            const inner = async () => await b();
            return await a(inner);
        }} itemTemplate={(x) => <div/>} />; }`);
        expect(count(out, '__motifAsyncTracking.suspend(')).toBe(1);
        expect(out).toMatch(/const inner = async \(\) => await b\(\);/);
    });

    test('await yoksa dokunulmaz ve import eklenmez', () => {
        const out = compile(`function A(s){ return <Virtualization itemHeight={40} dataRequest={async (r) => ({ items: s.rows, totalCount: 0, hasMore: false })} itemTemplate={(x) => <div/>} />; }`);
        expect(out).not.toMatch(/__motifAsyncTracking/);
    });

    test('async olmayan dataRequest dokunulmaz', () => {
        const out = compile(`function A(s){ return <Virtualization itemHeight={40} dataRequest={(r) => api(r)} itemTemplate={(x) => <div/>} />; }`);
        expect(out).not.toMatch(/__motifAsyncTracking/);
    });

    test('üye ifadeli etiket (<M.Virtualization>) de sarılır', () => {
        const out = compile(`function A(){ return <M.Virtualization itemHeight={40} dataRequest={async (r) => await api(r)} itemTemplate={(x) => <div/>} />; }`);
        expect(count(out, '__motifAsyncTracking.suspend(')).toBe(1);
    });

    test('başka etiketin dataRequest\'i ve Virtualization\'ın başka öznitelikleri dokunulmaz', () => {
        const out = compile(`function A(){ return <div>
            <Grid dataRequest={async (r) => await api(r)} />
            <Virtualization itemHeight={40} dataRequest={(r) => api(r)} onLoad={async () => await x()} itemTemplate={(x) => <div/>} />
        </div>; }`);
        expect(out).not.toMatch(/__motifAsyncTracking/);
    });

    test('mevcut @motifx/core import\'u ile çakışmaz', () => {
        const out = compile(`import { Virtualization, asyncTracking } from '@motifx/core';
        function A(){ return <Virtualization itemHeight={40} dataRequest={async (r) => await api(r)} itemTemplate={(x) => <div/>} />; }`);
        expect(out).toMatch(/asyncTracking as __motifAsyncTracking/);
        expect(count(out, '__motifAsyncTracking.suspend(')).toBe(1);
    });
});
