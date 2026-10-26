import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGES = path.join(HERE, 'pages');
const DIST = path.join(HERE, '..', '..', 'motifjs', 'dist');
const PORT = +(process.argv[2] || 4321);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.map': 'application/json', '.css': 'text/css' };

http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'POST' && url.pathname === '/report') { req.on('data', () => { }); req.on('end', () => { res.writeHead(204); res.end(); }); return; }
    let file;
    if (url.pathname.startsWith('/dist/')) file = path.join(DIST, url.pathname.slice(6));
    else if (url.pathname.startsWith('/pages/')) file = path.join(PAGES, url.pathname.slice(7));
    else if (url.pathname === '/') { res.writeHead(302, { location: '/pages/services.html' }); res.end(); return; }
    else { res.writeHead(404); res.end(); return; }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(String(err)); return; }
        res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(data);
    });
}).listen(PORT, () => console.log(`http://localhost:${PORT}/pages/services.html  (Ctrl+C kapatır)`));
