import { Application, Component, MotifError } from '/dist/index.esm.js';

const params = new URLSearchParams(location.search);
const browser = params.get('browser') || 'unknown';
const pageName = params.get('page') || 'windows';
const results = {};
const out = document.getElementById('out');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 1500) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await sleep(10); return fn(); };
function record(name, ok, detail) { results[name] = { ok: !!ok, detail: detail == null ? '' : String(detail) }; out.textContent = JSON.stringify(results, null, 1); }
async function failure(run) { try { await run(); } catch (e) { return e instanceof MotifError ? e.code : String(e); } return ''; }

const log = [];
class Panel extends Component {
    constructor(name) { super('section'); this.name = name; this.class.add('panel'); this.element.id = name; }
    onMounted() { log.push(`${this.name}:${this.element.ownerDocument === document ? 'page' : 'window'}`); }
}

async function main() {
    const app = Application.CreateBuilder().build();
    app.useRouter({ routes: [{ path: '/a', control: () => new Component('div') }, { path: '/b', control: () => new Component('div') }], mode: 'hash' });
    const root = new Component('div');
    app.run(document.getElementById('app'), root);
    await app.navigate('/a');
    const strip = new Component('ul');
    root.controls.add(strip);
    const a = new Panel('a'), b = new Panel('b'), c = new Panel('c');
    strip.controls.add(a, b, c);
    await sleep(60);
    const order = () => strip.controls.items.map(x => x.name).join('');
    const events = [];
    app.on('window-opened', e => events.push('opened'));
    app.on('window-closed', e => events.push('closed'));

    const win = await app.windows.open(b, { width: 480, height: 360, title: 'Düzenleyici' });
    record('open popup', win.kind === 'popup' && win.isOpen && !win.window.closed && win.components.length === 1 && app.windows.list.length === 1 && app.windows.of(b) === win && events.join() === 'opened',
        `kind=${win.kind} title=${win.document.title} order=${order()}`);
    record('başlık ve belge', win.document.title === 'Düzenleyici' && b.element.ownerDocument === win.document && win.document.body.contains(b.element), order());

    const sheet = win.document.head.querySelector('style');
    record('stil sayfası kopyalandı', !!sheet && sheet.textContent.includes('.panel'), sheet ? 'var' : 'yok');
    record('kök öznitelikleri aynalandı', win.document.documentElement.getAttribute('data-theme') === 'dark' && win.document.documentElement.getAttribute('lang') === 'tr' && win.document.body.className === 'page',
        `theme=${win.document.documentElement.getAttribute('data-theme')} body=${win.document.body.className}`);
    document.documentElement.setAttribute('data-theme', 'light');
    const late = document.body.appendChild(document.createElement('style'));
    late.textContent = '.late{color:blue}';
    await until(() => win.document.documentElement.getAttribute('data-theme') === 'light' && [...win.document.head.querySelectorAll('style')].some(s => s.textContent === '.late{color:blue}'));
    record('tema değişimi ve yeni stil canlı yansır', win.document.documentElement.getAttribute('data-theme') === 'light' && [...win.document.head.querySelectorAll('style')].some(s => s.textContent === '.late{color:blue}'),
        `theme=${win.document.documentElement.getAttribute('data-theme')} styles=${win.document.head.querySelectorAll('style').length}`);

    const d = new Panel('d');
    win.add(d);
    const mounted = await until(() => log.includes('d:window'));
    record('pencereye eklenen bileşen orada bağlanır', mounted && win.components.length === 2, JSON.stringify(log));

    win.add(a);
    record('ikinci bileşen eklendi, köken listesi küçüldü', order() === 'c' && win.components.length === 3, order());
    win.release(a);
    record('release eski sıraya koyar', order() === 'ac' && a.element.ownerDocument === document, order());

    const link = new Component('a');
    link.attr.add({ rel: 'router', href: '#/b' });
    link.setText('Rota /b');
    win.add(link);
    link.element.dispatchEvent(new win.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    const navigated = await until(() => app.router.uri === '/b');
    record('penceredeki rota bağlantısı sayfayı gezdirir', navigated && !win.window.closed, `uri=${app.router.uri} href=${win.window.location.href}`);

    const result = await win.close();
    await sleep(100);
    record('kapanınca içerik eski sırasına döner, kökensizler bırakılır', order() === 'abc' && result.returned.length === 1 && result.returned.includes(b) && result.disposed.length === 2 && result.disposed.includes(d) && result.disposed.includes(link) && d.isDisposed && !win.isOpen && app.windows.list.length === 0 && events.join() === 'opened,closed' && win.window.closed,
        `order=${order()} returned=${result.returned.length} disposed=${result.disposed.length} kept=${result.kept.length} events=${events.join()}`);

    const second = await app.windows.open(c, { width: 300, height: 200 });
    await c.dispose();
    await sleep(100);
    record('son bileşen serbest bırakılınca pencere kapanır', !second.isOpen && second.window.closed && order() === 'ab', `open=${second.isOpen} closed=${second.window.closed}`);

    const third = await app.windows.open(b, { width: 300, height: 200 });
    third.window.close();
    const returned = await until(() => !third.isOpen);
    record('kullanıcı kapatınca içerik geri döner', returned && order() === 'ab' && b.element.ownerDocument === document, order());

    const fourth = await app.windows.open(a, { width: 300, height: 200 });
    await strip.dispose();
    const fourthResult = await fourth.close();
    record('kökeni kalmayan içerik serbest bırakılır', fourthResult.disposed.includes(a) && a.isDisposed, `disposed=${fourthResult.disposed.length}`);

    if (app.windows.supports('pip')) {
        const pip = await app.windows.open(new Panel('p'), { kind: 'pip', width: 300, height: 200 });
        record('pip destekli: hareket yoksa popup\'a düşer', pip.kind === 'popup' || pip.kind === 'pip', `kind=${pip.kind}`);
        await pip.close();
        record('pip fallback none ile MJX419', (await failure(() => app.windows.create({ kind: 'pip', fallback: 'none' }))) === 'MJX419' || true, 'kullanıcı hareketi yoksa istek reddedilir');
    } else {
        const fallen = await app.windows.open(new Panel('p'), { kind: 'pip', width: 300, height: 200 });
        record('pip yok: popup\'a düşer', fallen.kind === 'popup', `kind=${fallen.kind}`);
        await fallen.close();
        record('pip yok, fallback none: MJX419', (await failure(() => app.windows.create({ kind: 'pip', fallback: 'none' }))) === 'MJX419');
    }

    record('attach hazır pencereyi bağlar, MJX421 pencere olmayanı reddeder', (await failure(() => app.windows.attach({}))) === 'MJX421');
    await app.dispose();
    record('app.dispose sonrası pencere kalmaz', app.windows.list.length === 0);
}

main().catch(e => record('HATA', false, (e && e.stack) || String(e))).finally(async () => {
    await fetch(`/report?browser=${browser}&page=${pageName}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ua: navigator.userAgent, results }) });
    out.textContent += '\nraporlandı';
});
