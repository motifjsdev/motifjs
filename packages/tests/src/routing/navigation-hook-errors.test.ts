/**
 * @jest-environment jsdom
 */
import { Application, Component, errorHandler } from '@motifx/core';

const settle = () => new Promise(r => setTimeout(r, 5));

class Page extends Component<HTMLDivElement> {
    constructor() { super('div'); }
}

let reported: any[];
let unbind: () => void;
let app: Application;
let host: HTMLElement;

beforeEach(() => {
    reported = [];
    unbind = errorHandler.addListener(e => reported.push(e));
    host = document.body.appendChild(document.createElement('div'));
});

afterEach(async () => {
    unbind();
    await app.dispose();
    host.remove();
});

function start(options: { middlewareThrows?: boolean } = {}) {
    app = Application.CreateBuilder().build();
    app.useRouter({
        routes: [
            { path: '/', control: Page },
            { path: '/ok', control: Page },
            { path: '/mw', control: Page },
            { path: '/validated', control: Page, validate: () => { throw new Error('validate patladi'); } },
            { path: '/redirected', redirect: () => { throw new Error('redirect patladi'); } },
        ],
    });
    if (options.middlewareThrows) {
        app.use(async (ctx: any, next: any) => {
            if (ctx.uri === '/mw') throw new Error('middleware patladi');
            await next();
        });
    }
    app.run(host, new Component('main'));
}

const codes = () => reported.map(e => e.code);
const messages = () => reported.map(e => e.message);
const causes = () => reported.map(e => e.cause && e.cause.message);

describe('a navigation hook that throws is reported and the navigation produces a result', () => {
    test('middleware: MJX306 for the middleware, the navigation is cancelled with reason middleware', async () => {
        start({ middlewareThrows: true });
        await settle();
        await app.navigate('/ok');
        reported.length = 0;

        const result = await app.navigate('/mw');
        expect(result).toEqual({ ok: false, uri: '/mw', cancelled: true, reason: 'middleware' });
        expect(codes()).toEqual(['MJX306']);
        expect(messages()[0]).toContain('middleware');
        expect(causes()).toEqual(['middleware patladi']);
        expect(app.router.uri).toBe('/ok');
    });

    test('validate: MJX306 for validate, the route does not match and the not-found page is shown', async () => {
        start();
        await settle();
        await app.navigate('/ok');
        reported.length = 0;

        const result = await app.navigate('/validated');
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.cancelled).toBeUndefined();
        expect(result.params.path).toBe('/validated');
        expect(codes()).toEqual(['MJX306']);
        expect(messages()[0]).toContain('validate');
        expect(causes()).toEqual(['validate patladi']);
        expect(app.router.ok).toBe(false);
        expect(app.router.uri).toBe('/validated');
    });

    test('function redirect: MJX306 for redirect, the error page is shown at the requested address with the error', async () => {
        start();
        await settle();
        await app.navigate('/ok');
        reported.length = 0;

        const result = await app.navigate('/redirected');
        expect(result).toBeDefined();
        expect(result.ok).toBe(false);
        expect(result.cancelled).toBeUndefined();
        expect(result.params.path).toBe('/redirected');
        expect(result.params.error).toBeInstanceOf(Error);
        expect(result.params.error.message).toBe('redirect patladi');
        expect(codes()).toEqual(['MJX306']);
        expect(messages()[0]).toContain('redirect');
        expect(app.router.uri).toBe('/redirected');
    });

    test('any other error inside the navigation: MJX317 with the requested address, cancelled with reason error', async () => {
        start();
        await settle();
        await app.navigate('/ok');
        reported.length = 0;
        const module: any = (app as any).urlRoutingModule;
        const original = module.resolve;
        module.resolve = () => { throw new Error('resolve patladi'); };

        const result = await app.navigate('/mw');
        module.resolve = original;
        expect(result.ok).toBe(false);
        expect(result.cancelled).toBe(true);
        expect(result.reason).toBe('error');
        expect(result.uri).toBe('/mw');
        expect(result.error.message).toBe('resolve patladi');
        expect(codes()).toEqual(['MJX317']);
        expect(messages()[0]).toContain("'/mw'");
        expect(app.router.uri).toBe('/ok');
    });

    test('a successful navigation reports nothing', async () => {
        start({ middlewareThrows: true });
        await settle();
        reported.length = 0;
        const result = await app.navigate('/ok');
        expect(result.ok).toBe(true);
        expect(reported).toEqual([]);
    });
});
