import * as motif from '@motifx/core';
import { Application, Component, ContentBlock, ContentBody, DisposableStore, MotifError, Query, errorHandler, reactive } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

function evalJsx(source: string, exportExpr: string, extra: Record<string, any> = {}) {
    const out = new CompilerCtor().start(source, 'D.tsx');
    const code: string = out.code.replace(/^\s*import\s*\{[^}]*\}\s*from\s*["']@motifx\/core["'];?/m, '');
    const names = ['_mc', '_mfc', '_mv', 'Component', 'reactive', ...Object.keys(extra)];
    const values = [(motif as any).motifComponent, (motif as any).FNComponent, (motif as any).motifCompiled, Component, reactive, ...Object.values(extra)];
    return new Function(...names, `${code}\nreturn ${exportExpr};`)(...values);
}

describe('MotifError', () => {
    test('carries the code and a prefixed English message', () => {
        let caught: unknown;
        try { Query.from([]).first(); } catch (error) { caught = error; }
        expect(caught).toBeInstanceOf(MotifError);
        expect(caught).toBeInstanceOf(Error);
        expect((caught as MotifError).code).toBe('MJX601');
        expect((caught as MotifError).name).toBe('MotifError');
        expect((caught as MotifError).message).toBe('[motifjs] MJX601: Sequence contains no elements.');
    });

    test('navigateByName with an unknown name rejects with MJX302', async () => {
        const app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        try {
            app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }] });
            app.run(host);
            await tick();
            await expect(app.navigateByName('missing')).rejects.toMatchObject({ code: 'MJX302', message: "[motifjs] MJX302: Named route 'missing' was not found." });
        } finally {
            app.dispose();
            host.remove();
        }
    });

    test('navigate without a router rejects with MJX309 and resolving an unregistered service throws MJX401', async () => {
        const app = Application.CreateBuilder().build();
        try {
            await expect(app.navigate('/x')).rejects.toMatchObject({ code: 'MJX309' });
            class Missing { }
            expect(() => app.provider.get(Missing)).toThrow(MotifError);
            expect(() => app.provider.get(Missing)).toThrow('[motifjs] MJX401: Service not registered for token:');
        } finally {
            app.dispose();
        }
    });
});

describe('reported errors reach the central error handler', () => {
    const start = async (onShow: () => void) => {
        window.history.replaceState({}, '', '/x');
        const app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes: [{ path: '/x', control: () => new Component('div'), onShow }] });
        app.run(host);
        await tick();
        return () => { app.dispose(); host.remove(); };
    };

    test('listeners receive a MotifError with the original error as cause, and the console shows the coded message', async () => {
        const received: any[] = [];
        const unbind = errorHandler.addListener(e => received.push(e));
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
        const boom = new Error('boom');
        const stop = await start(() => { throw boom; });
        try {
            const reported = received.find(e => e instanceof MotifError && e.code === 'MJX306');
            expect(reported).toBeDefined();
            expect(reported.cause).toBe(boom);
            expect(consoleError).toHaveBeenCalledWith('[motifjs] MJX306: The onShow hook threw.', boom);
        } finally {
            stop();
            unbind();
            consoleError.mockRestore();
        }
    });

    test('turning console logging off silences the console but still notifies listeners', async () => {
        const received: any[] = [];
        const unbind = errorHandler.addListener(e => received.push(e));
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });
        errorHandler.setConsoleLogging(false);
        const stop = await start(() => { throw new Error('quiet'); });
        try {
            expect(received.some(e => e instanceof MotifError && e.code === 'MJX306')).toBe(true);
            expect(consoleError.mock.calls.some(c => String(c[0]).includes('MJX306'))).toBe(false);
        } finally {
            errorHandler.setConsoleLogging(true);
            stop();
            unbind();
            consoleError.mockRestore();
        }
    });
});

describe('warnings are coded and only shown in development', () => {
    const addAfterDispose = () => {
        const store = new DisposableStore();
        store.dispose();
        store.add({ dispose() { } });
    };

    test('no warning outside development', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        try {
            addAfterDispose();
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    test('a coded warning in development', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => { });
        (globalThis as any).__MOTIF_DEV__ = true;
        try {
            addAfterDispose();
            expect(String(warn.mock.calls[0]?.[0])).toBe('[motifjs] MJX504: A disposable was added to a DisposableStore that is already disposed; the added object will leak.');
        } finally {
            delete (globalThis as any).__MOTIF_DEV__;
            warn.mockRestore();
        }
    });
});

describe('ContentBlock disposal', () => {
    test('removes every child it moved into the content body', async () => {
        const { Body, Block } = evalJsx(`
            function Body(){ return <div class="body"><ContentBody name="slot" /></div>; }
            function Block(){ return <ContentBlock target="slot"><i>1</i><i>2</i><i>3</i><i>4</i></ContentBlock>; }
        `, '{ Body, Block }', { ContentBody, ContentBlock });
        const app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = new Component('div');
        app.run(host, root);
        try {
            root.controls.add(Body());
            const block = Block();
            root.controls.add(block);
            await tick();
            expect(host.querySelectorAll('.body i').length).toBe(4);
            await block.dispose();
            await tick();
            expect(host.querySelectorAll('.body i').length).toBe(0);
        } finally {
            app.dispose();
            host.remove();
        }
    });

    test('leaves the children of other blocks in the same body', async () => {
        const { Body, First, Second } = evalJsx(`
            function Body(){ return <div class="body"><ContentBody name="shared" /></div>; }
            function First(){ return <ContentBlock target="shared"><i class="a">a1</i><i class="a">a2</i></ContentBlock>; }
            function Second(){ return <ContentBlock target="shared"><i class="b">b1</i><i class="b">b2</i><i class="b">b3</i></ContentBlock>; }
        `, '{ Body, First, Second }', { ContentBody, ContentBlock });
        const app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = new Component('div');
        app.run(host, root);
        try {
            root.controls.add(Body());
            const first = First();
            const second = Second();
            root.controls.add(first);
            root.controls.add(second);
            await tick();
            expect(host.querySelectorAll('.body i.a').length).toBe(2);
            expect(host.querySelectorAll('.body i.b').length).toBe(3);
            await first.dispose();
            await tick();
            expect(host.querySelectorAll('.body i.a').length).toBe(0);
            expect(host.querySelectorAll('.body i.b').length).toBe(3);
            await second.dispose();
            await tick();
            expect(host.querySelectorAll('.body i').length).toBe(0);
        } finally {
            app.dispose();
            host.remove();
        }
    });
});
