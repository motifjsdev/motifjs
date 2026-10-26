import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGES = path.join(HERE, 'pages');
const DIST = path.join(HERE, '..', '..', 'motifjs', 'dist');
const PORT = +(process.env.PORT || 4320);
const browsers = (process.argv[2] || 'chrome,firefox').split(',');
const pages = (process.argv[3] || 'other-document,windows').split(',');
const TIMEOUT = +(process.argv[4] || 90000);
const HEADLESS = process.env.HEADLESS !== '0';
const EXE = {
    chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    firefox: 'C:/Program Files/Mozilla Firefox/firefox.exe',
};

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.map': 'application/json', '.css': 'text/css' };
const reports = new Map();
const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'POST' && url.pathname === '/report') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            reports.set(`${url.searchParams.get('page')}@${url.searchParams.get('browser')}`, JSON.parse(body));
            res.writeHead(204); res.end();
        });
        return;
    }
    let file;
    if (url.pathname.startsWith('/dist/')) file = path.join(DIST, url.pathname.slice(6));
    else if (url.pathname.startsWith('/pages/')) file = path.join(PAGES, url.pathname.slice(7));
    else { res.writeHead(404); res.end(); return; }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(String(err)); return; }
        res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(data);
    });
});
await new Promise(r => server.listen(PORT, r));

const tmp = fs.mkdtempSync(path.join(HERE, '.profile-'));
function launch(browser, page) {
    const url = `http://localhost:${PORT}/pages/${page}.html?browser=${browser}&page=${page}`;
    const profile = fs.mkdtempSync(path.join(tmp, `${browser}-`));
    if (browser === 'chrome' || browser === 'edge') {
        return spawn(EXE[browser], [...(HEADLESS ? ['--headless=new'] : []), `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
            '--disable-popup-blocking', '--js-flags=--expose-gc', '--window-size=900,700', '--disable-features=Translate,OptimizationHints', url], { stdio: 'ignore' });
    }
    if (browser === 'firefox') {
        fs.writeFileSync(path.join(profile, 'user.js'), [
            'user_pref("dom.disable_open_during_load", false);',
            'user_pref("browser.shell.checkDefaultBrowser", false);',
            'user_pref("browser.startup.homepage_override.mstone", "ignore");',
            'user_pref("browser.aboutwelcome.enabled", false);',
            'user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);',
            'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
            'user_pref("browser.sessionstore.resume_from_crash", false);',
            'user_pref("app.update.enabled", false);',
        ].join('\n'));
        return spawn(EXE.firefox, [...(HEADLESS ? ['-headless'] : []), '-profile', profile, '-no-remote', '-new-window', url], { stdio: 'ignore' });
    }
    throw new Error('bilinmeyen tarayıcı: ' + browser);
}

let failed = 0;
for (const page of pages) {
    const procs = browsers.map(b => [b, launch(b, page)]);
    const start = Date.now();
    while (browsers.some(b => !reports.has(`${page}@${b}`)) && Date.now() - start < TIMEOUT) await new Promise(r => setTimeout(r, 300));
    for (const [, p] of procs) { try { execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore' }); } catch { } }
    for (const b of browsers) {
        const r = reports.get(`${page}@${b}`);
        console.log(`\n${page} / ${b}${r ? ': ' + r.ua : ': SONUÇ YOK (zaman aşımı)'}`);
        if (!r) { failed++; continue; }
        let fail = 0;
        for (const [name, v] of Object.entries(r.results)) {
            if (!v.ok) fail++;
            console.log(`  ${v.ok ? 'OK ' : 'FAIL'} ${name}${v.detail ? '  ' + v.detail : ''}`);
        }
        console.log(`  toplam ${Object.keys(r.results).length}, düşen ${fail}`);
        failed += fail;
    }
}
server.close();
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
process.exit(failed ? 1 : 0);
