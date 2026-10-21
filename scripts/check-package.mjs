import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const packageDir = path.resolve(process.argv[2] ?? '.');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const shell = process.platform === 'win32';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motif-pack-'));
let failed = false;

function run(label, cmd, args) {
    console.log(`\n> ${label}`);
    try {
        execFileSync(cmd, args, { cwd: packageDir, stdio: 'inherit', shell });
    } catch {
        failed = true;
        console.error(`✗ ${label} failed`);
    }
}


function entryFiles(pkg) {
    const out = [];
    for (const [sub, target] of Object.entries(pkg.exports ?? {})) {
        if (sub === './package.json' || typeof target !== 'object') continue;
        for (const kind of ['import', 'require']) {
            const file = typeof target[kind] === 'string' ? target[kind] : target[kind]?.default;
            if (file) out.push({ sub, kind, file: path.join(packageDir, file) });
        }
    }
    return out;
}

function checkEntryLoads(pkg) {
    const entries = entryFiles(pkg);
    for (const first of entries) {
        const rest = entries.filter(e => e.kind === first.kind && e !== first);
        const lines = [first, ...rest].map(e => e.kind === 'require'
            ? `exported(require(${JSON.stringify(e.file)}), ${JSON.stringify(e.sub)});`
            : `await import(${JSON.stringify(pathToFileURL(e.file).href)}).then(m => exported(m, ${JSON.stringify(e.sub)}));`);
        const script = `const exported = (m, sub) => { if (Object.keys(m).length === 0) throw new Error('no exports from ' + sub); };\n(async () => { ${lines.join(' ')} })().catch(e => { console.error(e); process.exit(1); });`;
        const file = path.join(outDir, `load-${first.kind}-${first.sub.replace(/[^a-z]/g, '') || 'index'}.${first.kind === 'require' ? 'cjs' : 'mjs'}`);
        fs.writeFileSync(file, script);
        run(`load ${first.kind}: ${first.sub} first, then the others`, 'node', [file]);
    }
}

function declaredNames(indexFile) {
    const names = new Set();
    const text = fs.readFileSync(indexFile, 'utf8');
    for (const m of text.matchAll(/export\s+(?:declare\s+)?(?:const|let|var|function|class|enum|abstract\s+class)\s+([\w$]+)/g)) names.add(m[1]);
    return names;
}

function resolveImport(from, spec) {
    const base = path.resolve(from, spec);
    for (const c of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (fs.existsSync(c)) return c;
    return null;
}

function checkBarrelImports() {
    const src = path.join(packageDir, 'src');
    if (!fs.existsSync(src)) return;
    const files = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(p) && !p.endsWith('.d.ts')) files.push(p); } })(src);
    const bad = [];
    for (const file of files) {
        if (path.basename(file) === 'index.ts') continue;
        if (path.dirname(file) === src && ['public.ts', 'internal.ts'].includes(path.basename(file))) continue;
        if (path.relative(src, file).startsWith('entries' + path.sep)) continue;
        const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, removeComments: true }, fileName: file }).outputText;
        for (const m of js.matchAll(/import\s+(\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)\s+from\s+["'](\.[^"']*)["']/g)) {
            const target = resolveImport(path.dirname(file), m[2]);
            if (!target || path.basename(target) !== 'index.ts') continue;
            const names = m[1].startsWith('{') ? m[1].slice(1, -1).split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean) : [m[1]];
            const declared = declaredNames(target);
            const extra = names.filter(n => !declared.has(n));
            if (extra.length) bad.push(`${path.relative(packageDir, file)}: ${extra.join(', ')} from "${m[2]}"`);
        }
    }
    console.log(`\n> barrel imports (${files.length} source files)`);
    if (bad.length) {
        failed = true;
        console.error('✗ value imports through an index that the index only re-exports (import the file directly):\n  ' + bad.join('\n  '));
    } else {
        console.log('every value import through an index names something the index declares itself');
    }
}

try {
    const packed = JSON.parse(execFileSync(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', outDir], { cwd: packageDir, encoding: 'utf8', shell }));
    const tarball = path.join(outDir, packed[0].filename);
    console.log(`packed ${packed[0].name}@${packed[0].version}: ${packed[0].entryCount} files, ${(packed[0].size / 1024).toFixed(1)} kB`);

    run('publint', npx, ['--no-install', 'publint', '--strict', tarball]);
    run('are the types wrong', npx, ['--no-install', 'attw', tarball]);
    checkEntryLoads(JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')));
    checkBarrelImports();
} finally {
    fs.rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
    process.exit(1);
}
console.log('\n✓ package checks passed');
