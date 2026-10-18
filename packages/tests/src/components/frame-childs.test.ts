/**
 * @jest-environment jsdom
 */
import * as motif from '@motifx/core';
import { Component, ComponentBase, Frame, motifComponent } from '@motifx/core';

const jsx = require('../../../compiler/dist/index.cjs');
const CompilerCtor = jsx.Compiler || jsx.default?.Compiler || jsx.default;

function load(source: string, names: string[]): Record<string, any> {
    const out = new CompilerCtor().start(source, 'FrameChilds.tsx');
    expect(out).not.toBeNull();
    let code: string = out.code;
    code = code.replace(/import\s*\{([^}]*)\}\s*from\s*["']@motifx\/core["'];?/g, (_m: string, list: string) =>
        'const {' + list.replace(/\bas\b/g, ':') + '} = __motif;');
    const fn = new Function('__motif', `${code}\nreturn { ${names.join(', ')} };`);
    return fn(motif);
}

function mount(child: any): { host: HTMLElement; root: Component } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = new Component(host);
    root.build();
    root.controls.add(child);
    return { host, root };
}

function page(tag: string, text: string): Component {
    const c = new Component(tag);
    (c.element as HTMLElement).textContent = text;
    return c;
}

const source = `
import { Component, Frame } from '@motifx/core';

const seen = { frame: null, settings: null };

class Settings extends Component<HTMLDivElement> {
  view() { return <h2 class="settings">Ayarlar</h2>; }
}

class Profile extends Component<HTMLDivElement> {
  view() { return <h2 class="profile">Profil</h2>; }
}

class Panel extends Component<HTMLDivElement> {
  view() {
    return <section class="panel">
      <Frame ref={(f) => { seen.frame = f; }}>
        <Settings ref={(s) => { seen.settings = s; }} />
      </Frame>
    </section>;
  }
}
`;

describe('Frame: children given at construction are its first content', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    test('new Frame({ childs }) places the child and makes it current', async () => {
        const settings = page('p', 'ayarlar');
        const frame = new Frame({ childs: [settings] });
        const { host, root } = mount(frame);
        expect(host.innerHTML).toContain('<p>ayarlar</p>');
        expect(settings.parent).toBe(frame);
        expect(frame.current).toBe(settings);
        await root.dispose();
    });

    test('motifComponent(Frame, { childs }) keeps several children as one content that navigate replaces', async () => {
        const profile = page('p', 'profil');
        const badge = page('p', 'rozet');
        const frame: Frame = motifComponent(Frame, { childs: [profile, badge] });
        const { host, root } = mount(frame);
        expect(host.innerHTML).toContain('<p>profil</p><p>rozet</p>');
        const current = frame.current as ComponentBase[];
        expect(Array.isArray(current)).toBe(true);
        expect(current.length).toBe(2);
        expect(current[0]).toBe(profile);
        expect(current[1]).toBe(badge);
        const next = page('p', 'ayarlar');
        await frame.navigate(next);
        expect(profile.isDisposed).toBe(true);
        expect(badge.isDisposed).toBe(true);
        expect(host.innerHTML).toContain('<p>ayarlar</p>');
        expect(host.innerHTML).not.toContain('profil');
        expect(frame.current).toBe(next);
        await root.dispose();
    });

    test('<Frame>…</Frame> in JSX shows its children and navigate replaces them', async () => {
        const m = load(source, ['seen', 'Settings', 'Profile', 'Panel']);
        const { host, root } = mount(new m.Panel());
        expect(host.querySelector('section.panel h2.settings')).not.toBeNull();
        expect(m.seen.frame.current).toBe(m.seen.settings);
        await m.seen.frame.navigate(new m.Profile());
        expect(host.querySelector('section.panel h2.profile')).not.toBeNull();
        expect(host.querySelector('h2.settings')).toBeNull();
        expect(m.seen.settings.isDisposed).toBe(true);
        await root.dispose();
    });

    test('flush() disposes children given at construction like any other content', async () => {
        const draft = page('p', 'taslak');
        const frame = new Frame({ childs: [draft] });
        const { host, root } = mount(frame);
        expect(host.innerHTML).toContain('<p>taslak</p>');
        await frame.flush();
        expect(draft.isDisposed).toBe(true);
        expect(host.innerHTML).not.toContain('taslak');
        await root.dispose();
    });

    test('a Frame without children stays empty and its first navigate is synchronous', async () => {
        const frame = new Frame();
        const { host, root } = mount(frame);
        expect(frame.current).toBeNull();
        expect(frame.controls.items.length).toBe(0);
        const first = page('p', 'ilk');
        void frame.navigate(first);
        expect(host.innerHTML).toContain('<p>ilk</p>');
        expect(frame.current).toBe(first);
        await root.dispose();
    });
});
