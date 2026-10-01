import { Application, Component, ComponentBase, reactive } from '@motifx/core';

const tick = () => new Promise<void>(r => setTimeout(r, 0));
const originalLower = String.prototype.toLocaleLowerCase;
const originalUpper = String.prototype.toLocaleUpperCase;

function makeInput(type: string, bind: (s: ComponentBase) => void) {
    return new Component('input', {
        onconfig: (s: ComponentBase) => bind(s),
        initializeComponent: (s: ComponentBase) => { s.attr.add({ type }); }
    } as any);
}

function mount(child: Component<any>) {
    const host = new Component<HTMLDivElement>('div');
    host.build();
    document.body.appendChild(host.element as unknown as Node);
    host.controls.add(child);
    return host;
}

describe('Turkish locale (tr-TR) string casing', () => {
    beforeAll(() => {
        String.prototype.toLocaleLowerCase = function (this: string, locales?: string | string[]) {
            return originalLower.call(this, locales ?? 'tr');
        } as any;
        String.prototype.toLocaleUpperCase = function (this: string, locales?: string | string[]) {
            return originalUpper.call(this, locales ?? 'tr');
        } as any;
    });

    afterAll(() => {
        String.prototype.toLocaleLowerCase = originalLower;
        String.prototype.toLocaleUpperCase = originalUpper;
    });

    afterEach(() => { document.body.innerHTML = ''; });

    it('emulates the Turkish dotless i', () => {
        expect('INPUT'.toLocaleLowerCase()).toBe('ınput');
    });

    it('writes a text input back to the model', async () => {
        const p = reactive({ displayName: 'Ekrem' });
        const input = makeInput('text', s => s.bindings.model(p, 'displayName'));
        mount(input);
        await tick();

        const el = input.element as unknown as HTMLInputElement;
        expect(el.value).toBe('Ekrem');

        el.value = 'Test';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(p.displayName).toBe('Test');

        p.displayName = 'Ayşe';
        await tick();
        expect(el.value).toBe('Ayşe');
    });

    it('binds a checkbox through checked in both directions', async () => {
        const p = reactive({ notifications: true });
        const cb = makeInput('checkbox', s => s.bindings.model(p, 'notifications'));
        mount(cb);
        await tick();

        const el = cb.element as unknown as HTMLInputElement;
        expect(el.checked).toBe(true);
        expect(el.getAttribute('value')).toBeNull();

        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await tick();
        expect(p.notifications).toBe(false);
    });

    it('writes a range input back to the model as a number', async () => {
        const p = reactive({ density: 3 });
        const range = makeInput('range', s => s.bindings.model(p, 'density'));
        mount(range);
        await tick();

        const el = range.element as unknown as HTMLInputElement;
        el.value = '5';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        expect(p.density).toBe(5);
    });

    it('runs lifecycle props whose names contain a capital I', async () => {
        const calls: string[] = [];
        const c = new Component('div', {
            onInitializing: () => calls.push('initializing'),
            onInitialized: () => calls.push('initialized'),
            initializeComponent: () => calls.push('initializeComponent')
        } as any);
        c.build();
        await tick();
        expect(calls).toEqual(expect.arrayContaining(['initializing', 'initialized', 'initializeComponent']));
    });

    it('keeps upper-case query values as written', async () => {
        const app = Application.CreateBuilder().build();
        const host = document.createElement('div');
        document.body.appendChild(host);
        app.useRouter({ routes: [{ path: '/', control: () => new Component('div') }, { path: '/p', control: () => new Component('div') }] });
        app.run(host);
        try {
            await app.navigate('/p?a=UNDEFINED&b=NULL&c=TRUE');
            const params = app.router.params as Record<string, any>;
            expect(params.a).toBe('UNDEFINED');
            expect(params.b).toBe('NULL');
            expect(params.c).toBe('TRUE');
        } finally {
            app.dispose();
        }
    });
});
