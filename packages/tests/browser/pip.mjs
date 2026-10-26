import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { startBrowser } = await import(pathToFileURL(path.join(HERE, '..', '..', '..', 'demos', 'rich-bench', 'verify', 'headed.mjs')).href);
const PORT = +(process.env.PORT || 4322);
const srv = spawn('node', [path.join(HERE, 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));

const results = [];
const rec = (name, ok, detail) => { results.push([name, !!ok, detail ?? '']); };
const b = await startBrowser(9992);
try {
    const p = await b.open(`http://localhost:${PORT}/pages/pip.html`);
    await p.wait(500);
    const ua = await p.eval('navigator.userAgent');
    const supported = await p.eval('window.__pip.state.supports');
    rec('API var', supported, ua);
    if (supported) {
        const box = await p.eval(`(() => { const r = document.getElementById('open-pip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
        await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
        await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
        for (let i = 0; i < 40 && !(await p.eval('!!(window.__pip.state.handle || window.__pip.state.error)')); i++) await p.wait(100);
        const opened = await p.eval(`(() => { const s = window.__pip.state; const h = s.handle; return { error: s.error, kind: h && h.kind, open: h && h.isOpen, inWindow: h && window.__pip.b.element.ownerDocument === h.document, title: h && h.document.title, theme: h && h.document.documentElement.getAttribute('data-theme'), styles: h ? h.document.head.querySelectorAll('style').length : 0, order: window.__pip.order(), log: s.log.join(',') }; })()`);
        rec('PiP penceresi yönetici ile açıldı', !opened.error && opened.kind === 'pip' && opened.open && opened.inWindow, JSON.stringify(opened));
        rec('başlık, tema ve stil pencereye gitti', opened.title === 'Düzenleyici' && opened.theme === 'dark' && opened.styles >= 1, `title=${opened.title} theme=${opened.theme} styles=${opened.styles}`);
        const themed = await p.eval(`(async () => { document.documentElement.setAttribute('data-theme', 'light'); await new Promise(r => setTimeout(r, 100)); return window.__pip.state.handle.document.documentElement.getAttribute('data-theme'); })()`);
        rec('tema değişimi canlı yansır', themed === 'light', `theme=${themed}`);
        const routed = await p.eval(`(async () => { const h = window.__pip.state.handle; const link = h.document.createElement('a'); link.setAttribute('rel', 'router'); link.setAttribute('href', '#/b'); h.document.body.appendChild(link); link.dispatchEvent(new h.window.MouseEvent('click', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 150)); return { uri: window.__pip.app.router.uri, href: h.window.location.href }; })()`);
        rec('PiP\'teki rota bağlantısı sayfayı gezdirir', routed.uri === '/b' && routed.href === 'about:blank', JSON.stringify(routed));
        const closed = await p.eval(`(async () => { const h = window.__pip.state.handle; const result = await h.close(); await new Promise(r => setTimeout(r, 300)); return { returned: result.returned.length, order: window.__pip.order(), open: h.isOpen, pipGone: !window.documentPictureInPicture.window, list: window.__pip.app.windows.list.length }; })()`);
        rec('kapanınca içerik eski sırasına döner', closed.returned === 1 && closed.order === 'abc' && !closed.open && closed.pipGone && closed.list === 0, JSON.stringify(closed));
    }
    await p.closeTab();
} finally {
    await b.close();
    try { srv.kill(); } catch { }
}
let fail = 0;
for (const [n, ok, d] of results) { if (!ok) fail++; console.log(`${ok ? 'OK ' : 'FAIL'} ${n}${d ? '  ' + d : ''}`); }
console.log(`toplam ${results.length}, düşen ${fail}`);
process.exit(fail ? 1 : 0);
