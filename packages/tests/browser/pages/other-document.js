import { Application, Component, MotifError } from '/dist/index.esm.js';
import { connectedDocuments } from '/dist/internal.esm.js';

const params = new URLSearchParams(location.search);
const browser = params.get('browser') || 'unknown';
const pageName = params.get('page') || 'other-document';
const results = {};
const out = document.getElementById('out');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 1500) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await sleep(10); return fn(); };
function record(name, ok, detail) { results[name] = { ok: !!ok, detail: detail == null ? '' : String(detail) }; out.textContent = JSON.stringify(results, null, 1); }

async function main() {
    const app = Application.CreateBuilder().build();
    app.useRouter({ routes: [{ path: '/a', control: () => new Component('div') }, { path: '/b', control: () => new Component('div') }], mode: 'hash' });
    const root = new Component('div');
    app.run(document.getElementById('app'), root);
    await app.navigate('/a');
    await sleep(50);

    const popup = window.open('', '', 'popup,width=520,height=420,left=960,top=40');
    if (!popup) { record('popup', false, 'window.open null (popup engeli)'); return; }
    await until(() => popup.document && popup.document.body);
    const pdoc = popup.document;
    pdoc.head.appendChild(document.querySelector('style').cloneNode(true));
    record('popup', true, 'about:blank, same origin');

    // A: realm
    const foreign = pdoc.createElement('div');
    const foreignIsPageElement = foreign instanceof Element;
    const c1 = new Component(foreign);
    c1.class.add('selected');
    c1.attr.add({ title: 'yabancı' });
    record('A realm: popup elemanını sarma ve class/attr', c1.element === foreign && foreign.classList.contains('selected') && foreign.getAttribute('title') === 'yabancı' && c1.class.has('selected') && c1.attr.get('title') === 'yabancı',
        `foreign instanceof page Element = ${foreignIsPageElement}`);

    // host in popup
    const host = new Component(pdoc.body);
    host.build();

    // F: onMounted in popup, once
    const log = [];
    class Row extends Component { constructor(tag) { super('section'); this.tag = tag; } onMounted() { log.push(this.tag + ':' + (this.element.ownerDocument === pdoc ? 'popup' : 'page') + ':' + this.element.isConnected); } }
    const row = new Row('grid');
    host.controls.add(row);
    const mountedInPopup = await until(() => log.length === 1);
    record('F onMounted popup kökünde', mountedInPopup && log[0] === 'grid:popup:true', JSON.stringify(log));

    // A2: adoption keeps class/attr working (Firefox prototype claim)
    const movedIsPageElement = row.element instanceof Element;
    row.class.add('moved');
    row.attr.add({ 'data-x': '1' });
    record('A2 taşınan elemanda class/attr', row.element.classList.contains('moved') && row.element.getAttribute('data-x') === '1' && row.element.ownerDocument === pdoc,
        `moved element instanceof page Element = ${movedIsPageElement}`);

    // F2: move back → no second fire
    root.controls.add(row);
    await sleep(100);
    record('F2 sayfaya geri alınca ikinci ateşleme yok', log.length === 1 && row.element.ownerDocument === document, JSON.stringify(log));
    host.controls.add(row);
    await sleep(50);

    // B: focus state in popup
    const input = pdoc.createElement('input');
    const cInput = new Component(input);
    host.controls.add(cInput);
    input.focus();
    await sleep(50);
    record('B odak durumu popup belgesinden', pdoc.activeElement === input && cInput.attr.getMethodState('focus') === true, `popup activeElement input = ${pdoc.activeElement === input}, page activeElement = ${document.activeElement && document.activeElement.tagName}`);

    // E: transition clock in popup
    const fx = new Component('div');
    fx.motif.options.transition.classes = { name: 'fx', duration: 60, css: true };
    host.controls.add(fx);
    await sleep(30);
    const t0 = performance.now();
    await fx.motif.hide();
    const dt = performance.now() - t0;
    record('E popup\'ta geçiş biter', !fx.isVisible && dt < 1000, `${dt.toFixed(0)} ms`);

    // D: router link in popup
    const release = app.connectDocument(pdoc);
    const link = pdoc.createElement('a');
    link.setAttribute('rel', 'router');
    link.setAttribute('href', '#/b');
    link.textContent = 'Siparişler';
    const cLink = new Component(link);
    host.controls.add(cLink);
    const beforeHref = popup.location.href;
    link.dispatchEvent(new popup.MouseEvent('click', { bubbles: true, cancelable: true }));
    const navigated = await until(() => app.router.uri === '/b');
    await sleep(50);
    record('D popup\'taki rel=router sayfanın router\'ını gezdirir', navigated && popup.location.href === beforeHref && pdoc.body.contains(host.element === pdoc.body ? link : link),
        `router.uri=${app.router.uri}, popup href ${popup.location.href}, page hash ${location.hash}`);

    // C: MJX417
    let code = '';
    try { app.connectDocument({}); } catch (e) { code = e instanceof MotifError ? e.code : String(e); }
    record('C MJX417 yanlış argümanda', code === 'MJX417', code);

    // GC (Chrome)
    if (typeof window.gc === 'function') {
        const keep = new Component(pdoc.createElement('p'));
        host.controls.add(keep);
        const child = pdoc.createElement('span');
        keep.element.appendChild(child);
        for (let i = 0; i < 3; i++) { window.gc(); await sleep(30); }
        keep.class.add('after-gc');
        keep.attr.add({ title: 'gc' });
        const viaDom = new Component(keep.element.firstChild);
        viaDom.class.add('child');
        record('GC sonrası class/attr', keep.element.classList.contains('after-gc') && keep.element.getAttribute('title') === 'gc' && keep.element.firstChild.classList.contains('child'),
            `firstChild instanceof page Element = ${keep.element.firstChild instanceof Element}`);
    } else {
        record('GC sonrası class/attr', true, 'window.gc yok, atlandı');
    }

    // pagehide on close
    const wasConnected = connectedDocuments().includes(pdoc);
    release();
    const r2 = app.connectDocument(pdoc);
    popup.close();
    await sleep(300);
    record('C2 popup kapanınca kendiliğinden kopar', wasConnected && !connectedDocuments().includes(pdoc), `closed=${popup.closed}`);
    r2();
}

main().catch(e => record('HATA', false, (e && e.stack) || String(e))).finally(async () => {
    await fetch(`/report?browser=${browser}&page=${pageName}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ua: navigator.userAgent, results }) });
    out.textContent += '\nraporlandı';
});
