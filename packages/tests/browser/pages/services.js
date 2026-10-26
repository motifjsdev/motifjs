import { Application, Component, FromService, reactive } from '/dist/index.esm.js';

const params = new URLSearchParams(location.search);
const auto = params.get('auto') === '1';
const browser = params.get('browser') || 'unknown';

class NoteStore {
    state = reactive({ count: 0, last: '' });
    add(from) { this.state.count++; this.state.last = from; }
}

const builder = Application.CreateBuilder();
builder.services.addSingleton(NoteStore, NoteStore);
const app = builder.build();
app.useRouter({ routes: [{ path: '/a', control: () => new Component('div') }, { path: '/b', control: () => new Component('div') }], mode: 'hash' });

class Panel extends Component {
    constructor(label) { super('section'); this.label = label; this.pings = 0; }
    onConfigured() {
        this.class.add('panel');
        this.store = this.getService(NoteStore);
    }
    onBuilt() {
        const title = new Component('h3'); title.setText(this.label); this.controls.add(title);
        const info = new Component('p'); this.controls.add(info);
        this.bindings.watch(() => info.setText(`sayaç ${this.store.state.count}, son artıran: ${this.store.state.last || '-'}`));
        const btn = new Component('button'); btn.setText('Sayacı artır'); btn.motif.on('click', () => this.store.add(this.label)); this.controls.add(btn);
        const ping = new Component('button'); ping.setText('Ping gönder'); ping.motif.on('click', () => this.context.fire('ping', { from: this.label })); this.controls.add(ping);
        const link = new Component('a'); link.attr.add({ rel: 'router', href: this.label === 'Sayfa' ? '#/a' : '#/b' }); link.setText(this.label === 'Sayfa' ? 'Rota /a' : 'Rota /b'); this.controls.add(link);
        this.log = new Component('pre'); this.controls.add(this.log);
        this.motif.setDisposable(this.context.on('ping', (e) => { this.pings++; this.log.setText(`${this.pings}. ping, gönderen: ${e.from}`); }));
        this.where = new Component('p'); this.controls.add(this.where);
        this.where.setText(this.whereAmI());
    }
    onActivated() { this.where.setText(this.whereAmI()); }
    whereAmI() {
        const doc = this.element.ownerDocument === document ? 'ana sayfa' : 'popup';
        return `belge: ${doc} | context aynı uygulamayı sarar (router aynı nesne): ${this.context.router === Application.main.router} | getService(NoteStore) === FromService(NoteStore): ${this.getService(NoteStore) === FromService(NoteStore)}`;
    }
}

const root = new Component('div');
const toolbar = new Component('div'); toolbar.class.add('toolbar');
const open = new Component('button'); open.setText('Düzenleyiciyi yeni pencerede aç'); toolbar.controls.add(open);
const pipButton = new Component('button'); pipButton.setText('Düzenleyiciyi PiP penceresinde aç'); toolbar.controls.add(pipButton);
if (!('documentPictureInPicture' in window)) { pipButton.attr.add({ disabled: 'disabled', title: 'Bu tarayıcıda Document Picture-in-Picture yok' }); }
const route = new Component('span'); route.class.add('route'); toolbar.controls.add(route);
root.controls.add(toolbar);
const page = new Panel('Sayfa');
const editor = new Panel('Düzenleyici');
root.controls.add(page, editor);
app.run(document.getElementById('app'), root);
app.onRouterChanged((e) => route.setText(`  rota: ${e.uri}`));
app.navigate('/a');

let popup = null;
function attachTo(win, title) {
    for (const sheet of document.querySelectorAll('style')) win.document.head.appendChild(sheet.cloneNode(true));
    win.document.title = title;
    const home = editor.parent;
    const host = new Component(win.document.body);
    host.build();
    host.controls.add(editor);
    const release = app.connectDocument(win.document);
    win.addEventListener('pagehide', () => { home.controls.add(editor); release(); });
    return win;
}
function openInWindow() {
    if (popup && !popup.closed) { popup.focus(); return popup; }
    popup = window.open('', '', 'popup,width=560,height=420');
    if (!popup) return null;
    return attachTo(popup, 'Düzenleyici penceresi');
}
async function openInPip() {
    const pip = await window.documentPictureInPicture.requestWindow({ width: 560, height: 420 });
    return attachTo(pip, 'Düzenleyici');
}
open.motif.on('click', () => openInWindow());
pipButton.motif.on('click', () => openInPip());
window.__demo = { app, root, page, editor, NoteStore, FromService, openInPip };

if (auto) {
    (async () => {
        const results = {};
        const rec = (k, ok, d) => { results[k] = { ok: !!ok, detail: d == null ? '' : String(d) }; };
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        try {
            await sleep(100);
            const p = openInWindow();
            await sleep(100);
            rec('popup açıldı', !!p && editor.element.ownerDocument === p.document, editor.where.element.textContent);
            p.document.querySelectorAll('button')[0].click();
            await sleep(50);
            rec('popup düğmesi servisi artırdı, sayfa paneli gördü', FromService(NoteStore).state.count === 1 && page.element.querySelector('p').textContent.includes('sayaç 1'), page.element.querySelector('p').textContent);
            page.element.querySelectorAll('button')[1].click();
            await sleep(50);
            rec('sayfadan ping popup paneline ulaştı', editor.log.element.textContent.includes('Sayfa'), editor.log.element.textContent);
            p.document.querySelectorAll('button')[1].click();
            await sleep(50);
            rec('popup\'tan ping sayfa paneline ulaştı', page.log.element.textContent.includes('Düzenleyici'), page.log.element.textContent);
            p.document.querySelector('a[rel=router]').dispatchEvent(new p.MouseEvent('click', { bubbles: true, cancelable: true }));
            await sleep(100);
            rec('popup\'taki rota bağlantısı sayfayı gezdirdi', app.router.uri === '/b' && p.location.href === 'about:blank', `uri=${app.router.uri}`);
            rec('popup\'ta context ve servis aynı', editor.where.element.textContent.includes('true') && !editor.where.element.textContent.includes('false'), editor.where.element.textContent);
            p.close();
            await sleep(300);
            rec('popup kapanınca panel sayfaya döndü', editor.element.ownerDocument === document && root.element.contains(editor.element), editor.where.element.textContent);
        } catch (e) { rec('HATA', false, e && e.stack); }
        await fetch('/report?browser=' + browser, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ua: navigator.userAgent, results }) });
    })();
}
